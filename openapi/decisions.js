#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/decisions.js — Import all decisions for a plenary sitting from the
 * EP Open Data API into the term10.db database.
 *
 * For each sitting date:
 *   1. Ensures a row exists in the `plenaries` table
 *   2. Fetches ALL decisions (roll-call, hand, electronic) from the OpenAPI
 *   3. Upserts each decision into the `rollcalls` table with full metadata
 *      (method, requested_by, doc_ref, vote_type, attendees)
 *   4. Reports: new rows inserted, existing rows updated, totals by method
 *
 * Usage:
 *   node openapi/decisions.js 2024-07-17
 *   node openapi/decisions.js --all
 *   node openapi/decisions.js --help
 */

const minimist = require("minimist");
const db = require("../lib/db");
const { cleanRef } = require("../lib/refs");
const {
  fetchMeetingByDate,
  fetchDecisions,
  fetchDocumentList,
  extractDateFromId,
  getWaf,
  RCV_DIR,
  saveRcvXml,
  pushRcv,
  methodName,
  normalizeRequestedBy,
} = require("./lib");

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/** Raw RCV XML file behind a plenary date (same URL rcv.js downloads). */
function rcvUrl(date) {
  return `https://www.europarl.europa.eu/doceo/document/PV-10-${date}-RCV_EN.xml`;
}

/**
 * Resolve the date argument: "YYYY-MM-DD", or a day offset from today
 * (0 = today, -1 = yesterday, 1 = tomorrow).
 */
