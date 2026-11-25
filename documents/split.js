#!/usr/bin/env node
/* eslint-env node */
/**
 * documents/split.js — fill `rollcall_texts` for votes on a section or a recital by
 * extracting the passage from the markdown already saved by documents/oeil.js
 * (data/content/oeil/<reference>.md). No PDF, no conversion, no model call.
 *
 * Only what can be found unambiguously is written:
 *   § 19        the "19." item of the resolution's numbered paragraphs
 *   Recital U   the "U. whereas …" item (letters or numbers)
 * Everything else is counted and, for the interesting failures, printed:
 *   Article N   the article text lives in the Commission proposal, not in the
 *               report (0 of the sampled reports have "Article N" headings)
 *   Citation N  the N-th "having regard to" bullet (1-based, as the EP numbers
 *               them); skipped when the index is past the end of the list, which
 *               is how a wrong `ref` used to show up
 *
 * Usage:
 *   node documents/split.js --dry --limit 5      # see what it would write
 *   node documents/split.js                      # write for every report with markdown
 *   node documents/split.js --ref A10-0275/2026  # one report
 */

const fs = require("fs");
const path = require("path");
const minimist = require("minimist");
const db = require("../lib/db");
const { toRules } = require("../lib/markdown");
const { isDocumentRef } = require("../lib/refs");

const ROOT = path.resolve(__dirname, "..");
const OEIL_DIR = path.join(ROOT, "data", "content", "oeil");

