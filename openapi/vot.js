#!/usr/bin/env node
/**
 * openapi/vot.js — Fetch vote results from the OpenAPI and insert into DB.
 *
 * Uses the decisions + vote-results endpoints (fast, no WAF).
 * Saves nothing to disk — inserts directly into votes + votings tables.
 *
 * Usage:
 *   node openapi/vot.js 2024-07-17
 *   node openapi/vot.js PV-10-2024-07-17-VOT
 *   node openapi/vot.js --all
 */

const path = require("path");
const {
  fetchDocumentList,
  fetchDocumentById,
  fetchDecisions,
  fetchMeetingByDate,
  extractDateFromId,
  parseArgs,
  printUsage,
} = require("./lib");
const db = require("../lib/db");

const WORK_TYPE = "VOTE_RESULTS_PLENARY";

async function main() {
  const { help, input, force, all } = parseArgs();

  if (help) {
    printUsage(process.argv[1], "vote results");
    process.exit(0);
  }

  let dates;
  if (all) {
    console.log("📋 Fetching all vote-results document dates…");
    const docs = await fetchDocumentList(WORK_TYPE);
    dates = docs
      .map((d) => extractDateFromId(d.identifier))
      .filter(Boolean)
      .sort();
    console.log(`   → ${dates.length} dates found`);
  } else if (!input) {
    console.error(
      "Error: provide a date or document identifier, or use --all."
    );
    printUsage(process.argv[1], "vote results");
    process.exit(1);
  } else {
    dates = [input];
  }

  let totalOk = 0;
  let totalSkip = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (dates.length > 1) console.log(`\n[${i + 1}/${dates.length}] ${date}`);

    const result = await processDate(date, force);
    if (result === "ok") totalOk++;
    else if (result === "skip") totalSkip++;

    if (result === "ok" && dates.length > 1 && i < dates.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (dates.length > 1) {
    console.log(
      `\n✅ Done: ${totalOk} processed, ${totalSkip} skipped (${dates.length} total)`
    );
  } else if (totalOk === 0) {
    console.log(`\n✅ Done — vote results already processed.`);
  }
}

/**
 * Process a single vote-results date.
 */
async function processDate(date, force) {
  // 1. Find the meeting
  const meeting = await fetchMeetingByDate(date);
  if (!meeting) {
    console.log(`   ⚠️  No plenary sitting found for ${date}`);
    return "skip";
  }
  const sittingId = meeting.activity_id;

  // 2. Ensure plenaries row exists
  let plenary = await db("plenaries").where("date", date).first();
  if (!plenary) {
    const [id] = await db("plenaries").insert({
      date,
      term: 10,
      source: "openapi",
    });
    plenary = await db("plenaries").where("id", id).first();
  }

  // 3. Fetch all decisions
  console.log(`   fetching decisions…`);
  const decisionsJson = await fetchDecisions(sittingId);
  const decisions = decisionsJson.data || [];

  if (decisions.length === 0) {
    console.log(`   ⚠️  No decisions for ${sittingId}`);
    return "skip";
  }

  // 4. Group decisions by their parent vote item (inverse_consists_of)
  const voteMap = {}; // vote item ID → { dlvId, title, decisions: [] }
  for (const dec of decisions) {
    const parents = dec.inverse_consists_of || [];
    for (const parent of parents) {
      const parentId = typeof parent === "string" ? parent : parent.id || "";
      if (!voteMap[parentId]) {
        voteMap[parentId] = { dlvId: null, title: "", decisions: [] };
      }
      voteMap[parentId].decisions.push(dec);
    }
  }

  // 5. Fetch vote results to get dlvId and titles for each vote group
  console.log(`   fetching vote results…`);
  const vrJson = await (
    await fetch(
      `https://data.europarl.europa.eu/api/v2/meetings/${sittingId}/vote-results?format=application/ld+json&limit=200`
    )
  ).json();
  const voteResults = vrJson.data || [];

  for (const vr of voteResults) {
    const vrId = vr.id || "";
    if (voteMap[vrId]) {
      voteMap[vrId].dlvId = vr.notation_dlvId
        ? parseInt(vr.notation_dlvId, 10)
        : null;
      // Get title from structuredLabel
      try {
        const sl = vr.structuredLabel?.en || "";
        const m = sl.match(/<title>([^<]*)<\/title>/);
        voteMap[vrId].title = m ? m[1] : vr.activity_label?.en || "";
      } catch {
        voteMap[vrId].title = vr.activity_label?.en || "";
      }
    }
  }

  // 6. Insert votes + votings
  let voteCount = 0;
  let votingCount = 0;

  for (const [vrId, voteGroup] of Object.entries(voteMap)) {
    const dlvId = voteGroup.dlvId;
    if (!dlvId) continue;

    // Insert votes row
    const voteRow = {
      id: dlvId,
      date: date,
      type: "VOT",
      title: voteGroup.title || null,
      term: 10,
      plenary_id: plenary.id,
    };

    // Collect document refs from decisions
    const refs = new Set();
    for (const dec of voteGroup.decisions) {
      const decidedOn = dec.decided_on_a_realization_of || [];
      for (const d of decidedOn) {
        const m = d.match(/B-10-(\d{4})-(\d{4})/);
        if (m) refs.add(`B10-${m[2]}/${m[1]}`);
      }
    }
    if (refs.size > 0) voteRow.ref = [...refs].join(",");

    try {
      await db("votes").insert(voteRow).onConflict("id").merge();
      voteCount++;
    } catch (e) {
      console.warn(`   ⚠️  vote insert failed: ${e.message}`);
    }

    // Get the vote DB id
    const voteDb = await db("votes").select("id").where("id", dlvId).first();
    if (!voteDb) continue;

    // Insert votings rows from each decision
    for (const dec of voteGroup.decisions) {
      const votingId = dec.notation_votingId
        ? parseInt(dec.notation_votingId, 10)
        : null;
      if (!votingId) continue;

      const method = (dec.decision_method || "").replace(
        "def/ep-decision-methods/",
        ""
      );
      const outcome = (dec.decision_outcome || "").replace(
        "def/ep-statuses/",
        ""
      );
      const group = dec.responsible_organization_label?.en || null;

      // Parse comments for remarks
      let remarks = null;
      const comm = dec.comment?.en || "";
      if (comm && comm !== "RCV") remarks = comm;

      const votingRow = {
        id: votingId,
        date: dec.activity_start_date
          ? new Date(dec.activity_start_date)
          : new Date(date),
        type: method,
        result_type: method.toLowerCase(),
        title: dec.activity_label?.en || dec.referenceText?.en || "",
        result: outcome,
        author: group,
        term: 10,
        vote_id: voteDb.id,
        for_count: dec.number_of_votes_favor ?? null,
        against_count: dec.number_of_votes_against ?? null,
        abstention_count: dec.number_of_votes_abstention ?? null,
        remarks: remarks,
      };

      try {
        await db("votings").insert(votingRow).onConflict("id").merge();
        votingCount++;
      } catch (e) {
        console.warn(
          `   ⚠️  voting insert failed for ${votingId}: ${e.message}`
        );
      }
    }
  }

  console.log(`   → ${voteCount} votes, ${votingCount} votings`);
  return "ok";
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
