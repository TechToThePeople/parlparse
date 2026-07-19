#!/usr/bin/env node
/**
 * Unit tests for lib.js utility functions and fingerprint helpers.
 * Pure logic — no network calls.
 */

const { describe, it, mock } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const lib = require("../lib");
const fp = require("./fingerprint");

// ─── extractDateFromId ───────────────────────────────────────────────

describe("extractDateFromId", () => {
  it("extracts date from RCV identifier", () => {
    assert.strictEqual(
      lib.extractDateFromId("PV-10-2024-07-17-RCV"),
      "2024-07-17"
    );
  });

  it("extracts date from VOT identifier", () => {
    assert.strictEqual(
      lib.extractDateFromId("PV-10-2024-07-17-VOT"),
      "2024-07-17"
    );
  });

  it("extracts date from ATT identifier", () => {
    assert.strictEqual(
      lib.extractDateFromId("PV-10-2024-07-16-ATT"),
      "2024-07-16"
    );
  });

  it("extracts date from December identifier", () => {
    assert.strictEqual(
      lib.extractDateFromId("PV-10-2024-12-19-RCV"),
      "2024-12-19"
    );
  });

  it("returns null for garbage input", () => {
    assert.strictEqual(lib.extractDateFromId("not-an-id"), null);
  });

  it("returns null for empty string", () => {
    assert.strictEqual(lib.extractDateFromId(""), null);
  });

  it("returns null for undefined", () => {
    assert.strictEqual(lib.extractDateFromId(undefined), null);
  });
});

// ─── parseArgs ───────────────────────────────────────────────────────

describe("parseArgs", () => {
  // Save original argv and restore after each test
  let origArgv;

  function withArgv(args, fn) {
    return () => {
      origArgv = process.argv;
      process.argv = ["node", "script.js", ...args];
      try {
        fn();
      } finally {
        process.argv = origArgv;
      }
    };
  }

  it(
    "parses --help flag",
    withArgv(["--help"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.help, true);
      assert.strictEqual(result.input, null);
    })
  );

  it(
    "parses -h alias",
    withArgv(["-h"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.help, true);
    })
  );

  it(
    "parses positional argument as input",
    withArgv(["2024-07-17"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.help, false);
      assert.strictEqual(result.input, "2024-07-17");
    })
  );

  it(
    "parses --date option",
    withArgv(["--date=2024-07-17"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.help, false);
      assert.strictEqual(result.input, "2024-07-17");
    })
  );

  it(
    "parses -d alias",
    withArgv(["-d", "2024-07-17"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.help, false);
      assert.strictEqual(result.input, "2024-07-17");
    })
  );

  it(
    "prefers positional arg over --date",
    withArgv(["2024-07-17", "--date=2024-10-09"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.input, "2024-07-17");
    })
  );

  it(
    "returns null input when no args given",
    withArgv([], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.help, false);
      assert.strictEqual(result.input, null);
    })
  );

  it(
    "parses document ID as positional arg",
    withArgv(["PV-10-2024-07-17-RCV"], () => {
      const result = lib.parseArgs();
      assert.strictEqual(result.input, "PV-10-2024-07-17-RCV");
    })
  );
});

// ─── fingerprintRcv ──────────────────────────────────────────────────

