#!/usr/bin/env node
/* eslint-env node */
/**
 * Unit tests for lib.js utility functions and fingerprint helpers.
 * Pure logic — no network calls.
 */

const { describe, it } = require("node:test");
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

// ─── methodName ──────────────────────────────────────────────────────

describe("methodName", () => {
  it("maps the EP decision methods to the repo vocabulary", () => {
    assert.strictEqual(
      lib.methodName("def/ep-decision-methods/VOTE_ELECTRONIC_ROLLCALL"),
      "RCV"
    );
    assert.strictEqual(lib.methodName("VOTE_HAND"), "HAND");
    assert.strictEqual(lib.methodName("VOTE_ELECTRONIC"), "ELECTRONIC");
    assert.strictEqual(
      lib.methodName("def/ep-decision-methods/VOTE_ELECTRONIC_SECRET"),
      "SECRET"
    );
  });

  it("passes unknown methods and empty input through", () => {
    assert.strictEqual(
      lib.methodName("def/ep-decision-methods/VOTE_UNKNOWN"),
      "VOTE_UNKNOWN"
    );
    assert.strictEqual(lib.methodName(""), "");
    assert.strictEqual(lib.methodName(undefined), "");
    assert.strictEqual(lib.methodName(null), "");
  });
});

// ─── normalizeRequestedBy ────────────────────────────────────────────

describe("normalizeRequestedBy", () => {
  it("keeps a single group as-is", () => {
    assert.strictEqual(lib.normalizeRequestedBy("The Left"), "The Left");
    assert.strictEqual(lib.normalizeRequestedBy("PfE"), "PfE");
  });

  it("splits newlines and commas, dropping duplicates", () => {
    assert.strictEqual(
      lib.normalizeRequestedBy("ECR\nPfE, ECR"),
      "ECR, PfE",
      "the API repeats ECR as a header and in the list"
    );
    assert.strictEqual(lib.normalizeRequestedBy("ECR\nPPE"), "ECR, PPE");
    assert.strictEqual(
      lib.normalizeRequestedBy("S&D\nThe Left"),
      "S&D, The Left"
    );
    assert.strictEqual(lib.normalizeRequestedBy("S&D, Renew"), "S&D, Renew");
  });

  it("strips trailing colons and surrounding whitespace", () => {
    assert.strictEqual(
      lib.normalizeRequestedBy("S&D, Verts/ALE:"),
      "S&D, Verts/ALE"
    );
    assert.strictEqual(lib.normalizeRequestedBy("  PPE ,  ECR  "), "PPE, ECR");
  });

  it("returns null when there is nothing to keep", () => {
    assert.strictEqual(lib.normalizeRequestedBy(null), null);
    assert.strictEqual(lib.normalizeRequestedBy(undefined), null);
    assert.strictEqual(lib.normalizeRequestedBy(""), null);
    assert.strictEqual(lib.normalizeRequestedBy(" , : ,\n"), null);
  });

  it("truncates to the varchar(255) column width", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Group${i}`).join(", ");
    assert.strictEqual(lib.normalizeRequestedBy(long).length, 255);
  });
});

// ─── remarks (roll-call / separate / split requests) ─────────────────

const remarks = require("../remarks");

describe("remarks.parseMentions", () => {
  it("parses a comma-separated amendment list", () => {
    assert.deepStrictEqual(
      remarks.parseMentions("Amendments 6, 7, 9, 10").map((m) => m.number),
      ["6", "7", "9", "10"]
    );
  });

  it("parses sections, recitals and articles", () => {
    const m = remarks.parseMentions("Recital E; § 4; final vote");
    assert.deepStrictEqual(
      m.map((x) => x.type),
      ["recital", "section", "final"]
    );
    assert.strictEqual(remarks.parseMentions("Article 29")[0].number, "29");
  });

  it("keeps the part qualifiers, in words and ordinals", () => {
    const [seven, eight] = remarks.parseMentions("§§ 7, 8 (2nd part)");
    assert.strictEqual(seven.number, "7");
    assert.deepStrictEqual(eight.parts, [2]);
    const [first] = remarks.parseMentions("§ 5 (first part)");
    assert.deepStrictEqual(first.parts, [1]);
    const [multi] = remarks.parseMentions(
      "§ 29 (second, third and fourth parts)"
    );
    assert.deepStrictEqual(multi.parts, [2, 3, 4]);
  });

  it("returns nothing for free text it does not understand", () => {
    assert.deepStrictEqual(remarks.parseMentions("the whole text"), []);
  });
});

describe("remarks.votingKeys", () => {
  it("keys a section vote, and an amendment to a section, to both", () => {
    const keys = remarks.votingKeys({
      subject: "§ 6",
      number: "§",
      request: "RCV",
      name: "RC-B10-0028/2024 – § 6 – Am 6",
    });
    assert.deepStrictEqual(
      keys.map((k) => `${k.type}:${k.number}`),
      ["section:6", "amendment:6"]
    );
  });

  it("takes the part from the rcv marker", () => {
    const keys = remarks.votingKeys({
      subject: "§ 17",
      request: "2/RCV",
      name: "A10-0261/2026 – § 17/2",
    });
    assert.deepStrictEqual(keys[0].parts, [2]);
  });

  it("recognises the final vote of a report or a motion", () => {
    assert.deepStrictEqual(
      remarks.votingKeys({
        subject: "",
        request: "RCV",
        name: "B10-0020/2024 – Motion for a resolution",
      }),
      [{ type: "final" }]
    );
  });
});

describe("remarks.mentionMatches", () => {
  const keys = remarks.votingKeys({
    subject: "§ 17",
    request: "2/RCV",
    name: "A10-0261/2026 – § 17/2",
  });

  it("matches a section listed without parts", () => {
    assert.strictEqual(
      remarks.mentionMatches(
        { type: "section", number: "17", parts: null },
        keys
      ),
      true
    );
  });

  it("matches when the requested parts include ours", () => {
    assert.strictEqual(
      remarks.mentionMatches(
        { type: "section", number: "17", parts: [2, 3] },
        keys
      ),
      true
    );
  });

  it("does not match another part of the same section", () => {
    assert.strictEqual(
      remarks.mentionMatches(
        { type: "section", number: "17", parts: [3] },
        keys
      ),
      false
    );
  });

  it("does not match a different item", () => {
    assert.strictEqual(
      remarks.mentionMatches(
        { type: "section", number: "18", parts: null },
        keys
      ),
      false
    );
  });
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

// ─── saveRcvXml ──────────────────────────────────────────────────────

describe("saveRcvXml", () => {
  it("gzips the XML into data/RCV/<date>.xml.zip", () => {
    const zlib = require("zlib");
    const date = "1900-01-01";
    const xml = "<PV.RollCallVoteResults></PV.RollCallVoteResults>";
    const zipPath = lib.saveRcvXml(date, Buffer.from(xml));
    try {
      assert.strictEqual(zipPath, path.join(lib.RCV_DIR, `${date}.xml.zip`));
      const roundTrip = zlib
        .gunzipSync(require("fs").readFileSync(zipPath))
        .toString();
      assert.strictEqual(roundTrip, xml);
    } finally {
      require("fs").unlinkSync(zipPath);
    }
  });
});
