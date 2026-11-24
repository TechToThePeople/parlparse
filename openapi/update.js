#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/update.js — is there anything new to import, and import only that?
 *
 * A plenary day publishes four documents, all plain entries in the Open Data API,
 * so their existence is a status code — no headless browser, no WAF challenge
 * (the browser is only needed to *download* the XML from doceo, which is the
 * fallback path anyway):
 *
 *   PV-10-<date>-RCV   VOTE_ROLLCALL_PLENARY   the roll-call results
 *   PV-10-<date>-ATT   LIST_ATTEND_PLENARY     the attendance list
 *   PV-10-<date>-VOT   VOTE_RESULTS_PLENARY    every vote, roll-call or not
 *   PV-10-<date>       MINUTES_PLENARY         the minutes (nothing imports them)
 *
 * The local column says what this database already holds, so the interesting
 * value is `new`: published, not imported yet — run update.sh.
 *
 * Usage:
 *   node openapi/update.js [--days N] [--date YYYY-MM-DD] [--json] [--sync]
 */

const fs = require("fs");
const path = require("path");
const minimist = require("minimist");
const db = require("../lib/db");
// the importers are modules: run(options) does what their CLI does, in-process
const decisions = require("./decisions");
const rcv = require("./rcv");
const att = require("./att");
const votXml = require("./vot-xml");
const agenda = require("./agenda");
// the builders: CSV files, the per-vote cards, and the SQL aggregates
const csvBuilder = require("../csv");
const cards = require("../cards");
const sqlRun = require("../sql/run");
const report = require("./report");
const oeil = require("../ai/oeil");
const split = require("../ai/split");
const amendments = require("../ai/amendments");

const API = "https://data.europarl.europa.eu/api/v2";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0 Safari/537.36";

