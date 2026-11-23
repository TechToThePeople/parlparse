#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/vot-xml.js — fill `rollcalls.ref`, `name` and `committee` from the
 * "Results of votes" XML (PV-10-<date>-VOT_en.xml).
 *
 * The RCV XML only covers roll-call votes, so hand/electronic votes imported
 * from the decisions API come without a reference or a readable name. The VOT
 * XML has, per vote item:
 *
 *   <vote type="REPORT" author="ŽALIMAS"
 *         committee="Committee: Committee on Legal Affairs">
 *     <title>Request for the waiver of the immunity of …</title>
 *     <label>Report: Dainius Žalimas (A10-0284/2026) …</label>
 *     <documents><document documentNumber="A10-0283/2026"/></documents>
 *     <votings><voting votingId="200495" result="ADOPTED" resultType="RAISE_HAND">
 *       <amendmentSubject>§ 3</amendmentSubject>
 *       <amendmentNumber>§</amendmentNumber>
 *
 * What it writes, per voting (matched on `rollcalls.id` = `votingId`):
 *   ref       when empty — documentNumber, else the (RC-)A/B reference in label
 *   name      when empty or still a French RCV string ("Après le § 20 - Am 3")
 *   committee EP acronyms ("ENVI", "ENVI, SANT"), never the full name
 *
 * Counts are never written: they are only compared with what the RCV import
 * stored, and differences are reported.
 *
 * Usage:
 *   node openapi/vot-xml.js 2024-07-17
 *   node openapi/vot-xml.js --all [--dry] [--force-names]
 */

const fs = require("fs");
const path = require("path");
const minimist = require("minimist");
const { parseStringPromise } = require("xml2js");
const db = require("../lib/db");
const { TERM, fetchDocumentById } = require("./lib");
const { parseMentions, votingKeys, mentionMatches } = require("./remarks");

const VOT_DIR = path.resolve(__dirname, "..", "data", "VOT");
const BASE = "https://data.europarl.europa.eu/distribution/doc";

// Full committee name (as spelled in the XML) -> EP acronym. Term 9 and 10
// spellings differ for a few (ENVI especially).
const COMMITTEES = {
  "Foreign Affairs": "AFET",
  Development: "DEVE",
  "International Trade": "INTA",
  Budgets: "BUDG",
  "Budgetary Control": "CONT",
  "Economic and Monetary Affairs": "ECON",
  "Employment and Social Affairs": "EMPL",
  "Environment, Climate and Food Safety": "ENVI",
  "Environment, Public Health and Food Safety": "ENVI",
  "Industry, Research and Energy": "ITRE",
  "Internal Market and Consumer Protection": "IMCO",
  "Transport and Tourism": "TRAN",
  "Regional Development": "REGI",
  "Agriculture and Rural Development": "AGRI",
  Fisheries: "PECH",
  "Culture and Education": "CULT",
  "Legal Affairs": "JURI",
  "Civil Liberties, Justice and Home Affairs": "LIBE",
  "Constitutional Affairs": "AFCO",
  "Women's Rights and Gender Equality": "FEMM",
  Petitions: "PETI",
  "Human Rights": "DROI",
  "Security and Defence": "SEDE",
  "Tax Matters": "FISC",
  "Public Health": "SANT",
  "Housing Crisis": "HOUS",
  "European Democracy Shield": "EUDS",
};

