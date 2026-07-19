#!/usr/bin/env node
/**
 * Change-detection integration test for attendance list data.
 *
 * Fetches fresh data from the live API and compares fingerprints
 * against stored fixtures. Fails when the upstream data changes.
 *
 * Set UPDATE_FIXTURES=1 to overwrite fixtures with current API state.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const lib = require("../lib");
const fp = require("./fingerprint");

const WORK_TYPE = "LIST_ATTEND_PLENARY";
const SHOULD_UPDATE = process.env.UPDATE_FIXTURES === "1";

const TEST_CASES = [
  { id: "PV-10-2024-07-16-ATT", date: "2024-07-16" },
  { id: "PV-10-2024-10-08-ATT", date: "2024-10-08" },
];

describe("att — Attendance list data change detection", () => {
  for (const { id, date } of TEST_CASES) {
    it(`fingerprint matches fixture for ${date} (${id})`, async () => {
      // 1. Load existing fixture
      const fixture = fp.loadFingerprint("att", id);

      // 2. Fetch the document JSON-LD
      console.error(`  fetching document ${id}…`);
      const doc = await lib.fetchDocumentById(id);
      const docData = doc.data ? doc.data[0] : doc;

      // 3. Extract metadata (mirrors att.js logic)
      const expressions = docData.is_realized_by || [];
      const englishExpr = expressions.find((e) =>
        (e.language || "").includes("ENG")
      );

      const files = [];
      if (englishExpr) {
        const manifestations = englishExpr.is_embodied_by || [];
        for (const m of manifestations) {
          const path = m.is_exemplified_by;
          if (path) {
            files.push({
              type: m.format?.split("/").pop() || "unknown",
              url: path.startsWith("http")
                ? path
                : `https://data.europarl.europa.eu/${path}`,
            });
          }
        }
      }

      // 4. Build fresh data
      const freshData = {
        meta: {
          document_id: id,
          date,
          title_en: englishExpr?.title?.en || null,
          meeting_id:
            docData.inverse_recorded_in_a_realization_of?.[0]?.id || null,
        },
        document: docData,
        files,
      };

      // 5. Compute fingerprint
      const freshFp = fp.fingerprintAtt(freshData);
      assert.ok(freshFp, "Failed to compute fingerprint");

      // 6. Handle fixture update
      if (SHOULD_UPDATE) {
        fp.saveFingerprint("att", id, freshFp);
        console.error(`  ✅ fixture updated for ${id}`);
        return;
      }

      // 7. Compare against fixture
      if (!fixture) {
        fp.saveFingerprint("att", id, freshFp);
        console.error(`  📸 new fixture saved for ${id}`);
        return;
      }

      try {
        assert.deepStrictEqual(freshFp, fixture);
      } catch (err) {
        const changes = diffAttFingerprints(fixture, freshFp);
        const msg = `
❌ API data changed for ${id} (${date})

${changes}

To accept as new baseline:
  UPDATE_FIXTURES=1 node --test openapi/test/att.test.js
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

function diffAttFingerprints(oldFp, newFp) {
  const lines = [];

  if (oldFp.title_en !== newFp.title_en) {
    lines.push(`📝 Title: "${oldFp.title_en}" → "${newFp.title_en}"`);
  }
  if (oldFp.language_count !== newFp.language_count) {
    lines.push(
      `🌐 Languages: ${oldFp.language_count} → ${newFp.language_count}`
    );
  }
  if (oldFp.file_count !== newFp.file_count) {
    lines.push(`📎 Files: ${oldFp.file_count} → ${newFp.file_count}`);
  }
  if (oldFp.meeting_id !== newFp.meeting_id) {
    lines.push(`📅 Meeting: ${oldFp.meeting_id} → ${newFp.meeting_id}`);
  }

  if (lines.length === 0) {
    lines.push("(data structures differ — compare full output for details)");
  }
  return lines.join("\n");
}