const argv = minimist(process.argv.slice(2), {
  boolean: ["help", "json", "sync", "forthcoming"],
  // a periodic run must not spend a fortune on summaries: at most 20 documents
  // per run, 0 to disable the AI pass entirely
  default: { forthcoming: true, "ai-max-doc": "20" },
  string: ["date", "ai-max-doc"],
  alias: { h: "help", n: "days" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/update.js [options]

Says whether the RCV, ATT, VOT and MINUTES documents of the recent sittings are
published, and whether this database already has them.

  --days, -n N     how many of the most recent sitting dates to look at
                   (default 3, today included, never a future one)
  --date <d>       one date instead
  --json           machine-readable output
  --no-forthcoming leave out the sittings that have not happened yet
  --ai-max-doc N   documents the AI pass may summarise after an import
                   (default 20; 0 disables it)
  --sync           import what is new, then rebuild the CSVs and cards
  --help, -h       this text
`);
  process.exit(0);
}

/** The four documents of a sitting, and what says we already have one. */
const DOCUMENTS = [
  {
    key: "RCV",
    suffix: "-RCV",
    have: (m) => m.positions > 0,
    sizeOf: (m) => m.rcvSize,
  },
  {
    key: "ATT",
    suffix: "-ATT",
    have: (m) => m.attended > 0,
    sizeOf: (m) => m.attSize,
  },
  { key: "VOT", suffix: "-VOT", have: (m) => m.vot, sizeOf: (m) => m.votSize },
  { key: "MIN", suffix: "", have: null }, // minutes: nothing imports them
];

/** Uncompressed size of one of our gzip files (the last 4 bytes hold it). */
function inflatedSize(file) {
  try {
    const buf = fs.readFileSync(file);
    return buf.readUInt32LE(buf.length - 4);
  } catch {
    return null;
  }
}

/**
 * A repeated flag is an array in minimist (`--days=2 --days=5` → [2, 5]), which is
 * what happens when update.sh appends "$@" after its own defaults: the last value
 * wins, the one the caller typed.
 */
function lastOf(value) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

/** 200 = published, 404 = not yet, anything else = could not tell. */
async function published(date, suffix) {
  try {
    const res = await fetch(
      `${API}/documents/PV-10-${date}${suffix}?format=application/ld%2Bjson`,
      {
        headers: { Accept: "application/ld+json", "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (res.status === 404) return { status: "" };
    if (res.status !== 200) return { status: `?${res.status}` };
    const doc = ((await res.json()).data || [])[0] || {};
    let lang = null;
    let size = null;
    for (const expression of doc.is_realized_by || []) {
      const code = String(expression.language || "")
        .split("/")
        .pop();
      const english = code === "ENG";
      for (const m of expression.is_embodied_by || []) {
        if (!/\.xml$/i.test(String(m.is_exemplified_by || ""))) continue;
        if (!lang || english) {
          lang = code || null;
          size = Number(m.byteSize) || null;
        }
        if (english) break;
      }
    }
    return { status: "published", lang, size };
  } catch {
    return { status: "?net" };
  }
}

/** What this database already holds for that date. */
async function local(date) {
  const plenary = await db("plenaries")
    .where("date", date)
    .first("id", "sitting_id");
  // every vote this database has for the sitting, by how it was taken: a row can
  // exist without the RCV document (an electronic roll-call, a show of hands)
  const byMethod = plenary
    ? await db("rollcalls")
        .where("plenary", plenary.id)
        .select("method")
        .count("* as n")
        .groupBy("method")
    : [];
  const counts = {};
  for (const row of byMethod) counts[row.method || "?"] = Number(row.n);
  const positions = plenary
    ? (
        await db.raw(
          `SELECT count(*) AS n FROM positions p
             JOIN rollcalls r ON r.id = p.rollcall
            WHERE r.plenary = ?`,
          [plenary.id]
        )
      )[0].n
    : 0;
  const attended = plenary?.sitting_id
    ? (
        await db("attendances")
          .where({ sitting_id: plenary.sitting_id, status: "attended" })
          .count("* as n")
          .first()
      ).n
    : 0;
  // openapi/vot-xml.js caches the VOT XML, which is what its import reads
  const votFile = path.join(__dirname, "..", "data", "VOT", `${date}.xml`);
  const vot = fs.existsSync(votFile);
  const votSize = vot ? fs.statSync(votFile).size : null;
  const rcvSize = inflatedSize(
    path.join(__dirname, "..", "data", "RCV", `${date}.xml.zip`)
  );
  const attSize = inflatedSize(
    path.join(__dirname, "..", "data", "ATT", `${date}.xml.zip`)
  );
  const planned = (
    await db("agenda_items")
      .where({ date, kind: "vote" })
      .count("* as n")
      .first()
  ).n;
  return {
    counts,
    positions,
    attended,
    vot,
    votSize,
    rcvSize,
    attSize,
    planned,
  };
}

/**
 * The N most recent sitting dates, today included, oldest first. A sitting is a
 * date in `agenda_items` (planned) or in `plenaries` (known), and only dates up
 * to today — a sitting that has not happened has no documents to check.
 */
async function recentSittings(count) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.raw(
    `SELECT date FROM agenda_items WHERE date <= ?
     UNION
     SELECT date FROM plenaries  WHERE date <= ?
     ORDER BY date DESC LIMIT ?`,
    [today, today, count]
  );
  return rows.map((r) => r.date).sort();
}

/**
 * The sittings after today whose agenda is published (max 4). A date only in
 * `plenaries` has no agenda yet, so there is nothing to check and nothing planned
 * to show.
 */
async function forthcomingSittings(limit = 4) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.raw(
    `SELECT date FROM agenda_items WHERE date > ?
     UNION
     SELECT date FROM plenaries  WHERE date > ?
     ORDER BY date ASC LIMIT ?`,
    [today, today, limit]
  );
  return rows.map((r) => r.date);
}

/** One row per date: the four document statuses and what we already have. */
async function readStatus(dates) {
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const date of dates) {
    const mine = await local(date);
    const docs = {};
    // a sitting that has not happened cannot have documents: leave the cells
    // empty rather than asking four times for a 404
    for (const doc of DOCUMENTS)
      docs[doc.key] =
        date > today
          ? ""
          : statusOf(doc, await published(date, doc.suffix), mine);
    out.push({ date, ...mine, docs });
  }
  return out;
}

/** ok = published and here, new = published not imported, pub = not imported ever. */
/** ok = published and here, new = published not imported, pub = not imported ever. */
function statusOf(doc, published, mine) {
  if (published.status !== "published") return published.status;
  if (!doc.have) return "pub";
  if (!doc.have(mine)) return "new";
  // the EP republishes (French first, English later): a different size means our
  // copy is not the document that is there now
  const ours = doc.sizeOf ? doc.sizeOf(mine) : null;
  if (ours && published.size && ours !== published.size) return "new";
  // and say so when the version we hold is not the English one
  if (published.lang && published.lang !== "ENG")
    // FRA -> fr, MUL -> mul: the language of the version we hold
    return published.lang === "MUL"
      ? "mul"
      : published.lang.slice(0, 2).toLowerCase();
  return "ok";
}

const votPath = (date) =>
  path.join(__dirname, "..", "data", "VOT", `${date}.xml`);

/** Run one importer, keeping the loop going when it throws. */
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.warn(`   ⚠️  ${name}: ${e.message}`);
  }
}

/**
 * Import only what is missing: each new document with its own script, then the
 * derived files (CSVs, cards for those dates) once.
 */
async function sync(rows) {
  const dates = rows
    .filter((r) => Object.values(r.docs).includes("new"))
    .map((r) => r.date);
  // nothing to do: the table above already said so
  if (!dates.length) return [];
  console.log(`\n→ importing ${dates.length} sitting(s): ${dates.join(" ")}\n`);

  for (const [i, date] of dates.entries()) {
    const row = rows.find((r) => r.date === date);
    console.log(`\n[${i + 1}/${dates.length}] ${date}`);
    // decisions first: it creates the row of every vote taken that day (hand and
    // electronic ones included), which the XML importers then enrich
    await step("decisions", () => decisions.run({ date }));
    // "new" also covers a document that was republished (the EP adds the other
    // languages later), so force re-reads it instead of the cached copy
    if (row.docs.RCV === "new")
      await step("rcv", () => rcv.run({ _: [date], force: true }));
    if (row.docs.ATT === "new")
      await step("att", () => att.run({ _: [date], force: true }));
    // VOT is the authority on how a vote was taken (ROLL_CALL vs ELECTRONICAL),
    // and decisions.js re-applies the API's ambiguous decision_method each run —
    // so vot-xml has to run again, not only when the document is new. Its XML is
    // cached after the first import, so this costs a local parse.
    if (row.docs.VOT === "new")
      await step("vot-xml", () => votXml.run({ _: [date], force: true }));
    else if (fs.existsSync(votPath(date)))
      await step("vot-xml", () => votXml.run({ _: [date] }));
    // the agenda's "planned" votes become "voted" once the roll-calls are in
    await step("agenda", () => agenda.run({ date }));
  }

  console.log("\n→ derived files");
  // only now: the agenda of the next sittings, the report rows (and their
  // procedure/subjects), the CSVs, the cards of those dates and the SQL aggregates
  await step("agenda --upcoming", () => agenda.run({ upcoming: true }));
  await step("report.js", () => report.run({}));
  // summaries for the reports that have none yet, at most ai-max-doc of them
  const aiMax = Number(lastOf(argv["ai-max-doc"]));
  if (aiMax > 0)
    await step("ai/oeil", () => oeil.run({ "ai-max-doc": String(aiMax) }));
  else console.log("   · ai/oeil skipped (--ai-max-doc 0)");
  // the texts that come from the report's own document (paragraphs, recitals) and
  // from the amendment range documents — both cached locally after the import
  await step("ai/split", () => split.run({}));
  await step("ai/amendments", () => amendments.run({ limit: 20 }));
  await step("csv.js", () => csvBuilder.run());
  for (const date of dates)
    await step(`cards ${date}`, () => cards.run({ date }));
  await step("majority:csv", () => sqlRun.run());
  console.log("\nnext: sh prod.sh (publishes the CSVs to ../10/data)");
  return dates;
}

async function main() {
  let dates = [];
  if (argv.date) dates = [lastOf(argv.date)];
  else {
    dates = await recentSittings(Number(lastOf(argv.days)) || 3);
    // A forthcoming sitting costs four requests that answer 404 — ~0.8 s — and
    // is the only way to see "planned, nothing published yet".
    if (argv.forthcoming) dates = dates.concat(await forthcomingSittings());
  }

  const out = await readStatus(dates);

  if (argv.sync) {
    // what was found, then what was done — the table is the point of the check
    printStatus(out);
    const imported = await sync(out);
    if (imported.length) {
      console.log("\n→ after the import:");
      printStatus(await readStatus(imported));
    }
    await db.destroy();
    return;
  }

  if (argv.json) {
    console.log(JSON.stringify(out, null, 1));
    await db.destroy();
    return;
  }

  printStatus(out);
  await db.destroy();
}

/**
 * What we hold for a sitting: the vote rows by method (only the non-zero ones),
 * then positions and attendance. A future sitting only has its planned votes.
 */
function localText(row) {
  const parts = [];
  for (const method of ["RCV", "HAND", "ELECTRONIC", "SECRET"]) {
    const n = row.counts[method] || 0;
    if (n) parts.push(`${n} ${method}`);
  }
  if (row.positions) parts.push(`${row.positions} pos`);
  if (row.attended) parts.push(`${row.attended} attended`);
  if (!parts.length && row.planned) return `planned: ${row.planned} vote(s)`;
  return parts.join(" · ");
}

/** The table: one line per sitting, four documents and the local counts. */
function printStatus(out) {
  const pad = (v, n) => String(v).padEnd(n);
  console.log(
    `${pad("date", 12)}${pad("RCV", 5)}${pad("ATT", 5)}${pad("VOT", 5)}${pad(
      "MIN",
      5
    )}local`
  );
  for (const r of out) {
    const local = localText(r);
    console.log(
      `${pad(r.date, 12)}${pad(r.docs.RCV, 5)}${pad(r.docs.ATT, 5)}${pad(
        r.docs.VOT,
        5
      )}${pad(r.docs.MIN, 5)}${local}`
    );
  }

  const pending = out.filter((r) => Object.values(r.docs).includes("new"));
  if (pending.length)
    console.log(
      `\n→ ${pending.length} sitting(s) with a document published but not imported: run ./update.sh`
    );
  else
    console.log(
      "\n→ nothing to import.   ok = published and here · pub = published (nothing " +
        "imports the minutes) · new = published, not imported · blank = not " +
        "published, or a sitting that has not happened · ?nnn = the API did not answer"
    );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
