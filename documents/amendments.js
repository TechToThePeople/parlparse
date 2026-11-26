#!/usr/bin/env node
/* eslint-env node */
/**
 * documents/amendments.js — fill `rollcall_texts` for amendments, from the amendment
 * documents the EP publishes on doceo.
 *
 * The OpenAPI does not publish amendments (`/documents/…-AM-4` is a 404, there is
 * no amendment work type) and the per-amendment URLs on doceo are 404 as well.
 * What exists is the report's page, which lists the amendments **grouped in
 * ranges**:
 *
 *   /doceo/document/A-10-2026-0271-AM-333-334_EN.docx
 *
 * Each of those contains the amendments as blocks:
 *
 *   <Amend>…<NumAm>333</NumAm>
 *   <Article>Article 5 – paragraph 1 a (new)</Article>
 *   | Text proposed by the Commission | Amendment |
 *   |                                 | ***Under no circumstances shall …*** |
 *   </Amend>
 *
 * doceo is behind the WAF, so this uses the browser helper and its binary
 * download; the markdown of each range is cached under data/content/amendments/.
 *
 * Usage:
 *   node documents/amendments.js --dry --ref A10-0271/2026   # what it would write
 *   node documents/amendments.js --ref A10-0271/2026         # one report
 *   node documents/amendments.js                             # every report with votes
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const minimist = require("minimist");
const db = require("../lib/db");
const { toRules } = require("../lib/markdown");
const { isDocumentRef } = require("../lib/refs");
const { clause } = require("../lib/dates");
const { apiFetch } = require("../openapi/lib");

const ROOT = path.resolve(__dirname, "..");
const AMEND_DIR = path.join(ROOT, "data", "content", "amendments");
const TMP_DIR = path.join(ROOT, "data", "tmp");
const DOCEO = "https://www.europarl.europa.eu/doceo/document";
// the open data host: the amendment lists live here, not behind the WAF
// the files themselves are served from redmapl3: data.europarl.europa.eu answers
// 302 to curl but 500 to node's fetch, so the media host is used directly
const MEDIA = "https://redmapl3.europarl.europa.eu/RedmapFront/media";
// the container depends on the document: reports live in reds_iPlRp_Amd, motions
// in reds_iPlRe_Amd. The identifier and the file name are the same in each.
const DIST_AMEND = [
  "reds_iPlRp_Amd",
  "reds_iPlRe_Amd",
  "reds_iPlRc_Amd",
  "reds_iCmDoc_Amd",
];

/** One file from the open data host; no browser, a browser-ish Accept. */
async function download(url) {
  try {
    const res = await fetch(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });
    return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
  } catch {
    return { status: 0, buffer: null };
  }
}

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "force", "help"],
  string: ["ref"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node documents/amendments.js [options]

  --ref <ref>  only that report (e.g. A10-0271/2026)
  --limit, -n  stop after N reports
  --dry        show what would be written
  --force      ignore the saved markdown and fetch the documents again
  --help, -h
`);
  process.exit(0);
}

/** A10-0271/2026 → A-10-2026-0271 */
function eliId(reference) {
  const m = String(reference).match(/^(RC-)?([AB])(\d+)-(\d+)\/(\d{4})$/);
  if (!m) return null;
  return m[1]
    ? `RC-${m[3]}-${m[5]}-${m[4]}`
    : `${m[2]}-${m[3]}-${m[5]}-${m[4]}`;
}

/**
 * The amendments a vote is about. Names look like "Article 5, § 1, point a – 135",
 * "… - Am 337S", "… - Am 338S= 352S=", "Article 26 – 255-261 263-264" (a block
 * vote) and "Am 9/2" (a split part). Numbers can carry a suffix letter, so the
 * key is "355D", with the plain number as a fallback.
 */
function amendmentKeys(vote) {
  // the VOT XML gives the authoritative list ("4= 7=", "274D", "9-14", "1/REV")
  const column = String(vote.amendment_number || "");
  if (column) {
    const keys = [];
    for (const token of column.split(/[\s,]+/).filter(Boolean)) {
      const range = token.match(/^(\d{1,3})-(\d{1,3})$/);
      if (range) {
        // "1-18" is amendments 1 to 18, all of them voted in one go
        const [from, to] = [Number(range[1]), Number(range[2])];
        if (to >= from && to - from < 60)
          for (let n = from; n <= to; n++) keys.push(String(n));
        continue;
      }
      const number = token.match(/^(\d{1,3})([A-Z]*)/);
      if (number) keys.push(number[1] + number[2]);
    }
    if (keys.length) return keys;
  }

  // otherwise the name, whose suffix is unreliable (S where the XML says D)
  const name = String(vote.name || "");
  // everything after the last separator is the amendment reference
  // "Am 20/1" is amendment 20, second part: the part is not an amendment number
  const tail = (name.split(/\s[–-]\s|\bAm\b/i).pop() || "").replace(
    /\/\d+\s*$/,
    ""
  );
  const named = [...tail.matchAll(/(\d{1,3})([A-Z]*)/g)].map(
    (m) => m[1] + m[2]
  );
  if (named.length) return named;
  const fromDocRef = String(vote.doc_ref || "").match(/-AM-(\d+)/);
  return fromDocRef ? [fromDocRef[1]] : [];
}

/** The PDF of a range document, from the name of the file we parsed. */
const rangePdf = (name) =>
  `${DOCEO}/${String(name).replace(/_EN\.(docx|pdf)$/i, "_EN.pdf")}`;

/** data/content/oeil/<ref>.md — the report as markitdown saved it */
const OEIL_DIR = path.join(ROOT, "data", "content", "oeil");
const reportMarkdown = (reference) =>
  path.join(OEIL_DIR, String(reference).replace(/\//g, "_") + ".md");

const stats = {
  reports: 0,
  ranges: 0,
  amendments: 0,
  written: 0,
  missing: 0,
  parked: 0,
  failed: 0,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a vote is retried this many times, then parked for a human
const MAX_ATTEMPTS = 3;

/** The AM-<from>-<to> documents linked from a report's doceo page. */
/** The range documents already saved for this report. */
function cachedDocuments(eli) {
  if (!fs.existsSync(AMEND_DIR)) return [];
  const prefix = `${eli}-AM-`;
  return fs
    .readdirSync(AMEND_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .sort()
    .map((f) => ({ name: f.slice(0, -3), cached: true }));
}

/** null when the WAF kept answering, an empty list when nothing is published. */
/**
 * The AMENDMENT_LIST documents of a year, cached for the run: the API publishes
 * every range (`A-10-2026-0271-AM-340-346`, AMENDMENT_LIST) with a DOCX in
 * `distribution/reds_iPlRp_Amd/`, so neither the doceo page nor the browser is
 * needed to find them.
 */
const yearLists = new Map();

async function amendmentList(year) {
  if (yearLists.has(year)) return yearLists.get(year);
  // the enumeration is the expensive part (a year has ~1,000 documents and the
  // later pages are slow), so it is kept on disk between runs
  const cache = path.join(AMEND_DIR, `list-${year}.json`);
  if (!argv.force && fs.existsSync(cache)) {
    try {
      const ids = JSON.parse(fs.readFileSync(cache, "utf8"));
      yearLists.set(year, ids);
      return ids;
    } catch {
      // a half-written cache is no cache
    }
  }
  const ids = [];
  try {
    for (let offset = 0; ; offset += 500) {
      const json = await apiFetch("/documents", {
        "work-type": "AMENDMENT_LIST",
        year,
        limit: 500,
        offset,
      });
      const batch = (json && json.data) || [];
      for (const doc of batch) if (doc.identifier) ids.push(doc.identifier);
      if (batch.length < 500) break;
    }
  } catch (e) {
    // a cached list is better than none: the caller falls back to what it has
    if (fs.existsSync(cache)) {
      console.warn(
        `   ⚠️  ${year}: list unavailable (${e.message}), using the cache`
      );
      let cached = [];
      try {
        cached = JSON.parse(fs.readFileSync(cache, "utf8"));
      } catch {
        cached = [];
      }
      if (!cached.length) throw e;
      yearLists.set(year, cached);
      return cached;
    }
    throw e;
  }
  console.log(`   📚 ${year}: ${ids.length} amendment list(s)`);
  fs.mkdirSync(AMEND_DIR, { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(ids));
  yearLists.set(year, ids);
  return ids;
}

/** The range documents of one report, from the API's list. */
async function amendmentDocuments(eli) {
  const year = String(eli).match(/-(\d{4})-/);
  if (!year) return [];
  const ids = await amendmentList(year[1]);
  const prefix = `${eli}-AM-`;
  return ids
    .filter((id) => id.startsWith(prefix))
    .sort()
    .map((id) => ({
      name: `${id}_en.docx`,
      urls: DIST_AMEND.map((dir) => `${MEDIA}/${dir}/${id}/${id}_en.docx`),
    }));
}

function amendmentText(block) {
  const lines = block.split("\n");
  // start after the header row's "| --- | --- |" separator: without it the
  // column label ("Amendment") is glued to the first amendment's text
  const separator = lines.findIndex((l) => /^\|?[\s|:-]*-{3,}/.test(l));
  const header = lines.findIndex(
    (l) => /Text proposed by the Commission/i.test(l) && l.includes("|")
  );
  const start = separator >= 0 ? separator + 1 : header + 1;
  const cells = [];
  for (const line of lines.slice(start)) {
    if (line.includes("</Amend>")) break;
    if (!line.trim().startsWith("|")) continue;
    // the amendment is the last column; the first is empty for new text, so
    // dropping empty cells would shift every amendment into it
    const parts = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim())
      .filter((c) => c && !/^-+$/.test(c));
    if (!parts.length) continue;
    // a column-label row ("Joint motion for a resolution | Amendment") is not
    // text: the layout table repeats one just before the real one
    if (
      parts.every((c) =>
        /^(amendment|text proposed by the (commission|council)|(joint )?motion for a resolution|proposal for (a )?(regulation|directive|decision)|council position)$/i.test(
          c.replace(/\*+/g, "").trim()
        )
      )
    )
      continue;
    const text = parts
      .at(-1)
      .replace(/\*{2,}/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text && !/^_+$/.test(text)) cells.push(text);
  }
  return cells.join(" ").replace(/\s+/g, " ").trim();
}

/** What the amendment targets: <Article> when wrapped, else the line above the table. */
function amendmentTarget(block) {
  const article = block.match(/<Article>([^<]*)<\/Article>/);
  if (article) return article[1].trim();
  const lines = block.split("\n").map((l) => l.trim());
  const table = lines.findIndex((l) => l.startsWith("|"));
  const before = (table >= 0 ? lines.slice(0, table) : lines).filter(
    (l) =>
      l &&
      !l.startsWith("<") &&
      !/^_+$/.test(l) &&
      !/^Amendment\s+\d+$/i.test(l) &&
      !/^(Proposal for a regulation|Report|MOTION|Proposition)/i.test(l)
  );
  return before.length ? before[before.length - 1] : null;
}

/**
 * A provisional-agreement amendment is the whole amended text, not a table:
 * "AMENDMENTS BY THE EUROPEAN PARLIAMENT … to the Commission proposal" followed
 * by the consolidated regulation. Keep the opening of it rather than nothing.
 */
function wholeTextAmendment(block) {
  const start = block.search(/AMENDMENTS BY THE EUROPEAN PARLIAMENT/i);
  if (start < 0) return "";
  const text = block
    .slice(start)
    .split("\n")
    .filter(
      (l) => l.trim() && !/^\s*<[^>]+>\s*$/.test(l) && !/^-{5,}\s*$/.test(l)
    )
    .join(" ")
    .replace(/\[\[?\d+\]\]?\(#[^)]*\)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // a whole regulation is long: the opening is what a reader can use
  return text.length > 200 ? text.slice(0, 2500) : "";
}

/**
 * One range document → Map(number -> {article, text}). Two layouts exist:
 * the per-amendment documents wrap each block in <Amend>…<NumAm>N</NumAm>, the
 * big "AMENDMENTS 001-332" ones just head each block with "Amendment 1".
 */
function parseAmendmentDocument(markdown) {
  const amendments = new Map();

  for (const block of markdown.split(/<Amend>/).slice(1)) {
    const num = block.match(/<NumAm>(\d+)<\/NumAm>/);
    if (!num) continue;
    const text = amendmentText(block) || wholeTextAmendment(block);
    if (!text) continue;
    amendments.set(Number(num[1]), {
      article: amendmentTarget(block),
      text,
    });
  }

  const parts = markdown.split(/^Amendment\s+(\d+)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    if (amendments.has(n)) continue;
    const block = parts[i + 1] || "";
    const text = amendmentText(block) || wholeTextAmendment(block);
    if (!text) continue;
    amendments.set(n, { article: amendmentTarget(block), text });
  }
  return amendments;
}

/** Download (or reuse) the markdown of one range document. */
async function rangeMarkdown(doc) {
  fs.mkdirSync(AMEND_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  // the name keeps the extension: a pdf and a docx of one range used to share
  // a cache file, so a stale pdf parse hid the docx
  const cache = path.join(AMEND_DIR, `${doc.name}.md`);
  if (fs.existsSync(cache) && !argv.force)
    return fs.readFileSync(cache, "utf8");
  if (doc.cached) throw new Error(`no cached markdown for ${doc.name}`);

  const binary = path.join(
    TMP_DIR,
    String(doc.url).split("/").pop() || "am.doc"
  );
  let res = { status: 0, buffer: null };
  for (const url of doc.urls || [doc.url]) {
    res = await download(url);
    if (res.buffer && res.status === 200) break;
  }
  if ((!res.buffer || res.status !== 200) && doc.name) {
    // the container can change (reds_iPlRp_Amd, reds_iCmDoc_Amd): ask the
    // document itself where its DOCX is
    const id = String(doc.name).replace(/_en\.docx$/, "");
    const json = await apiFetch(`/documents/${id}`).catch(() => null);
    const record = json && (json.data || [json])[0];
    for (const expression of (record && record.is_realized_by) || []) {
      if (!String(expression.id || "").endsWith("/en")) continue;
      for (const m of expression.is_embodied_by || []) {
        if (!/docx$/i.test(m.is_exemplified_by || "")) continue;
        res = await download(
          `${MEDIA}/${String(m.is_exemplified_by).replace(
            /^distribution\//,
            ""
          )}`
        );
        if (res.buffer && res.status === 200) break;
      }
    }
  }
  if (res.status !== 200 || !res.buffer)
    throw new Error(`HTTP ${res.status} for ${doc.name}`);
  fs.writeFileSync(binary, res.buffer);

  const md = spawnSync("markitdown", [binary], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (md.status !== 0 || !md.stdout || !md.stdout.trim())
    throw new Error(`markitdown failed for ${doc.name}`);
  fs.writeFileSync(cache, md.stdout);
  stats.ranges++;
  return md.stdout;
}

async function processReport(reference, votes) {
  const eli = eliId(reference);
  if (!eli) return;
  const index = new Map();

  // 1. the amendments tabled in plenary are published as range documents, and
  //    they carry the numbering the vote names use ("Après le § 64 - Am 25")
  const docs = argv.force ? [] : cachedDocuments(eli);
  const list = docs.length ? docs : await amendmentDocuments(eli);
  if (list.length)
    console.log(`   📑 ${reference}: ${list.length} amendment document(s)`);
  for (const doc of list) {
    try {
      const amendments = parseAmendmentDocument(await rangeMarkdown(doc));
      const url = rangePdf(doc.name);
      for (const [n, a] of amendments)
        if (!index.has(n)) index.set(n, { ...a, url });
      await sleep(300);
    } catch (e) {
      console.warn(`   ⚠️  ${doc.name}: ${e.message}`);
      stats.failed++;
    }
  }

  // 2. the report's own document: the committee amendments, numbered 1..N in their
  //    own sequence — only the numbers the tabled amendments do not cover
  const local = reportMarkdown(reference);
  if (fs.existsSync(local)) {
    const fromReport = parseAmendmentDocument(fs.readFileSync(local, "utf8"));
    const stored = await db("reports")
      .where("reference", reference)
      .first("url");
    const url = stored && stored.url ? stored.url : `${DOCEO}/${eli}_EN.html`;
    let added = 0;
    for (const [n, a] of fromReport)
      if (!index.has(n)) {
        index.set(n, { ...a, url });
        added++;
      }
    if (added)
      console.log(`   📄 ${reference}: ${added} only in the report itself`);
  }

  if (!index.size) {
    console.log(`   ⚠️  ${reference}: no amendment document published`);
    if (!argv.dry)
      await db("rollcalls")
        .whereIn(
          "id",
          votes.map((v) => v.id)
        )
        .update({ amendment_status: "unavailable" });
    stats.parked += votes.length;
    return;
  }
  stats.amendments += index.size;

  for (const vote of votes) {
    const keys = amendmentKeys(vote);
    // all of them, or nothing: a block vote carries several amendments
    // the index is keyed by number; the names may add a suffix ("355D")
    const found = keys.map(
      (k) => index.get(Number(k)) || index.get(Number(k.replace(/[A-Z]+$/, "")))
    );
    if (!keys.length || found.some((f) => !f || !f.text)) {
      stats.missing++;
      if (!argv.dry)
        await db("rollcalls")
          .where("id", vote.id)
          .increment("amendment_attempts", 1);
      if (stats.missing <= 10)
        console.log(
          `   · ${vote.id} "${(vote.name || "").slice(0, 60)}" keys ${
            keys.join("+") || "(none)"
          } not in the ${index.size} amendments found`
        );
      continue;
    }
    // a block vote can carry dozens of amendments: keep the page readable, the
    // text stays verbatim up to the cut
    let text = toRules(found.map((f) => f.text).join(" / "));
    if (text.length > 4000)
      text = text.slice(0, text.lastIndexOf(" ", 4000)) + " …";
    const section =
      found
        .map((f) => f.article)
        .filter(Boolean)
        .join(" | ") || null;
    if (argv.dry) {
      console.log(
        `   ${vote.id} Am ${keys.join("+")} (${section || "?"}) → "${text.slice(
          0,
          70
        )}…"`
      );
      stats.written++;
      continue;
    }
    await db("rollcall_texts")
      .insert({
        rollcall: vote.id,
        section,
        part: null,
        text,
        kind: "amendment",
        source: "doceo",
        source_url: found[0].url || null,
        chars: text.length,
        updated_at: new Date().toISOString(),
      })
      .onConflict("rollcall")
      .merge();
    stats.written++;
  }
}

