#!/usr/bin/env node
/* eslint-env node */
/**
 * ai/amendments.js — fill `rollcall_texts` for amendments, from the amendment
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
 *   node ai/amendments.js --dry --ref A10-0271/2026   # what it would write
 *   node ai/amendments.js --ref A10-0271/2026         # one report
 *   node ai/amendments.js                             # every report with votes
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const minimist = require("minimist");
const db = require("../lib/db");
const { getWaf } = require("../openapi/lib");

const ROOT = path.resolve(__dirname, "..");
const AMEND_DIR = path.join(ROOT, "data", "content", "amendments");
const TMP_DIR = path.join(ROOT, "data", "tmp");
const DOCEO = "https://www.europarl.europa.eu/doceo/document";

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "force", "help"],
  string: ["ref"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node ai/amendments.js [options]

  --ref <ref>  only that report (e.g. A10-0271/2026)
  --limit, -n  stop after N reports
  --dry        show what would be written
  --force      re-download the amendment documents
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
        const [from, to] = [Number(range[1]), Number(range[2])];
        // a short range is readable as its members, a long one is left out
        if (to >= from && to - from <= 10)
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

const stats = {
  reports: 0,
  ranges: 0,
  amendments: 0,
  written: 0,
  missing: 0,
  failed: 0,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The AM-<from>-<to> documents linked from a report's doceo page. */
async function amendmentDocuments(eli) {
  const waf = getWaf();
  const page = await waf.downloadViaBrowser(`${DOCEO}/${eli}_EN.html`);
  if (page.status !== 200) return [];
  const links = [
    ...new Set(
      [
        ...String(page.body).matchAll(
          /href="([^"]*\/doceo\/document\/[^"]*AM-[^"]*)"/g
        ),
      ].map((m) => m[1].replace(/^\//, ""))
    ),
  ];
  const base = "https://www.europarl.europa.eu/";
  return links
    .filter((l) => l.endsWith(".docx") || l.endsWith(".pdf"))
    .map((l) => ({
      url: base + l,
      // docx first: markitdown keeps the table cells intact in both
      docx: l.endsWith(".docx"),
      name: path.basename(l).replace(/_EN\.(docx|pdf)$/, ""),
    }))
    .sort((a, b) => (a.docx === b.docx ? 0 : a.docx ? -1 : 1));
}

/** The amendment column of a two-column table ("Text proposed… | Amendment"). */
function amendmentText(block) {
  const lines = block.split("\n");
  const header = lines.findIndex(
    (l) => /Text proposed by the Commission/i.test(l) && l.includes("|")
  );
  const cells = [];
  for (const line of header >= 0 ? lines.slice(header + 1) : lines) {
    if (line.includes("</Amend>")) break;
    if (!line.trim().startsWith("|")) continue;
    const parts = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c && !/^-+$/.test(c));
    if (!parts.length) continue;
    const text = parts
      .slice(1)
      .join(" ")
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
 * One range document → Map(number -> {article, text}). Two layouts exist:
 * the per-amendment documents wrap each block in <Amend>…<NumAm>N</NumAm>, the
 * big "AMENDMENTS 001-332" ones just head each block with "Amendment 1".
 */
function parseAmendmentDocument(markdown) {
  const amendments = new Map();

  for (const block of markdown.split(/<Amend>/).slice(1)) {
    const num = block.match(/<NumAm>(\d+)<\/NumAm>/);
    if (!num) continue;
    const text = amendmentText(block);
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
    const text = amendmentText(block);
    if (!text) continue;
    amendments.set(n, { article: amendmentTarget(block), text });
  }
  return amendments;
}

/** Download (or reuse) the markdown of one range document. */
async function rangeMarkdown(doc) {
  fs.mkdirSync(AMEND_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const cache = path.join(AMEND_DIR, `${doc.name}.md`);
  if (fs.existsSync(cache) && !argv.force)
    return fs.readFileSync(cache, "utf8");

  const binary = path.join(
    TMP_DIR,
    String(doc.url).split("/").pop() || "am.doc"
  );
  const waf = getWaf();
  const res = await waf.downloadBuffer(doc.url);
  if (res.status !== 200 || !res.buffer) {
    // a pdf may exist where the docx does not, but both were requested
    throw new Error(`HTTP ${res.status} for ${doc.url}`);
  }
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
  const docs = await amendmentDocuments(eli);
  if (!docs.length) {
    console.log(`   ⚠️  ${reference}: no amendment document listed on doceo`);
    stats.failed++;
    return;
  }
  stats.reports++;
  console.log(`   📑 ${reference}: ${docs.length} amendment document(s)`);

  // one index for the whole report: number -> amendment
  const index = new Map();
  for (const doc of docs) {
    try {
      const amendments = parseAmendmentDocument(await rangeMarkdown(doc));
      for (const [n, a] of amendments) if (!index.has(n)) index.set(n, a);
      await sleep(300);
    } catch (e) {
      console.warn(`   ⚠️  ${doc.name}: ${e.message}`);
      stats.failed++;
    }
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
      if (stats.missing <= 10)
        console.log(
          `   · ${vote.id} "${(vote.name || "").slice(0, 60)}" keys ${
            keys.join("+") || "(none)"
          } not in the ${index.size} amendments found`
        );
      continue;
    }
    const text = found.map((f) => f.text).join(" / ");
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
        chars: text.length,
        updated_at: new Date().toISOString(),
      })
      .onConflict("rollcall")
      .merge();
    stats.written++;
  }
}

async function main() {
  const rows = await db.raw(
    `SELECT r.id, r.ref, r.name, r.doc_ref, r.amendment_number
       FROM rollcalls r
      WHERE NOT EXISTS (SELECT 1 FROM rollcall_texts t WHERE t.rollcall = r.id)
        AND (r.amendment_number IS NOT NULL OR r.name LIKE '%Am %'
             OR r.name GLOB '* [–-] [0-9]*' OR r.name GLOB '§ * – *'
             OR r.doc_ref LIKE '%-AM-%')
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
  console.log(
    `📑 ${refs.length} report(s), ${rows.length} amendment vote(s) without text`
  );

  for (const reference of refs) {
    try {
      await processReport(reference, byRef.get(reference));
    } catch (e) {
      stats.failed++;
      console.warn(`   ⚠️  ${reference}: ${e.message}`);
    }
  }

  const waf = getWaf();
  await waf.closeBrowser();

  console.log(
    `\n${stats.written} text(s) ${argv.dry ? "would be " : ""}written from ` +
      `${stats.amendments} amendments in ${stats.ranges} document(s), ` +
      `${stats.reports} report(s)\n${stats.missing} vote(s) whose amendment ` +
      `is not in those documents, ${stats.failed} failure(s)`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
