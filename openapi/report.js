#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/report.js — fill the `reports` table in one pass.
 *
 * Two jobs that used to be two scripts (and, before that, four):
 *
 *   1. create the row for a reference we vote on but never scraped —
 *      `rollcalls.ref`, and `agenda_items.report` for a vote that has not
 *      happened yet (a "stub" with the title the agenda gives);
 *   2. fill `creator` — the committees for a report (A10-…), the groups that
 *      tabled it for a motion (B10-… / RC-B10-…), from the API's creator array,
 *      falling back to the OEIL page when the API lists no committee.
 *
 * Everything comes from the document API, so a reference is fetched once:
 *
 *   GET /api/v2/documents/A-10-2026-0041
 *     title_dcterms.en   the long title
 *     document_date      when it was tabled
 *     creator            ["org/ECON", "org/ENVI", "person/190713", …]
 *     is_realized_by     the DOCX/PDF distributions
 *
 * Usage:
 *   node openapi/report.js            # create what is missing, fix what is partial
 *   node openapi/report.js --dry      # say what would change
 *   node openapi/report.js --limit 20
 *   node openapi/report.js --force    # re-fetch and rewrite every row
 */

const path = require("path");
const { spawnSync } = require("child_process");
const minimist = require("minimist");
const db = require("../lib/db");
const { clause, list: dateList } = require("../lib/dates");
const { fetchDocumentById, TERM } = require("./lib");

// API group codes -> the names used in meps.eugroup (what ../10 colours by).
const GROUP_NAMES = {
  PPE: "EPP",
  "S-D": "S&D",
  S_D: "S&D",
  "S&D": "S&D",
  RENEW: "Renew",
  "VERTS-ALE": "Greens/EFA",
  VERTS_ALE: "Greens/EFA",
  ECR: "ECR",
  "THE-LEFT": "The Left",
  THE_LEFT: "The Left",
  PFE: "PfE",
  ESN: "ESN",
  NI: "NA",
  NA: "NA",
};

/** Only these are documents the API publishes: A/B reports and joint motions. */
const REF = /^(?:RC-)?[AB]\d+-\d+\/\d{4}$/;

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "force", "procedure", "subject", "help"],
  alias: { h: "help", n: "limit" },
  // a report brings its procedure, and the procedure its subjects: both run
  // unless --no-procedure / --no-subject say otherwise
  default: { procedure: true, subject: true },
});

if (require.main === module && argv.help) {
  console.log(`
Usage: node openapi/report.js [options]

Creates the reports rows that rollcalls.ref and agenda_items.report point at, and
fills reports.creator, using the document metadata from the EP Open Data API.

Options:
  --dry         Show what would change, write nothing
  --limit, -n   Process at most N references
  --force       Re-fetch and rewrite every row
  --procedure   then openapi/procedure.js (default on, --no-procedure to skip)
  --subject     then openapi/subject.js   (default on, --no-subject to skip)
  --help, -h    Show this help
`);
  process.exit(0);
}

/**
 * "A10-0098/2025" -> "A-10-2025-0098"; /REV1 suffixes are ignored.
 * A joint motion keeps its RC- and loses the B: "RC-B10-0191/2024" is published
 * as "RC-10-2024-0191", and the B- form is a different (single-group) document.
 */
function eliId(reference) {
  const base = String(reference).replace(/\/REV\d+$/, "");
  const m = base.match(/^(RC-)?([AB])(\d+)-(\d+)\/(\d{4})$/);
  if (!m) return null;
  if (m[1]) return `RC-${m[3]}-${m[5]}-${m[4]}`;
  return `${m[2]}-${m[3]}-${m[5]}-${m[4]}`;
}

/** Published-document URL on the EP site, predictable from the ELI id. */
function doceoUrl(eli) {
  return `https://www.europarl.europa.eu/doceo/document/${eli.toUpperCase()}_EN.html`;
}