async function main() {
  const dayFilter = clause("r.date", argv.dates);
  const rows = await db.raw(
    `SELECT r.id, r.ref, r.name, r.doc_ref, r.amendment_number
       FROM rollcalls r
      WHERE NOT EXISTS (SELECT 1 FROM rollcall_texts t WHERE t.rollcall = r.id)
        AND r.amendment_status IS NULL
        AND r.amendment_attempts < ${MAX_ATTEMPTS}
        AND (r.amendment_number IS NOT NULL OR r.name LIKE '%Am %'
             OR r.name GLOB '* [–-] [0-9]*' OR r.name GLOB '§ * – *'
             OR r.doc_ref LIKE '%-AM-%')
      ${argv.ref ? "AND r.ref = ?" : ""}
      ${dayFilter.sql}
      -- newest vote first: the refs are taken in the order they appear, so the
      -- most recent report is fetched first
      ORDER BY r.date DESC, r.id DESC`,
    [...(argv.ref ? [argv.ref] : []), ...dayFilter.bindings]
  );

  const byRef = new Map();
  for (const row of rows) {
    // the budget drafts have no published amendment documents: their reference is
    // one this repo invented, and no amount of fetching will fill it
    if (!isDocumentRef(row.ref || row.doc_ref)) continue;
    if (!byRef.has(row.ref)) byRef.set(row.ref, []);
    byRef.get(row.ref).push(row);
  }
  const refs = [...byRef.keys()].slice(
    0,
    argv.limit ? Number(argv.limit) : undefined
  );
  console.log(
    `📑 ${refs.length} report(s), ${rows.length} amendment vote(s) without text`
  );

  for (const reference of refs) {
    try {
      await processReport(reference, byRef.get(reference));
      // the API allows 500 requests per 5 minutes; a report is a handful
      await sleep(300);
    } catch (e) {
      stats.failed++;
      console.warn(`   ⚠️  ${reference}: ${e.message}`);
    }
  }

  console.log(
    `\n${stats.written} text(s) ${argv.dry ? "would be " : ""}written from ` +
      `${stats.amendments} amendments in ${stats.ranges} document(s), ` +
      `${stats.reports} report(s)\n${stats.missing} vote(s) whose amendment ` +
      `is not in those documents, ${stats.failed} failure(s), ` +
      `${stats.parked} parked as unpublished`
  );
  const [left] = await db.raw(
    `SELECT count(*) AS n FROM rollcalls
      WHERE amendment_status IS NULL AND amendment_attempts >= ${MAX_ATTEMPTS}
        AND NOT EXISTS (SELECT 1 FROM rollcall_texts t WHERE t.rollcall = rollcalls.id)`
  );
  if (left.n)
    console.log(
      `${left.n} vote(s) gave up after ${MAX_ATTEMPTS} attempts — to park them ` +
        `by hand:\n  SELECT id, ref, name, amendment_number FROM rollcalls\n` +
        `   WHERE amendment_status IS NULL AND amendment_attempts >= ${MAX_ATTEMPTS};\n` +
        `  UPDATE rollcalls SET amendment_status = 'manual' WHERE id = <id>;`
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
