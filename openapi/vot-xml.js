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
const { TERM } = require("./lib");

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
function voteReference(vote) {
  const label = txt(vote.label);
  const rcFromLabel = label.match(/(RC-[AB]\d+-\d{4}\/\d{4})/);
  if (rcFromLabel) return rcFromLabel[1];

  const docs =
    (vote.documents && vote.documents[0] && vote.documents[0].document) || [];
  const numbers = docs.map((d) => d.$ && d.$.documentNumber).filter(Boolean);
  const consolidated = numbers.find((n) => n.startsWith("RC-"));
  if (consolidated) return consolidated;
  if (numbers.length) return numbers[0];

  const any = label.match(/([AB]\d+-\d{4}\/\d{4})/);
  return any ? any[1] : null;
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
  return /^(Apr[èe]s|Avant|Consid[ée]rant|Paragraphe|Alin[ée]a|Amendement|Article|Annexe|§)/i.test(
    name
  );
}

async function fetchXml(date) {
  fs.mkdirSync(VOT_DIR, { recursive: true });
  const file = path.join(VOT_DIR, `${date}.xml`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const url = `${BASE}/PV-${TERM}-${date}-VOT_en.xml`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const xml = await res.text();
  fs.writeFileSync(file, xml);
  return xml;
}

async function processDate(date, stats) {
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
    const ref = voteReference(vote);
    const committee = committeeAcronyms(vote.$ && vote.$.committee);
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
      if (ref && !row.ref) update.ref = ref;
      if (committee && !row.committee) update.committee = committee;
      if (name && name !== row.name) {
        if (argv["force-names"] || looksLikeRcvName(row.name))
          update.name = name;
      }

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
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
