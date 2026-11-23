#!/usr/bin/env node
/**
 * The agenda of a sitting — what will be voted, and what was.
 *
 * `GET /api/v2/meetings/MTG-PL-<date>/foreseen-activities` returns one entry per
 * agenda point, past or future:
 *
 *   activity_id      MTG-PL-2026-11-24-OJ-ITM-V-29
 *   activity_order   9.0                  the agenda point
 *   notation_agendaPoint  V-29
 *   had_activity_type     …/PLENARY_VOTE  or …/PLENARY_DEBATE
 *   activity_label.en     the topic
 *   structuredContent.en  the report, the procedure, the committees:
 *                         <label typeof="def/ep-document-types/REPORT"
 *                                resource="doc/A-10-2026-0041">A10-0041/2026</label>
 *
 * Stored in `agenda_items` with status 'planned'; when a rollcall for that report
 * and date exists the same row becomes 'voted' and points at it. Membership of a
 * report that does not exist yet is created from the document API, so the report
 * page is there before the vote.
 *
 * Usage:
 *   node openapi/agenda.js --upcoming        next sittings (default 3 dates)
 *   node openapi/agenda.js --date 2026-11-24
 *   node openapi/agenda.js --all             every sitting of the term
 *   node openapi/agenda.js --minutes         also the sittings with no votes
 *
 *   --force      re-fetch agenda points of dates already stored
 *   --dry        fetch and print, write nothing
 *   --sleep      ms between requests (default 700)
 */
"use strict";

const minimist = require("minimist");
const db = require("../lib/db");
const { apiFetch } = require("./lib");

const TERM = 10;