const argv = minimist(process.argv.slice(2), {
  boolean: ["all", "dry", "force-names", "help"],
  alias: { h: "help", a: "all" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/vot-xml.js [<date> | --all] [options]

Arguments:
  <date>     YYYY-MM-DD, e.g. 2024-07-17
  --all, -a  Every date that has a VOT document

Options:
  --dry           Show what would change, write nothing
  --force-names   Replace names even when the current one is not a French RCV string
  --help, -h      Show this help
`);
  process.exit(0);
}

/**
 * First text value of an xml2js node, trimmed. Elements with attributes (e.g.
 * <label status="rcv">) parse to { _: "text", $: {...} } instead of a string.
 */
function txt(node) {
  const v = Array.isArray(node) ? node[0] : node;
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && typeof v._ === "string") return v._.trim();
  return "";
}

/** "Committee: Committee on Legal Affairs and Committee on Public Health" */
function committeeAcronyms(attr) {
  if (!attr) return null;
  const names = String(attr)
    .replace(/^Committee:\s*/, "")
    .split(/\s+and\s+Committee\s+on\s+/i)
    .map((n) => n.replace(/^Committee\s+on\s+/i, "").trim())
    .filter(Boolean);
  const codes = names.map((n) => COMMITTEES[n]).filter(Boolean);
  return codes.length ? [...new Set(codes)].join(", ") : null;
}

/**
 * Reference of the voted item. For motions the label names the consolidated
 * motion that was actually put to the vote (RC-B10-0497/2026) while
 * <documents> lists every tabled one, so the label wins there.
 */
function voteReference(vote, voting) {
  const REF = /((?:RC-)?[ABC]\d+-\d{4}\/\d{4})/;
  const CONSOLIDATED = /(RC-[ABC]\d+-\d{4}\/\d{4})/;

  // 1. the voting's own label: "C10-0258/2026 – Article 1, § 1 …",
  //    "RC-B10-0497/2026 – After § 20 – Am 3", "A10-0280/2026 – … – Am 339"
  const votingLabel = txt(voting && voting.label);
  const rcVoting = votingLabel.match(CONSOLIDATED);
  if (rcVoting) return rcVoting[1];
  const anyVoting = votingLabel.match(REF);
  if (anyVoting) return anyVoting[1];

  // 2. the block's own documents (report / motion / joint motion)
  const docs =
    (vote.documents && vote.documents[0] && vote.documents[0].document) || [];
  const numbers = docs.map((d) => d.$ && d.$.documentNumber).filter(Boolean);
  const consolidated = numbers.find((n) => n.startsWith("RC-"));
  if (consolidated) return consolidated;
  if (numbers.length) return numbers[0];

  // 3. the block label: "Report: X (A10-0275/2026)", "Proposal for a regulation
  //    (COM(2026)0569 – C10-0258/2026 – 2026/0325(COD))"
  const blockLabel = txt(vote.label);
  const rcBlock = blockLabel.match(CONSOLIDATED);
  if (rcBlock) return rcBlock[1];
  const anyBlock = blockLabel.match(REF);
  return anyBlock ? anyBlock[1] : null;
}

const REFERENCE = /^(?:RC-)?[AB]\d+-\d{4}\/\d{4}$/;

/**
 * The annual budget is voted as `<vote type="BUDGET">` draft amendments named
 * by block ("Block 1") or budget line ("01 02 02 51"), with no `<documents>` at
 * all. There is no reference to extract, so the block title gives a virtual one:
 * "Draft general budget … for the financial year 2027 – all sections" →
 * "budget-2027".
 */
/**
 * Procedural blocks (`<vote type="EUGI">`, dvId "000001") carry no document:
 * they are the requests about the sitting's agenda, urgent decisions,
 * adjournments. Their "document" is that day's agenda, so the reference is
 * `agenda-<date>` — per day, since one month can hold several part-sessions.
 */
function agendaReference(vote, date) {
  if (!vote.$ || vote.$.type !== "EUGI") return null;
  return `agenda-${date}`;
}

function budgetReference(vote) {
  if (!vote.$ || vote.$.type !== "BUDGET") return null;
  const title = txt(vote.title);
  const year = title.match(/(\d{4})/);
  return year ? `budget-${year[1]}` : null;
}

/**
 * A "motion" voting: one of the individually tabled texts inside a RESOLUTION
 * block (B10-0496/2026 …). It has no label of its own — the reference sits in
 * amendmentSubject and the tabling group in amendmentAuthor.
 */
function isMotionVoting(voting) {
  return (
    !txt(voting.label) &&
    REFERENCE.test(txt(voting.amendmentSubject)) &&
    REFERENCE.test(txt(voting.amendmentSubject))
  );
}

/**
 * The joint motion of a RESOLUTION block, if there is one. The XML lists it as
 * documentType="RC" with the plain number (B10-0497/2026), so the RC- prefix has
 * to be added back to get the reference used everywhere else.
 */
function jointReference(vote) {
  const docs =
    (vote.documents && vote.documents[0] && vote.documents[0].document) || [];
  const numbers = docs.map((d) => d.$ && d.$.documentNumber).filter(Boolean);
  const joint = docs.find((d) => d.$ && d.$.documentType === "RC");
  if (joint && joint.$.documentNumber)
    return "RC-" + joint.$.documentNumber.replace(/^RC-/, "");
  const rc = numbers.find((n) => n.startsWith("RC-"));
  return rc || null;
}

/** Items are spelled inconsistently ("recital S" vs "Recital S"). */
function normaliseSubject(subject) {
  return String(subject || "")
    .trim()
    .toLowerCase();
}

/**
 * Who asked, from one request node. The XML uses three shapes:
 *   <politicalGroups><label>The Left:</label><groups code="The Left"/>
 *   <splitTitle>Members:</splitTitle>          (split requests, individuals)
 *   <title>ECR, PfE:</title>                   (some roll-call requests)
 */
function groupOf(node) {
  const org = (node.politicalGroups && node.politicalGroups[0]) || {};
  const fromGroups =
    txt(org.label).replace(/:$/, "") ||
    ((org.groups && org.groups[0] && org.groups[0].$) || {}).code ||
    "";
  if (fromGroups) return fromGroups;
  return (txt(node.splitTitle) || txt(node.title)).replace(/:$/, "").trim();
}

/** Is this voting one part of a split vote? ("1", "2", "2/RCV", "split") */
/**
 * What kind of thing the split's partValue is: the wording itself (quoted), a
 * description of a split "text as a whole without/with the words: …", or
 * something else ("those words").
 */
function partKind(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (REFERRED_WORDS.test(v)) return "words";
  if (/^["'\u2018\u201c]/.test(v)) return "quoted";
  if (/^text as a whole without the words?/i.test(v)) return "without-words";
  if (/^text as a whole with the words?/i.test(v)) return "with-words";
  return "other";
}

// "those words", "that word": the part is one word or phrase of the paragraph,
// and the remark names it in a sibling part ("Text as a whole without the
// words: ‘within DG FINS’") instead of repeating it
const REFERRED_WORDS = /^(those|these|that|the) words?$|^(ce|ces) mots?$/i;

/** The words a "without the words: …" sibling part is about. */
function referredWords(values) {
  for (const v of values) {
    // "Text as a whole without the words: …", but also "…’ without the words:
    // ‘…’" and "…’ excluding the words ‘…’"
    const m = String(v).match(
      /(?:\bwithout|\bexcluding) the words?:?\s*(.+)$/i
    );
    if (!m) continue;
    const quoted = m[1].match(/[\u2018'"]([^\u2018\u2019'"]+)[\u2019'"]/);
    const words = (quoted ? quoted[1] : m[1]).trim();
    // "second ‘R’ in ‘SRHR’": the word is the quoted one before "in"
    const inner = words.match(
      /^[^\u2018'"]*[\u2018'"]([^\u2019'"]+)[\u2019'"]\s+in\s/i
    );
    return inner ? inner[1] : words;
  }
  return null;
}

function isSplitPart(request) {
  return /^\d+(\/|$)/.test(request) || request === "split";
}

/**
 * The "Requests for …" remarks of a vote item, which say who asked for the
 * roll-call, the separate votes and the split votes:
 *
 *   requests: [{ group: "The Left", mentions: [...], kind: "rollcall"|"separate" }]
 *   splits:   Map("§ 17" -> Set("ECR"))                  (split votes)
 */
function readRemarks(vote) {
  const remarks =
    vote.remarks && vote.remarks[0] && vote.remarks[0].remark
      ? vote.remarks[0].remark[0]
      : {};
  const requests = [];
  for (const tag of ["remarkRollCalls", "remarkSeparateds"]) {
    const notes =
      (remarks[tag] &&
        remarks[tag][0] &&
        remarks[tag][0].RemarkRollCallSeparated) ||
      [];
    for (const note of notes) {
      const group = groupOf(note);
      const text = txt(note.translation);
      if (group && text)
        requests.push({
          group,
          mentions: parseMentions(text),
          kind: tag === "remarkSeparateds" ? "separate" : "rollcall",
        });
    }
  }

  const splits = new Map();
  const parts = new Map(); // subject -> Map(part number -> text)
  const splitNotes =
    (remarks.remarkSplitVotes &&
      remarks.remarkSplitVotes[0] &&
      remarks.remarkSplitVotes[0].remarkSplitVote) ||
    [];
  for (const note of splitNotes) {
    const group = groupOf(note);
    const items = (note.items && note.items[0] && note.items[0].item) || [];
    for (const item of items) {
      const subject = normaliseSubject(txt(item.title));
      const itemParts =
        (item.parts && item.parts[0] && item.parts[0].part) || [];
      if (subject && itemParts.length && !parts.has(subject)) {
        const values = itemParts.map((p) => txt(p.partValue).trim());
        const words = referredWords(values);
        parts.set(
          subject,
          new Map(
            values.map((v, i) => {
              const referred = REFERRED_WORDS.test(v) && words;
              return [
                i + 1,
                {
                  text: referred ? words : v,
                  kind: referred ? "words" : partKind(v),
                },
              ];
            })
          )
        );
      }
      if (!subject || !group) continue;
      if (!splits.has(subject)) splits.set(subject, new Set());
      splits.get(subject).add(group);
    }
  }
  return { requests, splits, parts };
}

/** Groups that asked for this vote, from the block's remarks. */
function requesters(voting, remarks) {
  const request = voteRequest(voting);
  const part = isSplitPart(request);
  const asked = /RCV|sep|split|\//.test(request);
  // no marker and no split: still possibly a requested separate vote, the loop
  // below decides (roll-call entries are skipped in that case)
  if (!part && !asked && !remarks.requests.length)
    return { groups: [], separate: false };
  const keys = votingKeys({
    subject: txt(voting.amendmentSubject),
    number: txt(voting.amendmentNumber),
    request,
    name: txt(voting.label) || txt(voting.title),
  });
  const groups = [];
  // a header can name several groups at once ("ECR, PfE:"), and the same group
  // can appear in both the roll-call and the separate-vote lists
  const add = (label) => {
    for (const name of String(label || "").split(","))
      if (name.trim() && !groups.includes(name.trim()))
        groups.push(name.trim());
  };
  let separate = false;
  for (const entry of remarks.requests) {
    // a roll-call request only applies to votes that carry an rcv marker, but a
    // separate vote can be taken by show of hands (no marker at all)
    if (entry.kind === "rollcall" && !asked) continue;
    if (entry.mentions.some((m) => mentionMatches(m, keys))) {
      add(entry.group);
      if (entry.kind === "separate") separate = true;
    }
  }
  if (part) {
    for (const group of remarks.splits.get(
      normaliseSubject(txt(voting.amendmentSubject))
    ) || [])
      add(group);
  }
  return { groups, separate };
}

/** The `rcv/value` marker:/** The `rcv/value` marker: "RCV", "EV", "sep", "split", "2/RCV", … */
function voteRequest(voting) {
  const rcv = voting.rcv && voting.rcv[0];
  return rcv ? txt(rcv.value) : "";
}

/**
 * A split vote is one item voted in parts, each a separate voting with the same
 * subject: "§ 3" part 1 and part 2. The part is in the rcv marker ("1", "2",
 * "2/RCV"), so put it in the name, the way the EP's own labels do ("§ 17/2").
 */
function withPart(name, request) {
  if (!name) return name;
  const m = String(request || "").match(/^(\d+)(?:\/|$)/);
  if (!m) return name;
  const part = m[1];
  if (new RegExp(`/${part}\\b`).test(name)) return name;
  return `${name}/${part}`;
}

/** Readable name for one voting, in English. */
function votingName(voting) {
  const label = txt(voting.label);
  if (label) return label;
  const subject = txt(voting.amendmentSubject);
  const number = txt(voting.amendmentNumber);
  if (subject) {
    if (number && /\d/.test(number) && !subject.includes(number))
      return `${subject} – ${number}`;
    return subject;
  }
  return txt(voting.title) || null;
}

/** Names coming from the French RCV XML, e.g. "Après le § 20 - Am 3". */
function looksLikeRcvName(name) {
  if (!name) return true;
  return /^(Apr[èe]s|Avant|Consid[ée]rant|Paragraphe|Alin[ée]a|Amendement|Article|Annexe|Proposition|§)/i.test(
    name
  );
}

/**
 * The English XML lives at two different places depending on the age of the
 * document:
 *   recent  distribution/doc/PV-10-<date>-VOT_en.xml            (the shortcut)
 *   older   distribution/reds_iPlPv_Vot/PV-10-<date>-VOT/…_en.xml
 * The second is only discoverable from the document metadata, so the shortcut is
 * tried first and the metadata is used as a fallback.
 */
async function xmlUrls(date) {
  const urls = [`${BASE}/PV-${TERM}-${date}-VOT_en.xml`];
  try {
    const json = await fetchDocumentById(`PV-${TERM}-${date}-VOT`);
    const doc = (json.data || [json])[0] || {};
    for (const expression of doc.is_realized_by || []) {
      if (!String(expression.language || "").endsWith("ENG")) continue;
      for (const m of expression.is_embodied_by || []) {
        if (String(m.format || "").includes("XML") && m.is_exemplified_by)
          urls.push(
            `https://data.europarl.europa.eu/${m.is_exemplified_by.replace(
              /^\//,
              ""
            )}`
          );
      }
    }
  } catch {
    // no metadata: the shortcut was the only hope
  }
  return urls;
}

async function fetchXml(date) {
  fs.mkdirSync(VOT_DIR, { recursive: true });
  const file = path.join(VOT_DIR, `${date}.xml`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");

  let lastError = null;
  for (const url of await xmlUrls(date)) {
    // The EP server 500s on `accept: */*` for the redmapl3-hosted XML but
    // redirects fine with a browser-ish accept header, hence the odd value.
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      lastError = `HTTP ${res.status} for ${url}`;
      continue;
    }
    const xml = await res.text();
    fs.writeFileSync(file, xml);
    return xml;
  }
  throw new Error(lastError || `no XML for ${date}`);
}

/** A virtual reference (budget-<year>, agenda-<day>) needs a reports row. */
async function ensureBudgetReport(reference, title) {
  const existing = await db("reports").where("reference", reference).first();
  if (existing) return existing;
  await db("reports").insert({
    reference,
    title,
    term: TERM,
  });
  return null;
}

/**
 * A C10-xxxx/yyyy reference is a Commission proposal: the OpenAPI publishes no
 * document for it (404), but the block knows enough to describe it — the title,
 * and the procedure reference ("2026/0325(COD)") that the oeil page answers to,
 * which is also where `openapi/report.js` picks up the committee.
 */
function oeilUrlFor(label) {
  const m = String(label).match(/(\d{4}\/\d{4}\([A-Z]+\))/);
  if (!m) return null;
  const reference = m[1].replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"));
  return `https://oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do?reference=${reference}&l=en`;
}

async function ensureProposalReport(reference, title, url) {
  const existing = await db("reports").where("reference", reference).first();
  if (existing) return existing;
  await db("reports").insert({
    reference,
    title,
    url,
    term: TERM,
  });
  return null;
}

async function processDate(date, stats) {
  // nothing to do for a day without votes (update.sh calls this every day)
  const dayVotes = await db("rollcalls")
    .where("date", "like", `${date}%`)
    .count("* as n")
    .first();
  if (!dayVotes || !dayVotes.n) {
    stats.skipped++;
    return;
  }

  let xml;
  try {
    xml = await fetchXml(date);
  } catch (e) {
    console.warn(`   ⚠️  ${date}: ${e.message}`);
    stats.skipped++;
    return;
  }

  const doc = await parseStringPromise(xml);
  const votes = (doc.file && doc.file.sitting && doc.file.sitting[0].votes
    ? doc.file.sitting[0].votes[0].vote
    : null) || [doc.file.sitting[0].votes[0].vote];

  for (const vote of votes) {
    const joint = jointReference(vote);
    const blockTitle = txt(vote.title);
    const committee = committeeAcronyms(vote.$ && vote.$.committee);
    const remarks = readRemarks(vote);
    const budgetRef = budgetReference(vote);
    if (budgetRef && !argv.dry)
      await ensureBudgetReport(budgetRef, txt(vote.title));
    const agendaRef = agendaReference(vote, date);
    if (agendaRef && !argv.dry)
      await ensureBudgetReport(agendaRef, `Agenda of the sitting of ${date}`);
    const votings =
      (vote.votings && vote.votings[0] && vote.votings[0].voting) || [];

    for (const voting of votings) {
      const id = Number(voting.$ && voting.$.votingId);
      if (!id) continue;
      const row = await db("rollcalls").where("id", id).first();
      if (!row) {
        stats.unmatched++;
        continue;
      }

      const name = votingName(voting);
      const update = {};

      // A vote whose row carries only a date gets the time of its own timestamp
      // — but only when that timestamp is on the sitting's day: for a show of
      // hands it is the day the minutes were published (a July sitting stamped
      // in October), and for a roll-call the row already has the RCV time.
      const stamp = voting.$ && voting.$.voteTimestamp;
      if (stamp && !String(row.date).includes(":")) {
        const day = stamp.slice(0, 10);
        const time = stamp.slice(11, 19);
        if (
          day === String(date).slice(0, 10) &&
          /^\d{2}:\d{2}:\d{2}$/.test(time)
        )
          update.date = `${day} ${time}`;
      }

      const request = voteRequest(voting);
      if (request && row.vote_request !== request)
        update.vote_request = request;

      // the authoritative list of amendments this vote is about ("4= 7=",
      // "274D", "9-14"): the names derived from labels are lossy
      const amendments = txt(voting.amendmentNumber);
      if (/\d/.test(amendments) && row.amendment_number !== amendments)
        update.amendment_number = amendments.slice(0, 100);
      // "2/RCV", "3/EV", ... = the n-th part of a split vote: keep the text that
      // was voted, it exists nowhere else in machine-readable form
      if (isSplitPart(request)) {
        const subject = normaliseSubject(txt(voting.amendmentSubject));
        const num = Number(String(request).match(/^(\d+)/)[1]);
        const part = (remarks.parts.get(subject) || new Map()).get(num);
        if (part) {
          stats.texts++;
          if (!argv.dry)
            await db("rollcall_texts")
              .insert({
                rollcall: id,
                section: txt(voting.amendmentSubject),
                part: num,
                text: part.text,
                kind: part.kind,
                source: "vot-xml",
                chars: part.text.length,
                updated_at: new Date().toISOString(),
              })
              .onConflict("rollcall")
              .merge();
        } else {
          stats.noText++;
        }
        const by = [
          ...new Set(
            [
              ...(remarks.splits.get(
                normaliseSubject(txt(voting.amendmentSubject))
              ) || []),
            ].flatMap((label) =>
              String(label)
                .split(",")
                .map((n) => n.trim())
            )
          ),
        ]
          .filter(Boolean)
          .join(", ");
        if (by && row.split_requested_by !== by) update.split_requested_by = by;
      }
      // requested_by comes from the remarks, not from the API's
      // responsible_organization_label (which is the amendment's author)
      const { groups: asked, separate } = requesters(voting, remarks);
      // a separate vote taken by show of hands has no rcv marker of its own
      if (!request && separate) update.vote_request = "sep";
      if (asked.length) {
        const by = asked.join(", ").slice(0, 255);
        if (row.requested_by !== by) update.requested_by = by;
        if (row.requested_source !== "remarks")
          update.requested_source = "remarks";
      }

      // the voting's own label often names the document it amends; the annual
      // budget has none, its block title gives "budget-<year>"
      const ref = voteReference(vote, voting) || budgetRef || agendaRef;
      if (/^C\d+-/.test(ref || "") && !argv.dry)
        await ensureProposalReport(
          ref,
          txt(vote.title) || null,
          oeilUrlFor(txt(vote.label))
        );
      if (isMotionVoting(voting)) {
        // An individual motion: the vote belongs to the joint resolution (so a
        // report filter still lists it), the motion itself goes to doc_ref, and
        // the name says whose motion lapsed — "B10-0496/2026 (The Left) – subject"
        const motion = txt(voting.amendmentSubject);
        const group = txt(voting.amendmentAuthor);
        if (joint && row.ref !== joint) update.ref = joint;
        if (motion && row.doc_ref !== motion) update.doc_ref = motion;
        const label =
          motion && group
            ? `${motion} (${group})` + (blockTitle ? ` – ${blockTitle}` : "")
            : blockTitle;
        if (label && row.name !== label) update.name = label.slice(0, 255);
      } else {
        if (ref && !row.ref) update.ref = ref;
        const named = withPart(name, request);
        if (named && named !== row.name) {
          if (argv["force-names"] || looksLikeRcvName(row.name))
            update.name = named;
        }
      }
      if (committee && !row.committee) update.committee = committee;

      // never write counts, only compare them with what the RCV import stored
      const favor = Number(voting.$.numberFavor);
      if (Number.isFinite(favor) && row.for !== null) {
        const diff =
          favor !== row.for ||
          Number(voting.$.numberAgainst) !== row.against ||
          Number(voting.$.numberAbstention) !== row.abstention;
        if (diff) {
          stats.mismatch++;
          if (stats.mismatch <= 10)
            console.log(
              `   ⚠️  ${id}: rcv ${row.for}/${row.against}/${row.abstention} vs vot ${favor}/${voting.$.numberAgainst}/${voting.$.numberAbstention}`
            );
        }
      }

      if (!Object.keys(update).length) {
        stats.unchanged++;
        continue;
      }
      if (argv.dry) {
        console.log(`   ${id} ${JSON.stringify(update)}`);
      } else {
        await db("rollcalls").where("id", id).update(update);
      }
      stats.updated++;
    }
  }
}

async function main() {
  let dates;
  if (argv.all) {
    // The sitting dates we have in the database — no API call, so no rate limit,
    // and dates without roll-calls are irrelevant anyway.
    const rows = await db("plenaries").distinct("date").orderBy("date");
    dates = rows.map((r) => r.date).filter(Boolean);
    console.log(`📋 ${dates.length} sitting dates from the database`);
  } else {
    const input = argv._.length ? argv._[0] : null;
    if (!input) {
      console.error("Error: provide a date or --all");
      process.exit(1);
    }
    dates = [input];
  }
  console.log(`   → ${dates.length} dates`);

  const stats = {
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    mismatch: 0,
    skipped: 0,
    texts: 0,
    noText: 0,
  };
  for (let i = 0; i < dates.length; i++) {
    if (dates.length > 1)
      process.stdout.write(`\r${i + 1}/${dates.length} ${dates[i]}   `);
    await processDate(dates[i], stats);
  }
  if (dates.length > 1) process.stdout.write("\n");

  console.log(
    `${argv.dry ? "would update" : "updated"} ${stats.updated}, unchanged ${
      stats.unchanged
    }, not in db ${stats.unmatched}, count mismatches ${
      stats.mismatch
    }, skipped ${stats.skipped} (${dates.length} dates)`
  );
  console.log(
    `split parts: ${stats.texts} texts saved, ${stats.noText} without a text in the XML`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
