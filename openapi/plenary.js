#!/usr/bin/env node
/**
 * openapi/plenary.js — Import all decisions for a plenary sitting from the
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
 *   node openapi/plenary.js 2024-07-17
 *   node openapi/plenary.js --all
 *   node openapi/plenary.js --help
 */

const minimist = require("minimist");
const db = require("../lib/db");
const {
  fetchMeetingByDate,
  fetchDecisions,
  fetchDocumentList,
  fetchDocumentById,
  extractDateFromId,
} = require("./lib");

const { spawnSync } = require("child_process");
const path = require("path");

const argv = minimist(process.argv.slice(2), {
  alias: { h: "help", a: "all", d: "date", f: "fetch" },
});

if (argv.help) {
  console.log(`
Usage:
  node openapi/plenary.js [options] [<date>]

Arguments:
  <date>     A date in YYYY-MM-DD format (e.g. 2024-07-17)

Options:
  --all, -a     Process all available plenary dates
  --date, -d <date>   Alternative to positional arg
  --fetch, -f   Also fetch raw JSON files (calls rcv.js, vot.js, att.js)
  --force       Re-download even if already cached
  --help, -h    Show this help

Description:
  Import decisions from the EP Open Data API into the database.
  Fills the method, requested_by, doc_ref, vote_type, and attendees
  columns in the rollcalls table.
  With --fetch, also saves raw JSON for roll-call votes, vote results,
  and attendance lists to data/openapi/.
`);
  process.exit(0);
}

async function main() {
  let dates;

  if (argv.all) {
    // Discover all dates that have RCV documents
    console.log("📋 Fetching all roll-call document dates…");
    const docs = await fetchDocumentList("VOTE_ROLLCALL_PLENARY");
    dates = docs
      .map((d) => extractDateFromId(d.identifier))
      .filter(Boolean)
      .sort();
    console.log(`   → ${dates.length} plenary dates found`);
  } else {
    const input = argv._[0] || argv.date;
    if (!input) {
      console.error("Error: provide a date or use --all");
      process.exit(1);
    }
    dates = [input];
  }

  let totalNew = 0;
  let totalUpd = 0;
  let totalSkip = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // Optional: fetch raw JSON files + English XML first
    if (argv.fetch) {
      await fetchForDate(date);
      // Extra delay after fetch calls before hitting the import API
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Skip DB import if already processed and --force not set
    const existing = await db("rollcalls")
      .join("plenaries", "rollcalls.plenary", "plenaries.id")
      .where("plenaries.date", date)
      .whereNotNull("rollcalls.method")
      .first();
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
  process.exit(0);
}

/**
 * Process a single plenary date.
 */
async function processDate(dateStr) {
  // 1. Find the plenary sitting
  const meeting = await fetchMeetingByDate(dateStr);
  if (!meeting) {
    console.error(`⚠️  No plenary sitting found for ${dateStr}, skipping`);
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
    console.error(`   ❌ Failed to fetch decisions: ${e.message}`);
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      total_decisions: 0,
      sitting_id: sittingId,
    };
  }

  const decisions = decisionsData.data || [];

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

    // Extract method
    const rawMethod = dec.decision_method || "";
    const method = rawMethod.replace("def/ep-decision-methods/", "");

    // Extract title
    const title =
      dec.activity_label?.en ||
      dec.referenceText?.en ||
      dec.headingLabel?.en ||
      "";

    // Extract requested by (political group)
    const requestedBy = dec.responsible_organization_label?.en || null;

    // Extract document reference from decided_on_a_realization_of
    const decidedOn = dec.decided_on_a_realization_of || [];
    const docRef = extractDocRef(decidedOn, title);
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

    const row = {
      id,
      date: dateStr,
      name: title,
      ref: docRef,
      method,
      requested_by: requestedBy,
      doc_ref: detailedRef,
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
function extractDocRef(decidedOn, title) {
  // First try from the decided_on references
  for (const ref of decidedOn) {
    // e.g. B-10-2024-0007-AM-1
    const m = ref.match(/B-10-(\d{4})-(\d{4})/);
    if (m) {
      return `B10-${m[2]}/${m[1]}`;
    }
  }

  // Fallback: try to extract from title like "B10-0007/2024 – ..."
  const t = title || "";
  const m2 = t.match(/([A-Z]\d{2}-\d{4}\/\d{4})/);
  if (m2) return m2[1];

  // Try "RC-B10-0022/2024"
  const m3 = t.match(/(RC-B10-\d{4}\/\d{4})/);
  if (m3) return m3[1];

  return null;
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

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