const PARAGRAPH = /^§\s*(\d{1,3})$/;
const RECITAL = /^(?:Recital|Considérant)\s+([A-Z]|\d{1,3})$/i;
const CITATION = /^Citation\s+(\d{1,3})$/i;
const ITEM = /^([A-Z]|\d{1,3})[.)]\s+(.*)$/;
// the resolution's operative part starts under one of these headings
const BODY = /^(MOTION FOR (A )?(EUROPEAN PARLIAMENT )?RESOLUTION|PROPOSITION DE R[ÉE]SOLUTION|DRAFT (EUROPEAN PARLIAMENT )?(LEGISLATIVE )?RESOLUTION|PROJET DE (R[ÉE]SOLUTION|D[ÉE]CISION))/i;
// numbered lines in the footnotes look exactly like paragraphs
const FOOTNOTE = /ELI:|\[↑\]|OJ C,|^OJ /i;

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "help"],
  string: ["ref"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node documents/split.js [options]

Extracts the text of the votes on a paragraph (§ 19) or a recital (Recital U)
from data/content/oeil/<reference>.md and writes it to rollcall_texts.

  --dry        print the matches instead of writing
  --limit, -n  stop after N reports
  --ref <ref>  only that report
  --help, -h
`);
  process.exit(0);
}

/** reference A10-0275/2026 -> A10-0275_2026.md */
const fileName = (reference) => String(reference).replace(/\//g, "_") + ".md";

/**
 * Split a document into its recitals and its numbered paragraphs.
 *
 * Recitals are the items whose text starts with "whereas" ("A. whereas …" in
 * most reports, "1. whereas …" in a few). Paragraphs are the numbered items
 * after the last "MOTION FOR A RESOLUTION" heading, and only when they number
 * 1..N consecutively, otherwise the list is the citations or an annex.
 */
function segments(markdown) {
  const lines = markdown.split("\n");
  const items = [];
  let current = null;

  lines.forEach((line, index) => {
    const m = line.match(ITEM);
    if (m) {
      current = { key: m[1], text: m[2].trim(), line: index + 1 };
      items.push(current);
      return;
    }
    // a continuation line belongs to the item above it
    if (current && line.trim() && !/^[#|<\s]/.test(line.slice(0, 1))) {
      current.text += " " + line.trim();
    }
  });

  const recitals = new Map();
  const paragraphs = new Map();
  const citations = [];

  for (const item of items) {
    if (/^whereas\b/i.test(item.text)) {
      const key = item.key.toUpperCase();
      if (!recitals.has(key)) recitals.set(key, []);
      recitals.get(key).push({ line: item.line, text: item.text });
    }
  }

  // the "having regard to" list, in the order the EP numbers it
  for (const line of lines) {
    const m = line.trim().match(/^[–—−-]\s*(having regard to.*)$/i);
    if (m) citations.push(m[1].trim());
  }

  // The resolution's own paragraphs: the 1, 2, 3… run after its heading. A
  // budget or discharge report also carries committee opinions with their own
  // numbering, so that run — not the whole document — is the authority.
  const bodyIndex = lines.findIndex((line) => BODY.test(line.trim()));
  if (bodyIndex >= 0) {
    let expected = 1;
    for (let i = bodyIndex + 1; i < lines.length; i++) {
      const m = lines[i].trim().match(ITEM);
      if (!m || /^whereas\b/i.test(m[2]) || FOOTNOTE.test(m[2])) continue;
      const n = Number(m[1]);
      if (n !== expected) break;
      if (!paragraphs.has(n)) paragraphs.set(n, []);
      paragraphs.get(n).push({ line: i + 1, text: m[2].trim() });
      expected++;
    }
  }

  // A number that appears exactly once in the whole document is still usable
  // when the run above found nothing (body heading missing or worded oddly).
  const everywhere = new Map();
  lines.forEach((line, i) => {
    const m = line.trim().match(ITEM);
    if (!m || /^whereas\b/i.test(m[2]) || FOOTNOTE.test(m[2])) return;
    const n = Number(m[1]);
    if (!everywhere.has(n)) everywhere.set(n, []);
    everywhere.get(n).push({ line: i + 1, text: m[2].trim() });
  });

  return { recitals, paragraphs, citations, everywhere };
}

const stats = {
  reports: 0,
  paragraph: 0,
  recital: 0,
  citation: 0,
  fromWholeDocument: 0,
  ambiguous: 0,
  notFound: 0,
  unsupported: 0,
  noMarkdown: 0,
};

async function processReport(reference, votes) {
  const file = path.join(OEIL_DIR, fileName(reference));
  if (!fs.existsSync(file)) {
    stats.noMarkdown += votes.length;
    console.log(
      `   ⚠️  ${reference}: no markdown (run documents/oeil.js --dry for it)`
    );
    return;
  }
  const { recitals, paragraphs, citations, everywhere } = segments(
    fs.readFileSync(file, "utf8")
  );
  stats.reports++;

  const stored = await db("reports").where("reference", reference).first("url");
  const sourceUrl = stored && stored.url ? stored.url : null;

  for (const vote of votes) {
    // the API sometimes prefixes the name with a dash: "– § 6", "– Recital E"
    // The name can carry a prefix ("A10-0288/2026 – Zdechovský – § 28"): the key
    // is what comes after the last separator, as in documents/amendments.js
    const full = String(vote.name || "").replace(/^[–—−-]\s*/, "");
    const name = full
      .split(/\s[–—−-]\s/)
      .pop()
      .trim();
    let found = null;
    let kind = null;
    let bucket = null;

    const p = name.match(PARAGRAPH);
    const r = name.match(RECITAL);
    const c = name.match(CITATION);
    if (p) {
      const n = Number(p[1]);
      bucket = paragraphs.get(n);
      if (!bucket || !bucket.length) {
        const anywhere = everywhere.get(n) || [];
        if (anywhere.length === 1) {
          bucket = anywhere;
          stats.fromWholeDocument++;
        }
      }
      kind = "paragraph";
    } else if (r) {
      bucket = recitals.get(r[1].toUpperCase());
      kind = "recital";
    } else if (c) {
      // 1-based index into the "having regard to" list
      const n = Number(c[1]);
      bucket =
        n >= 1 && n <= citations.length ? [{ text: citations[n - 1] }] : null;
      kind = "citation";
    } else {
      stats.unsupported++;
      continue;
    }

    if (!bucket || !bucket.length) {
      stats.notFound++;
      continue;
    }
    if (bucket.length > 1) {
      stats.ambiguous++;
      console.log(
        `   ⚠️  ${vote.id} ${name} (${reference}): ${bucket.length} matching blocks`
      );
      for (const block of bucket)
        console.log(
          `        line ${block.line || "?"}: "${block.text.slice(0, 90)}…"`
        );
      continue;
    }
    found = bucket[0].text;
    if (found.length < 40 || found.length > 4000) {
      stats.notFound++;
      continue;
    }

    if (argv.dry) {
      console.log(`   ${vote.id} ${kind} ${name} → "${found.slice(0, 70)}…"`);
    } else {
      await db("rollcall_texts")
        .insert({
          rollcall: vote.id,
          section: name,
          part: null,
          text: toRules(found),
          kind,
          source: "markdown",
          source_url: sourceUrl,
          chars: found.length,
          updated_at: new Date().toISOString(),
        })
        .onConflict("rollcall")
        .merge();
    }
    stats[kind]++;
  }
}

/**
 * The paragraph behind a split part ("§ 140/2 – those words"): the reader gets
 * the sentence in place, with the words marked. <del> when the part removes
 * them, <b> when the part is those words (or keeps them).
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wordsOf(row) {
  if (row.kind === "words" || row.kind === "quoted")
    return String(row.text || "")
      .replace(/^[\u2018'"]|[\u2019'"]$/g, "")
      .trim();
  const m = String(row.text || "").match(
    /(?:\bwithout|\bwith) the words?:?\s*(.+)$/i
  );
  if (!m) return null;
  const quoted = m[1].match(/[\u2018'"]([^\u2018\u2019'"]+)[\u2019'"]/);
  return (quoted ? quoted[1] : m[1]).trim();
}

function markWords(paragraph, words, tag) {
  const plain = escapeHtml(paragraph.replace(/\*{2,}/g, "").trim());
  if (!words) return plain;
  const escaped = escapeHtml(words);
  const at = plain.toLowerCase().indexOf(escaped.toLowerCase());
  if (at < 0) return plain;
  return (
    plain.slice(0, at) +
    `<${tag}>` +
    plain.slice(at, at + escaped.length) +
    `</${tag}>` +
    plain.slice(at + escaped.length)
  );
}

async function contextPass(rows) {
  const byRef = new Map();
  for (const row of rows) {
    // "budget-2027" and titles are references this repo invented for votes no
    // document carries: no markdown can ever fill them
    if (!isDocumentRef(row.ref)) continue;
    if (!byRef.has(row.ref)) byRef.set(row.ref, []);
    byRef.get(row.ref).push(row);
  }
  let written = 0;
  let noParagraph = 0;
  for (const [reference, list] of byRef) {
    const file = path.join(OEIL_DIR, fileName(reference));
    if (!fs.existsSync(file)) continue;
    const { paragraphs, everywhere } = segments(fs.readFileSync(file, "utf8"));
    for (const row of list) {
      const m = String(row.section || "").match(/§\s*(\d+)/);
      if (!m) continue;
      const n = Number(m[1]);
      const bucket = paragraphs.get(n) || everywhere.get(n) || [];
      if (bucket.length !== 1) {
        noParagraph++;
        continue;
      }
      const tag = row.kind === "without-words" ? "del" : "b";
      const context = toRules(markWords(bucket[0].text, wordsOf(row), tag));
      if (argv.dry) {
        console.log(`   ${row.rollcall} § ${n} → "${context.slice(0, 90)}…"`);
        written++;
        continue;
      }
      await db("rollcall_texts")
        .where("rollcall", row.rollcall)
        .update({ context });
      written++;
    }
  }
  return { written, noParagraph };
}

async function main() {
  const rows = await db.raw(
    `SELECT r.id, r.ref, r.name
       FROM rollcalls r
      WHERE NOT EXISTS (SELECT 1 FROM rollcall_texts t WHERE t.rollcall = r.id)
        -- the key is either the whole name ("§ 28") or its tail
        -- ("Zdechovský – § 28"): the regexes below re-check it exactly
        AND (r.name GLOB '§ [0-9]*' OR r.name GLOB '* § [0-9]*'
             OR r.name GLOB 'Recital *' OR r.name GLOB '* Recital *'
             OR r.name GLOB 'Consid*nt *' OR r.name GLOB '* Consid*nt *'
             OR r.name GLOB 'Article [0-9]*' OR r.name GLOB '* Article [0-9]*'
             OR r.name GLOB 'Citation *' OR r.name GLOB '* Citation *')
      ${argv.ref ? "AND r.ref = ?" : ""}
      ORDER BY r.ref, r.id`,
    argv.ref ? [argv.ref] : []
  );

  const byRef = new Map();
  for (const row of rows) {
    if (!byRef.has(row.ref)) byRef.set(row.ref, []);
    byRef.get(row.ref).push(row);
  }

  const refs = [...byRef.keys()].slice(
    0,
    argv.limit ? Number(argv.limit) : undefined
  );
  console.log(`📑 ${refs.length} reports, ${rows.length} votes without text`);

  for (const reference of refs)
    await processReport(reference, byRef.get(reference));

  // the split parts already written by vot-xml: give them their paragraph
  const splitRows = await db.raw(
    `SELECT t.rollcall, t.section, t.kind, t.text, r.ref
       FROM rollcall_texts t JOIN rollcalls r ON r.id = t.rollcall
      WHERE t.source = 'vot-xml'
        AND t.section LIKE '§ %'
        AND t.kind IN ('words', 'without-words', 'with-words')
      ${argv.ref ? "AND r.ref = ?" : ""}
      ORDER BY r.ref, t.rollcall`,
    argv.ref ? [argv.ref] : []
  );
  const context = await contextPass(splitRows);
  console.log(
    `\n${context.written} split part(s) given their paragraph ` +
      `(${context.noParagraph} paragraph(s) not found)`
  );
  console.log(
    `\n${stats.paragraph} paragraphs (${stats.fromWholeDocument} found anywhere in the document), ${stats.recital} recitals, ${stats.citation} citations written` +
      `\n${stats.notFound} not found, ${stats.ambiguous} ambiguous, ` +
      `${stats.unsupported} not extractable (Article/Citation), ` +
      `${stats.noMarkdown} votes in reports without markdown`
  );
}

/**
 * Importable entry point: `run({ ref: "A10-0288/2026" })` merges the options over
 * the parsed argv and does what the CLI does. openapi/update.js calls this.
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