const argv = minimist(process.argv.slice(2), {
  boolean: ["all", "upcoming", "minutes", "today", "force", "dry", "help"],
  string: ["date", "sleep", "limit"],
  alias: { h: "help" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/agenda.js [options]

  --today          today's sitting, or yesterday's if today has none; exits 3
                   when there is neither (update.sh uses that to stop early)
  --date <d>       one sitting (2026-11-24)
  --upcoming       the next sittings (3 dates, or --limit N)
  --all            every sitting of the term
  --minutes        include the sittings that have minutes but no votes
  --force          re-fetch dates already stored
  --dry            print, write nothing
  --sleep          ms between requests (default 700)
  --help, -h
`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a JSON-LD resource through the shared apiFetch (browser User-Agent, 429 and
 * 5xx retried). A 404 and a 204 both mean "nothing to say", not an error.
 */
async function get(path, params = {}) {
  try {
    return await apiFetch(path, params);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/** A-10-2026-0041 -> A10-0041/2026 */
const referenceOf = (identifier) => {
  const m = String(identifier || "").match(
    /^([A-Z]+)-(\d+)-(\d{4})-(\d{4})(?:$|-)/
  );
  return m ? `${m[1]}${m[2]}-${m[4]}/${m[3]}` : null;
};

const tagText = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
};

/** The report / procedure / committees named by one structuredContent block. */
function parseStructured(xml) {
  if (!xml) return {};
  const report = (xml.match(
    /typeof="def\/ep-document-types\/REP[A-Z_]*" resource="doc\/([^"]+)"/
  ) || [])[1];
  const proc = (xml.match(/typeof="proc" resource="proc\/([^"]+)"/) || [])[1];
  const committees = [...xml.matchAll(/typeof="org" resource="org\/([^"]+)"/g)]
    .map((m) => m[1])
    .join(", ");
  return {
    title: tagText(xml, "title"),
    report: referenceOf(report),
    procedure: proc ? proc.replace("-", "/") : null,
    committees: committees || null,
  };
}

const kindOf = (activityType) => {
  const type = String(activityType || "");
  if (type.endsWith("PLENARY_VOTE")) return "vote";
  if (type.includes("PLENARY_DEBATE")) return "debate";
  // a meeting part is a slot in the day ("PLENARY SESSION VOTES 12:00-13:00")
  if (type.endsWith("MEETING_PART")) return "part";
  return "other";
};

const stats = {
  dates: 0,
  plenariesCreated: 0,
  items: 0,
  reportsCreated: 0,
  voted: 0,
  failed: 0,
};

/** A plenaries row for the date, created when it does not exist yet. */
async function ensurePlenary(date, source) {
  const row = await db("plenaries").where("date", date).first("id", "date");
  if (row) return row.id;
  stats.plenariesCreated++;
  if (argv.dry) return null;
  const [id] = await db("plenaries").insert({
    date,
    term: TERM,
    source,
    status: "provisional",
  });
  return id;
}

/**
 * A forthcoming vote names a report we may not have yet: stub the row with what
 * the agenda gives, and leave the metadata to openapi/report.js (title,
 * date, committees, procedure) which finds the document in the API.
 */
async function stubReport(reference, title) {
  if (!reference) return;
  const existing = await db("reports")
    .where("reference", reference)
    .first("id");
  if (existing) return;
  stats.reportsCreated++;
  if (argv.dry) {
    console.log(
      `   + report stub ${reference}: ${String(title || "").slice(0, 60)}`
    );
    return;
  }
  await db("reports").insert({
    reference,
    title: title || null,
    term: TERM,
  });
  console.log(
    `   + report stub ${reference}: ${String(title || "").slice(0, 60)}`
  );
}

/** Agenda points of one sitting, plus the link to the vote they produced. */
async function processDate(date, source) {
  stats.dates++;
  const plenary = await ensurePlenary(date, source);
  const json = await get(
    `/meetings/MTG-PL-${date}/foreseen-activities?limit=200&format=application/ld%2Bjson`
  );
  await sleep(Number(argv.sleep || 700));
  const activities = (json && json.data) || [];
  if (!activities.length) {
    console.log(`   ⚠️  ${date}: no agenda published`);
    stats.failed++;
    return;
  }

  const votes = await db("rollcalls").whereRaw("substr(date, 1, 10) = ?", [
    date,
  ]);
  const byRef = new Map();
  for (const v of votes) if (v.ref && !byRef.has(v.ref)) byRef.set(v.ref, v.id);

  // The time lives on the meeting part; `consists_of` says which agenda points
  // are scheduled inside it, so an item inherits its part's start and end.
  const parts = new Map();
  for (const a of activities) {
    if (kindOf(a.had_activity_type) !== "part") continue;
    parts.set(a.activity_id, {
      start: a.activity_start_date || null,
      end: a.activity_end_date || null,
    });
  }
  const partOf = new Map();
  for (const a of activities) {
    for (const child of a.consists_of || []) {
      const id = String(child).replace(/^eli\/dl\/event\//, "");
      if (parts.has(a.activity_id)) partOf.set(id, a.activity_id);
    }
  }

  let count = 0;
  for (const a of activities) {
    const kind = kindOf(a.had_activity_type);
    if (kind === "other") continue;
    const structured = (a.structuredContent || {}).en || "";
    const parsed = parseStructured(structured);
    const part = kind === "part" ? a.activity_id : partOf.get(a.activity_id);
    const times = parts.get(part) || {};
    const row = {
      id: a.activity_id,
      plenary,
      date,
      agenda_order: a.activity_order ? String(a.activity_order) : null,
      notation: a.notation_agendaPoint || null,
      kind,
      title: (a.activity_label || {}).en || parsed.title || null,
      report: parsed.report,
      start:
        kind === "part" ? a.activity_start_date || null : times.start || null,
      end: kind === "part" ? a.activity_end_date || null : times.end || null,
      part: kind === "part" ? null : part || null,
      raw: structured || null,
      updated_at: new Date().toISOString(),
    };
    if (row.report && byRef.has(row.report)) stats.voted++;
    count++;
    // the report is only stubbed here: procedure, committees and the rest are
    // filled by openapi/report.js from the document API
    if (kind === "vote" && row.report) await stubReport(row.report, row.title);
    if (argv.dry) continue;
    await db("agenda_items").insert(row).onConflict("id").merge();
  }
  stats.items += count;
  console.log(
    `   ${date}: ${count} agenda point(s)` +
      (argv.dry ? " (dry)" : "") +
      `, ${votes.length} vote(s) matched`
  );
}

/**
 * The sitting dates the API knows about. The meetings endpoint answers oldest
 * first and its parliamentary-term filter does not narrow it down, so ask year by
 * year (2024 onwards is this term).
 */
async function meetingDates() {
  const thisYear = new Date().getFullYear();
  const dates = [];
  for (let year = 2024; year <= thisYear + 1; year++) {
    const json = await get("/meetings", { year, limit: 500 });
    await sleep(300);
    for (const m of (json && json.data) || []) {
      const found = String(m.activity_id || m.id || "").match(
        /(\d{4}-\d{2}-\d{2})/
      );
      if (found) dates.push(found[1]);
    }
  }
  return [...new Set(dates)].sort();
}

async function main() {
  let dates = [];
  if (argv.today) {
    // a sitting day answers with activities, a day without one answers 204
    const today = new Date();
    const day = (d) => d.toISOString().slice(0, 10);
    const candidates = [day(today), day(new Date(today.getTime() - 86400000))];
    for (const candidate of candidates) {
      const json = await get(
        `/meetings/MTG-PL-${candidate}/foreseen-activities`,
        { limit: 200 }
      );
      await sleep(Number(argv.sleep || 700));
      if (json && (json.data || []).length) dates.push(candidate);
    }
    if (!dates.length) {
      console.log(
        `🛑 no sitting on ${candidates[0]} nor ${candidates[1]} — nothing to update`
      );
      process.exit(3);
    }
  } else if (argv.date) dates = [argv.date];
  else if (argv.all) dates = await meetingDates();
  else if (argv.upcoming) {
    const today = new Date().toISOString().slice(0, 10);
    const all = await meetingDates();
    dates = all.filter((d) => d >= today).slice(0, Number(argv.limit || 3));
  } else if (argv.minutes) {
    // sittings the minutes mention but that no vote ever created a row for
    const json = await get("/documents", {
      "work-type": "MINUTES_PLENARY",
      "parliamentary-term": TERM,
      limit: 1000,
    });
    const known = new Set(
      (await db("plenaries").select("date")).map((p) => p.date)
    );
    dates = [
      ...new Set(
        ((json && json.data) || [])
          .map((d) => String(d.identifier || "").match(/(\d{4}-\d{2}-\d{2})/))
          .map((m) => m && m[1])
          .filter(Boolean)
          .filter((d) => !known.has(d))
      ),
    ].sort();
  } else {
    console.log("nothing to do: --date, --upcoming, --all or --minutes");
    process.exit(1);
  }

  console.log(`📅 ${dates.length} sitting(s)`);
  for (const date of dates) await processDate(date, "agenda");

  console.log(
    `\n${stats.items} agenda point(s) over ${stats.dates} sitting(s), ` +
      `${stats.plenariesCreated} plenaries row(s) created, ` +
      `${stats.reportsCreated} report(s) created, ${stats.voted} already voted, ` +
      `${stats.failed} failure(s)`
  );
  await db.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