function normalizeDate(input) {
  const s = String(input).trim();
  if (/^-?\d+$/.test(s)) {
    const d = new Date();
    d.setDate(d.getDate() + Number(s));
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return s;
}

/**
 * Force-download the RCV XML via the WAF browser and gzip it to
 * data/RCV/<date>.xml.zip. Best effort: returns the path, or null on failure.
 */
async function downloadRcv(date) {
  const url = rcvUrl(date);
  console.log(`📥 downloading RCV: ${url}`);
  try {
    const result = await getWaf().downloadViaBrowser(url);
    if (
      result.status !== 200 ||
      !result.body.includes("<PV.RollCallVoteResults")
    ) {
      console.warn(`   ⚠️  HTTP ${result.status} — not valid RCV XML, skipped`);
      return null;
    }
    return saveRcvXml(date, result.body);
  } catch (e) {
    console.warn(`   ⚠️  download failed: ${e.message}`);
    return null;
  }
}

// A bare day offset (e.g. "-1") looks like a flag to minimist; rewrite it as
// --date=<n> so it survives parsing. Positive offsets parse as positionals.
const argv = minimist(
  process.argv.slice(2).map((a) => (/^-\d+$/.test(a) ? `--date=${a}` : a)),
  {
    alias: { h: "help", a: "all", d: "date", f: "fetch" },
    boolean: ["rollcall", "fix-refs"],
    default: { rollcall: true },
  }
);

if (require.main === module && argv.help) {
  console.log(`
Usage:
  node openapi/decisions.js [options] [<date>]

Arguments:
  <date>     YYYY-MM-DD, or a day offset: 0 = today, -1 = yesterday, 1 = tomorrow

Options:
  --all, -a     Process all available plenary dates
  --date, -d <date>   Alternative to positional arg (same format)
  --fetch, -f   Also fetch raw JSON files (calls rcv.js, vot.js, att.js)
  --download    Force-download the RCV XML (compressed) for the date(s)
  --push        scp the RCV archive to kundera (with --download, after it)
  --rollcall    Import roll-call votes too (default: true, disable with --no-rollcall)
  --fix-refs    Only repair rollcalls.ref from the decisions' headings
  --force       Re-download even if already cached
  --help, -h    Show this help

Description:
  Import decisions from the EP Open Data API into the database.
  Fills the method, requested_by, doc_ref, vote_type, and attendees
  columns in the rollcalls table.
  With --fetch, also saves raw JSON for roll-call votes, vote results,
  and attendance lists to data/openapi/.
  With --download, force-downloads the compressed RCV XML to data/RCV/;
  combine with --push to copy it to kundera.
`);
  process.exit(0);
}

/**
 * Correct `rollcalls.ref` from the decisions' heading/reference text, without
 * re-importing anything else (a --force run would overwrite the requested_by
 * values that come from the VOT XML remarks).
 */
async function fixRefs(dates) {
  let fixed = 0;
  let checked = 0;
  for (const date of dates) {
    let decisions;
    try {
      const meeting = await fetchMeetingByDate(date);
      if (!meeting) continue;
      const data = await fetchDecisions(meeting.activity_id);
      decisions = data.data || [];
    } catch {
      continue;
    }
    for (const dec of decisions) {
      const m = String(dec.activity_id || dec.id).match(/DEC-(\d+)$/);
      if (!m) continue;
      const id = parseInt(m[1], 10);
      const headingRef = extractDocRef(
        dec.decided_on_a_realization_of || [],
        null,
        dec.headingLabel && dec.headingLabel.en,
        dec.referenceText && dec.referenceText.en
      );
      if (!headingRef) continue;
      const row = await db("rollcalls").where("id", id).first("ref");
      if (!row) continue;
      checked++;
      if (row.ref === headingRef) continue;
      await db("rollcalls")
        .where("id", id)
        .update({ ref: cleanRef(headingRef) });
      fixed++;
      if (fixed <= 20)
        console.log(`   ${id}: ${row.ref || "(none)"} → ${headingRef}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(
    `\n${fixed} ref(s) corrected out of ${checked} decisions with a named document (${dates.length} dates)`
  );
}

async function main() {
  let dates;

  if (argv.all) {
    // Discover dates from the vote-results documents (every vote of a sitting,
    // not just roll-calls), unioned with the roll-call documents in case one
    // exists without the other.
    console.log("📋 Fetching all vote-result document dates…");
    const sets = [];
    for (const workType of ["VOTE_RESULTS_PLENARY", "VOTE_ROLLCALL_PLENARY"]) {
      const docs = await fetchDocumentList(workType);
      sets.push(
        docs.map((d) => extractDateFromId(d.identifier)).filter(Boolean)
      );
    }
    dates = [...new Set(sets.flat())].sort();
    console.log(`   → ${dates.length} plenary dates found`);
  } else {
    const input = argv._.length ? argv._[0] : argv.date;
    if (input === undefined || input === null || input === "") {
      console.error("Error: provide a date or use --all");
      process.exit(1);
    }
    dates = [normalizeDate(input)];
  }

  if (argv["fix-refs"]) {
    await fixRefs(dates);
    return;
  }

  let totalNew = 0;
  let totalUpd = 0;
  let totalSkip = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // Optional: force-download the RCV XML, then push it to kundera
    if (argv.download) await downloadRcv(date);
    if (argv.push) {
      const zipPath = path.join(RCV_DIR, `${date}.xml.zip`);
      if (fs.existsSync(zipPath)) pushRcv(zipPath);
      else console.warn(`   ⚠️  nothing to push for ${date}: ${zipPath}`);
    }

    // Optional: fetch raw JSON files + English XML first
    if (argv.fetch) {
      await fetchForDate(date);
      // Extra delay after fetch calls before hitting the import API
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Skip DB import if already processed and --force not set. With
    // --no-rollcall only non-roll-call decisions count as processed, so dates
    // with RCV rows but no hand/electronic rows are still imported.
    //
    // `requested_by` marks a date as imported, not `method`: the
    // backfill_rollcall_method migration set every legacy RCV-XML row to 'RCV',
    // so any date with votes would look processed already.
    const processed = db("rollcalls")
      .join("plenaries", "rollcalls.plenary", "plenaries.id")
      .where("plenaries.date", date)
      .whereNotNull("rollcalls.requested_by");
    if (!argv.rollcall) processed.whereNot("rollcalls.method", "RCV");
    const existing = await processed.first();
    if (!argv.force && existing) {
      console.log(
        `   ⏭️  ${date} already processed (use --force to re-import)`
      );
      continue;
    }

    // Rate-limit: wait 1.5s between dates when processing in batch
    if (i > 0 && !argv.fetch) {
      await new Promise((r) => setTimeout(r, 1500));
    }

    const result = await processDate(date);
    totalNew += result.inserted;
    totalUpd += result.updated;
    totalSkip += result.skipped;

    console.log(
      `📅 ${date} (${result.sitting_id}): ` +
        `${result.total_decisions} decisions, ` +
        `+${result.inserted} new, ` +
        `~${result.updated} updated, ` +
        `-${result.skipped} skipped`
    );

    if (result.methods && result.methods.length > 0) {
      for (const m of result.methods) {
        console.log(`   ${m.method.padEnd(22)} ${m.count}`);
      }
    }
    if (result.groups && result.groups.length > 0) {
      for (const g of result.groups) {
        console.log(`   requested by: ${g.requested_by.padEnd(22)} ${g.count}`);
      }
    }
  }

  if (dates.length > 1) {
    console.log(
      `\n✅ Total: ${dates.length} dates, +${totalNew} new, ~${totalUpd} updated, -${totalSkip} skipped`
    );
  }

  if (argv.download) {
    // Release the WAF browser opened by downloadRcv (if any).
    try {
      await Promise.race([
        getWaf().closeBrowser(),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    } catch {
      /* waf unavailable or browser already closed */
    }
  }
}

/**
 * Process a single plenary date.
 */
async function processDate(dateStr) {
  // 1. Find the plenary sitting
  const meeting = await fetchMeetingByDate(dateStr);
  if (!meeting) {
    console.error(`⚠️  No plenary sitting found for ${dateStr}, skipping`);
    console.log(`   📄 RCV file: ${rcvUrl(dateStr)}`);
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      total_decisions: 0,
      sitting_id: "N/A",
    };
  }

  const sittingId = meeting.activity_id; // e.g. "MTG-PL-2024-07-17"

  // 2. Ensure a plenaries row exists
  let plenary = await db("plenaries").where("date", dateStr).first();
  if (!plenary) {
    const [id] = await db("plenaries").insert({
      date: dateStr,
      term: 10,
      source: "openapi",
      status: "imported",
    });
    plenary = await db("plenaries").where("id", id).first();
    console.log(`   📄 created plenaries row #${plenary.id}`);
  } else if (!plenary.source) {
    await db("plenaries").where("id", plenary.id).update({ source: "openapi" });
  }

  // 3. Fetch all decisions from the OpenAPI
  let decisionsData;
  try {
    decisionsData = await fetchDecisions(sittingId);
  } catch (e) {
    // ponytail: decisions 404 for the current day until published; keep going and point at the raw file
    console.warn(`   ⚠️  Failed to fetch decisions: ${e.message}`);
    console.log(`   📄 RCV file: ${rcvUrl(dateStr)}`);
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      total_decisions: 0,
      sitting_id: sittingId,
    };
  }

  // --no-rollcall leaves roll-call rows (and their per-MEP positions) alone and
  // imports only the hand/electronic votes.
  const all = decisionsData.data || [];
  const decisions = argv.rollcall
    ? all
    : all.filter(
        (d) =>
          d.decision_method !==
          "def/ep-decision-methods/VOTE_ELECTRONIC_ROLLCALL"
      );

  if (decisions.length === 0) {
    console.log(`   ⚠️  No decisions returned for ${sittingId}`);
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      total_decisions: 0,
      sitting_id: sittingId,
    };
  }

  // 4. Process each decision
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const methodCounts = {};
  const groupCounts = {};

  for (const dec of decisions) {
    const decId = dec.activity_id || dec.id;
    const idMatch = decId.match(/DEC-(\d+)$/);
    if (!idMatch) {
      skipped++;
      continue;
    }
    const id = parseInt(idMatch[1], 10);

    // Extract method — normalised to the repo's short vocabulary
    const method = methodName(dec.decision_method);

    // Extract title
    const title =
      dec.activity_label?.en ||
      dec.referenceText?.en ||
      dec.headingLabel?.en ||
      "";

    // Extract requested by (political group)
    const requestedBy = normalizeRequestedBy(
      dec.responsible_organization_label?.en
    );

    // Extract document reference from decided_on_a_realization_of
    const decidedOn = dec.decided_on_a_realization_of || [];
    const docRef = extractDocRef(
      decidedOn,
      title,
      dec.headingLabel && dec.headingLabel.en,
      dec.referenceText && dec.referenceText.en
    );
    const detailedRef = extractDocRefForDb(decidedOn);

    // Extract comment
    const comment = dec.comment?.en || "";
    const wasMotivated = dec.was_motivated_by || [];

    // Classify vote type (pass detailed ref for -AM- detection)
    const voteType = classifyVoteType(
      title,
      requestedBy,
      comment,
      wasMotivated,
      detailedRef
    );

    // decision_outcome is all the EP publishes for hand votes (no counts)
    const outcome =
      String(dec.decision_outcome || "").replace("def/ep-statuses/", "") ||
      null;

    const row = {
      id,
      date: dateStr,
      name: title,
      ref: cleanRef(docRef) || null,
      method,
      outcome,
      requested_by: requestedBy,
      doc_ref: cleanRef(detailedRef) || null,
      vote_type: voteType,
      for: dec.number_of_votes_favor ?? null,
      against: dec.number_of_votes_against ?? null,
      abstention: dec.number_of_votes_abstention ?? null,
      attendees: dec.number_of_attendees ?? null,
      plenary: plenary.id,
      term: 10,
    };

    // Check if this rollcall already exists
    const existing = await db("rollcalls").where("id", id).first();
    if (existing) {
      // Update with new metadata
      await db("rollcalls")
        .where("id", id)
        .update({
          method: row.method,
          requested_by: row.requested_by,
          doc_ref: row.doc_ref,
          vote_type: row.vote_type,
          attendees: row.attendees,
          for: row.for ?? existing.for,
          against: row.against ?? existing.against,
          abstention: row.abstention ?? existing.abstention,
          name: existing.name || row.name,
          ref: existing.ref || row.ref,
          outcome: row.outcome ?? existing.outcome,
        });
      updated++;
    } else {
      // Insert new row
      await db("rollcalls").insert(row);
      inserted++;
    }

    methodCounts[method] = (methodCounts[method] || 0) + 1;
    const gKey = requestedBy || "(none)";
    groupCounts[gKey] = (groupCounts[gKey] || 0) + 1;
  }

  return {
    inserted,
    updated,
    skipped,
    total_decisions: decisions.length,
    sitting_id: sittingId,
    methods: Object.entries(methodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count })),
    groups: Object.entries(groupCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([requested_by, count]) => ({ requested_by, count })),
  };
}

