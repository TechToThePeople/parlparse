#!/usr/bin/env node
/**
 * Change-detection integration test for vote-results data.
 *
 * Fetches fresh data from the live API and compares fingerprints
 * against stored fixtures. Fails when the upstream data changes.
 *
 * Set UPDATE_FIXTURES=1 to overwrite fixtures with current API state.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { parseStringPromise } = require("xml2js");
const lib = require("../lib");
const fp = require("./fingerprint");

const WORK_TYPE = "VOTE_RESULTS_PLENARY";
const SHOULD_UPDATE = process.env.UPDATE_FIXTURES === "1";

const TEST_CASES = [
  { id: "PV-10-2024-07-17-VOT", date: "2024-07-17" },
  { id: "PV-10-2024-10-09-VOT", date: "2024-10-09" },
];

describe("vot — Vote-results data change detection", () => {
  for (const { id, date } of TEST_CASES) {
    it(`fingerprint matches fixture for ${date} (${id})`, async () => {
      // 1. Load existing fixture
      const fixture = fp.loadFingerprint("vot", id);

      // 2. Fetch the document JSON-LD
      console.error(`  fetching document ${id}…`);
      const doc = await lib.fetchDocumentById(id);
      const docData = doc.data ? doc.data[0] : doc;

      // 3. Find the English XML distribution
      const xmlUrl = findEnglishXmlUrl(docData);

      // 4. Fetch and parse the XML
      let items = [];
      if (xmlUrl) {
        console.error(`  fetching XML…`);
        const xmlRes = await fetch(xmlUrl);
        assert.ok(xmlRes.ok, `XML fetch failed: ${xmlRes.status}`);
        const xmlText = await xmlRes.text();
        const parsed = await parseStringPromise(xmlText, {
          explicitArray: false,
          mergeAttrs: false,
        });
        items = extractItems(parsed);
      }

      // 5. Build fresh data
      const freshData = {
        meta: {
          document_id: id,
          date,
          xml_url: xmlUrl,
        },
        items,
      };

      // 6. Compute fingerprint
      const freshFp = fp.fingerprintVot(freshData);
      assert.ok(freshFp, "Failed to compute fingerprint");

      // 7. Handle fixture update
      if (SHOULD_UPDATE) {
        fp.saveFingerprint("vot", id, freshFp);
        console.error(`  ✅ fixture updated for ${id}`);
        return;
      }

      // 8. Compare against fixture
      if (!fixture) {
        fp.saveFingerprint("vot", id, freshFp);
        console.error(`  📸 new fixture saved for ${id}`);
        return;
      }

      try {
        assert.deepStrictEqual(freshFp, fixture);
      } catch (err) {
        const changes = diffVotFingerprints(fixture, freshFp);
        const msg = `
❌ API data changed for ${id} (${date})

${changes}

To accept as new baseline:
  UPDATE_FIXTURES=1 node --test openapi/test/vot.test.js
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
 * Find the English XML distribution URL from the document JSON-LD.
 */
function findEnglishXmlUrl(docData) {
  const expressions = docData.is_realized_by || [];
  for (const expr of expressions) {
    const lang = expr.language || "";
    if (!lang.includes("ENG")) continue;
    const manifestations = expr.is_embodied_by || [];
    for (const man of manifestations) {
      const mime = man.media_type || "";
      const path = man.is_exemplified_by;
      if (mime.includes("xml") && path) {
        return path.startsWith("http")
          ? path
          : `https://data.europarl.europa.eu/${path}`;
      }
    }
  }
  return null;
}

/**
 * Extract vote items from parsed XML (mirrors vot.js logic).
 */
function extractItems(parsed) {
  const items = [];
  if (!parsed.file || !parsed.file.sitting) return items;

  const sittings = Array.isArray(parsed.file.sitting)
    ? parsed.file.sitting
    : [parsed.file.sitting];

  for (const sitting of sittings) {
    if (!sitting.votes || !sitting.votes.vote) continue;

    const votes = Array.isArray(sitting.votes.vote)
      ? sitting.votes.vote
      : [sitting.votes.vote];

    for (const vote of votes) {
      const item = {
        dlvId: vote.$.dlvId,
        type: vote.$.type,
        title: vote.title
          ? Array.isArray(vote.title)
            ? vote.title.join("; ")
            : vote.title
          : "",
        documents: [],
        votings: [],
      };

      if (vote.documents && vote.documents.document) {
        const docs = Array.isArray(vote.documents.document)
          ? vote.documents.document
          : [vote.documents.document];
        for (const d of docs) {
          item.documents.push({ reference: d.$.reference || null });
        }
      }

      if (vote.votings && vote.votings.voting) {
        const votings = Array.isArray(vote.votings.voting)
          ? vote.votings.voting
          : [vote.votings.voting];
        for (const v of votings) {
          const voting = {
            votingId: v.$.votingId,
            type: v.$.type,
            result: v.$.result || null,
            title: v.title
              ? Array.isArray(v.title)
                ? v.title.join("; ")
                : v.title
              : v.amendmentSubject
              ? Array.isArray(v.amendmentSubject)
                ? v.amendmentSubject.join("; ")
                : v.amendmentSubject
              : null,
            for_count: null,
            against_count: null,
            abstention_count: null,
          };

          if (v.observations && v.observations.status === "verbatim") {
            const text = v._ || v.observations._ || "";
            const nums = text
              .split(",")
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n));
            if (nums.length >= 3) {
              voting.for_count = nums[0];
              voting.against_count = nums[1];
              voting.abstention_count = nums[2];
            }
          }

          item.votings.push(voting);
        }
      }

      items.push(item);
    }
  }

  return items;
}

/**
 * Produce a human-readable change summary for VOT fingerprint diffs.
 */
function diffVotFingerprints(oldFp, newFp) {
  const lines = [];

  if (oldFp.item_count !== newFp.item_count) {
    lines.push(`📊 Item count: ${oldFp.item_count} → ${newFp.item_count}`);
  }

  // Index old items by dlvId
  const oldItems = {};
  for (const item of oldFp.items) {
    oldItems[item.dlvId] = item;
  }
  const newItems = {};
  for (const item of newFp.items) {
    newItems[item.dlvId] = item;
  }

  for (const id of Object.keys(newItems)) {
    if (!oldItems[id]) {
      lines.push(`➕ New item: "${newItems[id].title}" (${id})`);
    }
  }
  for (const id of Object.keys(oldItems)) {
    if (!newItems[id]) {
      lines.push(`➖ Removed item: "${oldItems[id].title}" (${id})`);
    }
  }
  for (const id of Object.keys(oldItems)) {
    if (newItems[id]) {
      const o = oldItems[id];
      const n = newItems[id];
      if (o.voting_count !== n.voting_count) {
        lines.push(
          `🔄 "${o.title}": ${o.voting_count} votings → ${n.voting_count}`
        );
      }
    }
  }

  if (lines.length === 0) {
    lines.push("(data structures differ — compare full output for details)");
  }
  return lines.join("\n");
}