describe("fingerprintRcv", () => {
  it("returns null for null/undefined input", () => {
    assert.strictEqual(fp.fingerprintRcv(null), null);
    assert.strictEqual(fp.fingerprintRcv(undefined), null);
    assert.strictEqual(fp.fingerprintRcv({}), null);
  });

  it("produces stable output for known data", () => {
    const data = {
      meta: {
        document_id: "PV-10-2024-07-17-RCV",
        date: "2024-07-17",
        sitting_id: "MTG-PL-2024-07-17",
      },
      decisions: [
        {
          activity_order: "1.0",
          title_en: "Test vote",
          decision_method: "VOTE_ELECTRONIC_ROLLCALL",
          decision_outcome: "ADOPTED",
          counts: { favor: 400, against: 100, abstention: 20, attendees: 520 },
          voters: {
            favor: Array(400).fill("x"),
            against: Array(100).fill("x"),
            abstention: Array(20).fill("x"),
          },
          decided_on: ["eli/dl/doc/B10-2024-0001"],
          responsible_group: "PPE",
        },
      ],
    };

    const f = fp.fingerprintRcv(data);
    assert.strictEqual(f.type, "rcv");
    assert.strictEqual(f.document_id, "PV-10-2024-07-17-RCV");
    assert.strictEqual(f.decision_count, 1);
    assert.strictEqual(f.rollcall_count, 1);
    assert.strictEqual(f.handvote_count, 0);
    assert.strictEqual(f.decisions[0].title, "Test vote");
    assert.strictEqual(f.decisions[0].for, 400);
    assert.strictEqual(f.decisions[0].voter_count, 520);
  });

  it("handles hand votes without voter arrays", () => {
    const data = {
      meta: {
        document_id: "PV-10-2024-07-17-RCV",
        date: "2024-07-17",
        sitting_id: "MTG-PL-2024-07-17",
      },
      decisions: [
        {
          activity_order: "2.0",
          title_en: "Hand vote",
          decision_method: "VOTE_HAND",
          decision_outcome: "ADOPTED",
          counts: {},
          voters: null,
          decided_on: [],
          responsible_group: null,
        },
      ],
    };

    const f = fp.fingerprintRcv(data);
    assert.strictEqual(f.decisions[0].method, "VOTE_HAND");
    assert.strictEqual(f.decisions[0].voter_count, null);
  });
});

// ─── fingerprintVot ──────────────────────────────────────────────────

describe("fingerprintVot", () => {
  it("returns null for null/undefined input", () => {
    assert.strictEqual(fp.fingerprintVot(null), null);
    assert.strictEqual(fp.fingerprintVot({}), null);
  });

  it("produces stable output for known data", () => {
    const data = {
      meta: { document_id: "PV-10-2024-07-17-VOT", date: "2024-07-17" },
      items: [
        {
          dlvId: "954205",
          title: "Test item",
          documents: [{ reference: "B10-0007/2024" }],
          votings: [
            {
              votingId: "1",
              type: "RCV",
              result: "ADOPTED",
              title: "§ 1",
              for_count: 400,
              against_count: 100,
              abstention_count: 20,
            },
            {
              votingId: "2",
              type: "RCV",
              result: "REJECTED",
              title: "§ 2",
              for_count: 50,
              against_count: 400,
              abstention_count: 10,
            },
          ],
        },
      ],
    };

    const f = fp.fingerprintVot(data);
    assert.strictEqual(f.type, "vot");
    assert.strictEqual(f.item_count, 1);
    assert.strictEqual(f.items[0].dlvId, "954205");
    assert.strictEqual(f.items[0].voting_count, 2);
    assert.strictEqual(f.items[0].documents[0], "B10-0007/2024");
    assert.strictEqual(f.items[0].votings[0].for, 400);
    assert.strictEqual(f.items[0].votings[1].against, 400);
  });
});

// ─── fingerprintAtt ──────────────────────────────────────────────────

describe("fingerprintAtt", () => {
  it("returns null for null/undefined input", () => {
    assert.strictEqual(fp.fingerprintAtt(null), null);
    assert.strictEqual(fp.fingerprintAtt({}), null);
  });

  it("produces stable output with language info", () => {
    const data = {
      meta: {
        document_id: "PV-10-2024-07-16-ATT",
        date: "2024-07-16",
        title_en: "Minutes - Attendance List",
        meeting_id: "eli/dl/event/MTG-PL-2024-07-16",
      },
      document: {
        is_realized_by: [
          {
            language:
              "http://publications.europa.eu/resource/authority/language/ENG",
          },
          {
            language:
              "http://publications.europa.eu/resource/authority/language/FRA",
          },
          {
            language:
              "http://publications.europa.eu/resource/authority/language/DEU",
          },
        ],
      },
      files: [{ type: "PDF" }, { type: "XML" }, { type: "DOCX" }],
    };

    const f = fp.fingerprintAtt(data);
    assert.strictEqual(f.type, "att");
    assert.strictEqual(f.language_count, 3);
    assert.deepStrictEqual(f.languages, ["DEU", "ENG", "FRA"]);
    assert.strictEqual(f.file_count, 3);
  });
});