/**
 * Extract a short document reference from the decided_on array.
 * e.g. "eli/dl/doc/B-10-2024-0007-AM-1" → "B10-0007/2024"
 */
const REF = /((?:RC-)?[AB]\d+-\d{4}\/\d{4})/;

/**
 * The document a decision is about. `decided_on_a_realization_of` is the
 * authority when present; otherwise `headingLabel` / `referenceText` name it
 * ("Motion for a resolution B10-0558/2025", "Report: X (A10-0275/2026)") and the
 * title only as a last resort — the title fallback used to pick the wrong motion
 * of the same subject (28 of 134 refs wrong on one sitting).
 */
function extractDocRef(decidedOn, title, heading, reference) {
  // First try from the decided_on references
  for (const ref of decidedOn) {
    // e.g. B-10-2024-0007-AM-1
    const m = ref.match(/B-10-(\d{4})-(\d{4})/);
    if (m) {
      return `B10-${m[2]}/${m[1]}`;
    }
  }

  // then whatever the EP writes in the heading / reference text
  for (const text of [heading, reference]) {
    const m = String(text || "").match(REF);
    if (m) return m[1];
  }

  // Fallback: try to extract from title like "B10-0007/2024 – ..."
  const m2 = String(title || "").match(REF);
  return m2 ? m2[1] : null;
}