/** Creator codes from an OpenAPI `creator` array; groups get their short name. */
function creatorsFromApi(creator) {
  const out = [];
  for (const entry of creator || []) {
    if (!String(entry).startsWith("org/")) continue;
    const code = String(entry).slice(4).toUpperCase();
    const name = GROUP_NAMES[code] || code;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Committee badges in the responsible-committee table of an oeil page. The
 * header reads "Committee responsible", but joint procedures say "Joint
 * committee responsible", so match both.
 */
function committeesFromOeil(html) {
  const header = html.match(/(?:joint\s+)?committees?\s+responsible/i);
  if (!header) return [];
  const start = header.index;
  const end = html.indexOf("</table>", start);
  const table = html.slice(start, end < 0 ? undefined : end);
  const out = [];
  for (const m of table.matchAll(/es_badge-committee[^>]*>\s*([A-Z_0-9-]+)/g)) {
    const code = m[1].replace(/_/g, "-");
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

async function creatorsFromUrl(url) {
  const res = await fetch(url.replace(/&amp;/g, "&"), {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return committeesFromOeil(await res.text());
}

const stats = {
  created: 0,
  updated: 0,
  unchanged: 0,
  noCreator: 0,
  notFound: 0,
  failed: 0,
};

/** The document behind a reference, or null when the API does not publish it. */
async function document(reference) {
  const eli = eliId(reference);
  if (!eli) return null;
  try {
    const json = await fetchDocumentById(eli);
    const doc = (json.data || [json])[0];
    return doc ? { doc, eli } : null;
  } catch (e) {
    // 404 = not published; a 429 or a timeout is not an answer at all
    if (e.status === 404) return null;
    throw e;
  }
}

/** The row a document becomes; `raw` keeps the whole payload for later. */
function rowOf(reference, { doc, eli }) {
  const creation = creatorsFromApi(doc.creator);
  return {
    reference,
    title:
      (doc.title_dcterms && doc.title_dcterms.en) ||
      (doc.title && doc.title.en) ||
      null,
    // when it was tabled: the agenda shows a report before its vote
    date: doc.document_date || null,
    url: doceoUrl(eli),
    creator: creation.length ? creation.join(", ").slice(0, 255) : null,
    raw: JSON.stringify(doc),
    term: TERM,
  };
}

async function main() {
  // 1. what needs a row: references a vote or the agenda names, and rows the
  //    old scraper left without a url
  // --dates limits the list to the references a vote or an agenda point of those
  // sittings names (openapi/update.js passes the dates it is working on)
  const dayVotes = clause("r.date", argv.dates);
  const dayAgenda = clause("a.date", argv.dates);
  const missing = await db.raw(
    `SELECT reference, votes FROM (
       SELECT r.ref AS reference, COUNT(*) AS votes
         FROM rollcalls r LEFT JOIN reports rep ON rep.reference = r.ref
        WHERE r.ref IS NOT NULL AND rep.id IS NULL AND r.ref != 'EP error'
          ${dayVotes.sql}
        GROUP BY r.ref
       UNION ALL
       SELECT a.report AS reference, 0 AS votes
         FROM agenda_items a LEFT JOIN reports rep ON rep.reference = a.report
        WHERE a.report IS NOT NULL AND rep.id IS NULL
          ${dayAgenda.sql}
        GROUP BY a.report
     ) GROUP BY reference ORDER BY votes DESC, reference`,
    [...dayVotes.bindings, ...dayAgenda.bindings]
  );
  const partial = await db("reports")
    .select("reference")
    .where((q) => q.whereNull("url").orWhereNull("raw").orWhereNull("creator"))
    .modify((query) => {
      // a row with no url is worth a request when its report was voted or
      // planned; --dates narrows that to the sittings of this run
      if (!argv.dates) return;
      query.whereIn(
        "reference",
        db("rollcalls")
          .select("ref")
          .whereIn(db.raw("substr(date, 1, 10)"), dateList(argv.dates))
      );
    });
  const seen = new Set(missing.map((m) => m.reference));
  const todo = [...missing];
  for (const row of partial)
    if (!seen.has(row.reference)) todo.push({ reference: row.reference });

  const resolvable = todo.filter((t) => REF.test(t.reference));
  console.log(
    `${todo.length} reference(s) to look at: ${resolvable.length} with a document, ` +
      `${todo.length - resolvable.length} skipped (not an A/B reference)`
  );
  const list = argv.limit
    ? resolvable.slice(0, Number(argv.limit))
    : resolvable;

  for (const [i, item] of list.entries()) {
    const reference = item.reference;
    const existing = await db("reports").where("reference", reference).first();
    if (existing && !argv.force && existing.creator && existing.raw) {
      stats.unchanged++;
      continue;
    }
    process.stdout.write(`   [${i + 1}/${list.length}] ${reference} … `);
    let found;
    try {
      found = await document(reference);
    } catch (e) {
      stats.failed++;
      console.log(`API error: ${e.message}`);
      continue;
    }
    if (!found) {
      stats.notFound++;
      console.log("not published by the API");
      continue;
    }
    const row = rowOf(reference, found);

    // a motion's API entries are groups, not the committee responsible: the
    // oeil page knows it, and ../10 shows it
    if (!row.creator && row.url.includes("oeil")) {
      try {
        const committees = await creatorsFromUrl(row.url);
        if (committees.length)
          row.creator = committees.join(", ").slice(0, 255);
      } catch {
        // the API's groups are still better than nothing
      }
    }

    if (argv.dry) {
      console.log(
        `${existing ? "update" : "create"} "${String(row.title).slice(
          0,
          60
        )}" ` + `[${row.date || "no date"}] ${row.creator || "(no creator)"}`
      );
      continue;
    }
    if (existing) {
      await db("reports").where("id", existing.id).update(row);
      stats.updated++;
      console.log("updated");
    } else {
      await db("reports").insert(row);
      stats.created++;
      console.log("created");
    }
    if (!row.creator) stats.noCreator++;
  }

  // 2. rows that exist with a creator-less raw: the API's groups, then oeil
  if (!argv.limit) {
    const orphans = await db("reports")
      .select("id", "reference", "raw", "url")
      .whereNull("creator");
    for (const report of orphans) {
      let creators = [];
      try {
        creators = creatorsFromApi(JSON.parse(report.raw || "null")?.creator);
      } catch {
        creators = [];
      }
      if (!creators.length && report.url && report.url.includes("oeil")) {
        try {
          creators = await creatorsFromUrl(report.url);
        } catch (e) {
          console.warn(`   ⚠️  ${report.reference}: oeil ${e.message}`);
        }
      }
      if (!creators.length) {
        stats.noCreator++;
        continue;
      }
      if (argv.dry) continue;
      await db("reports")
        .where("id", report.id)
        .update({ creator: creators.join(", ").slice(0, 255) });
      stats.updated++;
    }
  }

  console.log(
    `\n${argv.dry ? "would create" : "created"} ${stats.created}, ` +
      `${argv.dry ? "would update" : "updated"} ${stats.updated}, ` +
      `unchanged ${stats.unchanged}, no creator ${stats.noCreator}, ` +
      `not published ${stats.notFound}, unreadable ${stats.failed} ` +
      `(${list.length} reference(s))`
  );
  if (!argv.dry && (stats.created || stats.updated))
    console.log("note: run csv.js next to publish text_tabled.csv to ../10");

  // A report belongs to a procedure, and the procedure has its own subjects.
  // Both passes are incremental, so they only cost requests for what is new.
  if (!argv.dry && !argv.help) {
    for (const [flag, script] of [
      ["procedure", "procedure.js"],
      ["subject", "subject.js"],
    ]) {
      if (!argv[flag]) continue;
      console.log(`\n→ ${script}`);
      const run = spawnSync(process.execPath, [path.join(__dirname, script)], {
        stdio: "inherit",
      });
      if (run.status !== 0)
        console.warn(`   ⚠️  ${script} exited with ${run.status}`);
    }
  }
}

/**
 * Importable entry point: `run({ limit: 5 })` merges the options over the parsed
 * argv and does what the CLI does. openapi/update.js calls this.
 */
async function run(options = {}) {
  Object.assign(argv, options);
  await main();
}

module.exports = { run, main, argv };

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
