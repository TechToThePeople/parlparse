#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/reports-backfill.js — create the missing `reports` rows for the
 * references that `rollcalls.ref` points at.
 *
 * `reports` is fed by report.js from the texts-tabled scraper, which only covers
 * a fraction of the references a vote mentions: 982 of 1,636 distinct refs had no
 * row, so ../10 could not show a title, author or committee for 1,827 votes.
 *
 * The OpenAPI publishes those documents: A-10-2024-0008 → REPORT_PLENARY, with
 * `title_dcterms.en` and `creator` (org/<committee>). Commission proposals
 * (C10-…) are NOT published (404) and are skipped, as are the REV variants.
 *
 * The row is inserted with `raw` = the document JSON, so a following
 * `node openapi/report-creator.js` fills `creator` without any extra request.
 *
 * Usage:
 *   node openapi/reports-backfill.js [--dry] [--limit N]
 */

const minimist = require("minimist");
const db = require("../lib/db");
const { fetchDocumentById, TERM } = require("./lib");

// A revised text is listed as B10-0245/2026/REV1 but published under the base
// reference, so the suffix is stripped for the lookup only.
const REF = /^(?:RC-)?[AB]\d+-\d+\/\d{4}(?:\/REV\d+)?$/;

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "help"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/reports-backfill.js [options]

Creates the reports rows that rollcalls.ref points at but that report.js never
scraped, using the document metadata from the EP Open Data API.

Options:
  --dry         Show what would be created, write nothing
  --limit, -n   Process at most N references
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

async function main() {
  const missing = await db.raw(
    `SELECT r.ref AS reference, COUNT(*) AS votes
       FROM rollcalls r
       LEFT JOIN reports rep ON rep.reference = r.ref
      WHERE r.ref IS NOT NULL AND rep.id IS NULL
      GROUP BY r.ref
      ORDER BY votes DESC`
  );

  // stubs written by openapi/agenda.js for reports that have not been voted yet:
  // the row exists (so the join from the agenda works) but has no metadata
  const stubs = await db.raw(
    `SELECT rep.reference, 0 AS votes, 1 AS stub
       FROM reports rep
      WHERE rep.reference IS NOT NULL AND rep.creator IS NULL
        AND rep.title IS NOT NULL`
  );
  const seen = new Set(missing.map((m) => m.reference));
  for (const stub of stubs) if (!seen.has(stub.reference)) missing.push(stub);

  const resolvable = missing.filter((m) => REF.test(m.reference));
  const skipped = missing.filter((m) => !REF.test(m.reference));
  console.log(
    `${missing.length} references without a reports row: ${resolvable.length} resolvable, ${skipped.length} skipped (not an A/B reference)`
  );
  if (skipped.length)
    console.log("   skipped:", skipped.map((s) => s.reference).join(", "));

  const todo = argv.limit ? resolvable.slice(0, argv.limit) : resolvable;
  let created = 0;
  let notFound = 0;

  for (const item of todo) {
    const reference = item.reference;
    const eli = eliId(reference);
    let doc = null;
    try {
      const json = await fetchDocumentById(eli);
      doc = (json.data || [json])[0] || null;
    } catch {
      notFound++;
      console.log(`   ⚠️  ${reference}: not published by the API`);
      continue;
    }

    const title =
      (doc.title_dcterms && doc.title_dcterms.en) ||
      (doc.title && doc.title.en) ||
      null;
    const row = {
      reference,
      title,
      // when the document was tabled; the agenda shows a report before its vote
      date: doc.document_date || null,
      url: doceoUrl(eli),
      term: TERM,
      raw: JSON.stringify(doc),
    };

    if (argv.dry) {
      console.log(
        `   ${reference} → ${JSON.stringify(title || "").slice(0, 90)}`
      );
    } else if (item.stub) {
      // a stub from openapi/agenda.js: fill it instead of inserting a second row
      await db("reports").where("reference", reference).update(row);
    } else {
      await db("reports").insert(row);
    }
    created++;
  }

  console.log(
    `${
      argv.dry ? "would create" : "created"
    } ${created}, not published ${notFound} (${todo.length} references)`
  );
  if (!argv.dry && created)
    console.log(
      "note: run `node openapi/report-creator.js` next to fill reports.creator, then csv.js"
    );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
