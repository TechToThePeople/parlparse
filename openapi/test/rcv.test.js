#!/usr/bin/env node
/**
 * Change-detection integration test for roll-call vote data.
 *
 * Fetches fresh data from the live API and compares fingerprints
 * against stored fixtures. Fails when the upstream data changes,
 * alerting the maintainer to review and update fixtures.
 *
 * Set UPDATE_FIXTURES=1 to overwrite fixtures with current API state.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const lib = require("../lib");
const fp = require("./fingerprint");

const WORK_TYPE = "VOTE_ROLLCALL_PLENARY";
const SHOULD_UPDATE = process.env.UPDATE_FIXTURES === "1";

// Known test dates for which we have fixtures
const TEST_CASES = [
  { id: "PV-10-2024-07-17-RCV", date: "2024-07-17" },
  { id: "PV-10-2024-10-09-RCV", date: "2024-10-09" },
];

describe("rcv — Roll-call vote data change detection", () => {
  for (const { id, date } of TEST_CASES) {
    it(`fingerprint matches fixture for ${date} (${id})`, async () => {
      // 1. Load existing fixture
      const fixture = fp.loadFingerprint("rcv", id);

      // 2. Fetch fresh data from the live API
      console.error(`  fetching decisions for ${date}…`);
      const meeting = await lib.fetchMeetingByDate(date);
      assert.ok(meeting, `No plenary meeting found for ${date}`);

      const decisionsJson = await lib.fetchDecisions(meeting.activity_id);
      const decisions = (decisionsJson.data || []).map(normalizeRcvDecision);

      const freshData = {
        meta: {
          document_id: id,
          date,
          sitting_id: meeting.activity_id,
        },
        decisions,
      };

      // 3. Compute fingerprint
      const freshFp = fp.fingerprintRcv(freshData);
      assert.ok(freshFp, "Failed to compute fingerprint");

      // 4. Handle fixture update
      if (SHOULD_UPDATE) {
        fp.saveFingerprint("rcv", id, freshFp);
        console.error(`  ✅ fixture updated for ${id}`);
        return;
      }

      // 5. Compare against fixture
      if (!fixture) {
        // No fixture exists — save one and warn
        fp.saveFingerprint("rcv", id, freshFp);
        console.error(`  📸 new fixture saved for ${id} (no previous fixture)`);
        return;
      }

      try {
        assert.deepStrictEqual(freshFp, fixture);
      } catch (err) {
        // Enhance error with a human-readable change summary
        const changes = diffFingerprints(fixture, freshFp);
        const msg = `
❌ API data changed for ${id} (${date})

${changes}

To accept this as the new baseline:
  UPDATE_FIXTURES=1 node --test openapi/test/rcv.test.js
`;
        throw new assert.AssertionError({
          message: msg,
          actual: freshFp,
          expected: fixture,
          operator: "deepStrictEqual",
        });
      }
    });
  }
});

/**
 * Normalize a raw decision from the API into the same shape as the
 * openapi/rcv.js output.
 */
function normalizeRcvDecision(d) {
  return {
    activity_order: d.activity_order || "",
    title_en: d.activity_label?.en || d.activity_label?.mul || "",
    decision_method: d.decision_method?.replace("def/ep-decision-methods/", ""),
    decision_outcome: d.decision_outcome?.replace("def/ep-statuses/", ""),
    counts: {
      favor: d.number_of_votes_favor,
      against: d.number_of_votes_against,
      abstention: d.number_of_votes_abstention,
      attendees: d.number_of_attendees,
    },
    voters:
      d.had_voter_favor || d.had_voter_against || d.had_voter_abstention
        ? {
            favor: d.had_voter_favor || [],
            against: d.had_voter_against || [],
            abstention: d.had_voter_abstention || [],
          }
        : null,
    decided_on: d.decided_on_a_realization_of || [],
    responsible_group: d.responsible_organization_label?.en || null,
  };
}

/**
 * Produce a human-readable change summary between two fingerprints.
 */
function diffFingerprints(oldFp, newFp) {
  const lines = [];

  if (oldFp.decision_count !== newFp.decision_count) {
    lines.push(
      `📊 Decision count: ${oldFp.decision_count} → ${newFp.decision_count}`
    );
  }
  if (oldFp.rollcall_count !== newFp.rollcall_count) {
    lines.push(
      `🗳️  Roll-call count: ${oldFp.rollcall_count} → ${newFp.rollcall_count}`
    );
  }

  // Index old decisions by title for comparison
  const oldDecs = {};
  for (const d of oldFp.decisions) {
    const key = `${d.order}|${d.title}`;
    oldDecs[key] = d;
  }

  const newDecs = {};
  for (const d of newFp.decisions) {
    const key = `${d.order}|${d.title}`;
    newDecs[key] = d;
  }

  // Check for new decisions
  for (const key of Object.keys(newDecs)) {
    if (!oldDecs[key]) {
      const d = newDecs[key];
      lines.push(
        `➕ New decision: "${d.title}" → ${d.outcome} (${d.for}/${d.against}/${d.abstention})`
      );
    }
  }

  // Check for removed decisions
  for (const key of Object.keys(oldDecs)) {
    if (!newDecs[key]) {
      const d = oldDecs[key];
      lines.push(`➖ Removed decision: "${d.title}" (was ${d.outcome})`);
    }
  }

  // Check for changed vote counts on existing decisions
  for (const key of Object.keys(oldDecs)) {
    if (newDecs[key]) {
      const o = oldDecs[key];
      const n = newDecs[key];
      if (
        o.for !== n.for ||
        o.against !== n.against ||
        o.abstention !== n.abstention ||
        o.outcome !== n.outcome
      ) {
        lines.push(
          `🔄 Changed: "${o.title}": ${o.for}/${o.against}/${o.abstention} (${o.outcome}) → ${n.for}/${n.against}/${n.abstention} (${n.outcome})`
        );
      }
    }
  }

  if (lines.length === 0) {
    lines.push("(data structures differ — compare full output for details)");
  }

  return lines.join("\n");
}