/**
 * Extract a specific amendment/doc reference for the doc_ref column.
 * e.g. "eli/dl/doc/B-10-2024-0007-AM-1" → "B-10-2024-0007-AM-1"
 */
function extractDocRefForDb(decidedOn) {
  for (const ref of decidedOn) {
    const parts = ref.split("/").pop();
    if (parts && parts.startsWith("B-")) return parts;
  }
  return null;
}

/**
 * Classify a decision into a vote type.
 * @param {string} title - English title
 * @param {string|null} requestedBy - Group that requested (responsible_organization_label)
 * @param {string} comment - comment.en from API
 * @param {string[]} wasMotivated - was_motivated_by array
 * @param {string|null} docRef - extracted document reference from doc_ref column
 */
function classifyVoteType(title, requestedBy, comment, wasMotivated, docRef) {
  const t = (title || "").toLowerCase();
  const c = (comment || "").toLowerCase();
  const wm = wasMotivated.map((s) => (s || "").toLowerCase());

  // Check for split votes via was_motivated_by
  if (wm.some((s) => s.includes("split"))) {
    return "split";
  }

  // Check for amendments via comment (e.g. "1/RCV" = split part 1)
  if (c.match(/^\d+\/rcv/)) {
    return "split";
  }

  // Check for amendments via doc_ref (contains -AM-)
  if (docRef && docRef.includes("-AM-")) {
    return "amendment";
  }

  // Check for amendments via title
  if (t.includes("am ") || t.includes("amendment") || t.includes("amend")) {
    return "amendment";
  }

  // Check if it's an agenda/procedural vote
  if (t.includes("agenda") || t.includes("request by")) {
    return "procedural";
  }

  // Original text (not an amendment)
  if (requestedBy === "original text") {
    return "original";
  }

  // Heading/budget/decision proposals
  if (
    t.includes("proposal for a decision") ||
    t.includes("motion for a resolution")
  ) {
    return "main";
  }

  // Default for hand votes on sections etc.
  if (!requestedBy || requestedBy === "(none)") {
    return "procedural";
  }

  return "other";
}

/**
 * Fetch raw JSON files for a given date by calling rcv.js, vot.js, and att.js.
 * Each script fetches the English version of its document type.
 */
async function fetchForDate(date) {
  const dir = __dirname;

  for (const script of ["rcv.js", "vot.js", "att.js"]) {
    const scriptPath = path.join(dir, script);
    console.log(`   📥 spawning ${script} ${date}…`);
    const args = [scriptPath, date];
    if (argv.force) args.push("--force");
    const result = spawnSync(process.execPath, args, {
      stdio: ["ignore", "inherit", "inherit"],
      timeout: 60000,
    });
    if (result.status !== 0) {
      console.warn(`   ⚠️  ${script} exited with code ${result.status}`);
    }
  }
}

/**
 * Importable entry point: `run({ d: '2026-11-23' })` merges the options over the
 * parsed argv and does exactly what the CLI does. openapi/update.js calls this.
 */
async function run(options = {}) {
  Object.assign(argv, options);
  await main();
}

module.exports = { run, main, argv };

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌", err.message);
      process.exit(1);
    });
}
