#!/usr/bin/env node
/* eslint-env node */
/**
 * ai/oeil.js — fetch the European Parliament reports with the Open Data API,
 * turn them into markdown, and ask DeepSeek for a citizen-friendly summary.
 *
 * Sources, per report reference (`reports.reference`, e.g. A10-0275/2026):
 *   - /documents/<eli> gives the distributions; the DOCX is preferred (smaller
 *     and better structured than the PDF, and it is what markitdown converts
 *     best), the PDF is the fallback;
 *   - doceo is NOT used: it answers 403 to anything that is not a browser.
 *
 * Outputs:
 *   data/content/oeil/<reference>.md      the document as markdown (markitdown)
 *   data/content/summary/<reference>.md   the summary (prose only)
 *
 * Usage:
 *   node ai/oeil.js A10-0275/2026      # one report
 *   node ai/oeil.js --all              # A / B / RC reports, skipping the rest
 *   node ai/oeil.js --all --limit 5    # trial run
 *   node ai/oeil.js --all --dry        # fetch + convert, no DeepSeek call
 *
 * Options:
 *   --all        every report with a document: A, B and RC references
 *   --limit N    stop after N documents
 *   --force      redo documents/summaries that already exist
 *   --dry        no DeepSeek call (fetches and converts only)
 *   --model      DeepSeek model, default deepseek-chat (their cheapest)
 *   --help, -h
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const minimist = require("minimist");
const db = require("../lib/db");
const { fetchDocumentById } = require("../openapi/lib");

const ROOT = path.resolve(__dirname, "..");
const OEIL_DIR = path.join(ROOT, "data", "content", "oeil");
const SUMMARY_DIR = path.join(ROOT, "data", "content", "summary");
const TMP_DIR = path.join(ROOT, "data", "tmp");

const API = "https://api.deepseek.com/chat/completions";
// deepseek-flash (DeepSeek-V4.1-Flash), the cheap one. The legacy names
// deepseek-v4-flash and deepseek-chat are no longer advertised.
const MODEL = "deepseek-flash";
// USD per 1M tokens, deepseek-flash, off-peak, cache miss. Off-peak is half the
// peak rate (peak: 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri) and a cache hit is
// ~50x cheaper, so this is an upper bound for the log, not an invoice.
const PRICE_IN = 0.15;
const PRICE_OUT = 0.6;

// the model takes 1M tokens (~2.5M characters), so only very long reports are
// chunked at all
const CHUNK = 600000;

const argv = minimist(process.argv.slice(2), {
  boolean: [
    "all",
    "force",
    "dry",
    "attach",
    "report",
    "motions",
    "missing",
    "help",
  ],
  string: ["model"],
  alias: { h: "help", a: "all", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node ai/oeil.js [<reference> | --all] [options]

  <reference>  one or more reports.reference values, e.g. A10-0275/2026
  --all, -a    every A / B / RC report
  --missing    only the reports that have no summary on disk yet
               (with --all or on its own; the cheap way to run after a sitting)
  --limit, -n  stop after N documents
  --force      redo documents and summaries that already exist
  --dry        fetch and convert only, no DeepSeek call
  --report     only the A/B/RC reports (the default with --motions)
  --motions    only the individual motions (B10-… tabled by a group)
  --attach     re-attach the summaries already on disk to their votes
  --help, -h   this text

Needs DEEPSEEK_API_KEY, read from the environment or from .env in the repo root.
`);
  process.exit(0);
}

/** KEY=VALUE lines from .env, without adding a dotenv dependency. */
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv();

/**
 * A10-0275/2026 → A-10-2026-0275.
 * RC-B10-0191/2024 → RC-10-2024-0191: a joint motion is its own document, and
 * dropping the RC- prefix would fetch the single motion of one group instead.
 */
function eliId(reference) {
  const m = String(reference)
    .replace(/\/REV\d+$/, "")
    .match(/^(RC-)?([AB])(\d+)-(\d+)\/(\d{4})$/);
  if (!m) return null;
  // RC-B10-… is published as RC-10-…: no B, the term takes its place
  if (m[1]) return `RC-${m[3]}-${m[5]}-${m[4]}`;
  return `${m[2]}-${m[3]}-${m[5]}-${m[4]}`;
}

/** A10-0275/2026 → A10-0275_2026.md (the reference is the key everywhere). */
function fileName(reference) {
  return String(reference).replace(/\//g, "_") + ".md";
}

const stats = {
  documents: 0,
  summaries: 0,
  skipped: 0,
  failed: 0,
  tokensIn: 0,
  tokensOut: 0,
  attached: 0,
};

/** Documents to process: one reference, or every A/B/RC report. */
async function references() {
  const input = argv._[0];
  if (input) return [input];
  if (!argv.all && !argv.missing) {
    console.error("Error: give a reference or --all");
    process.exit(1);
  }
  const rows = await db("reports")
    .whereNotNull("reference")
    .select("reference")
    .orderBy("reference");
  const refs = rows
    .map((r) => r.reference)
    .filter((r) => /^(?:RC-)?[AB]\d+-\d{4}\/\d{4}$/.test(r));
  if (!argv.missing) return refs;
  // only what has no summary yet: no API call, no token, for the rest
  return refs.filter(
    (r) => !fs.existsSync(path.join(SUMMARY_DIR, fileName(r)))
  );
}

/** Download the DOCX (preferred) or PDF of a report. Returns {file, url, doc}. */
/** The document record `openapi/report.js` already stored, when it has one. */
async function storedDocument(reference) {
  try {
    const row = await db("reports").where("reference", reference).first("raw");
    const doc = JSON.parse((row && row.raw) || "null");
    return doc && doc.is_realized_by ? doc : null;
  } catch {
    return null;
  }
}

async function fetchDocument(reference) {
  const eli = eliId(reference);
  if (!eli) return null;
  // reports.raw holds the same JSON-LD record: no second metadata call
  let doc = await storedDocument(reference);
  if (!doc) {
    try {
      const json = await fetchDocumentById(eli);
      doc = (json.data || [json])[0] || null;
    } catch (e) {
      // only a 404 means the API does not publish it; anything else is a failure
      // to read, which must not be reported as "no document"
      if (e.status === 404) return null;
      throw e;
    }
  }
  if (!doc) return null;

  // English first; a few reports are published only in another language, and
  // the model reads those (it is told to answer in English either way)
  const candidates = [];
  for (const expression of doc.is_realized_by || []) {
    const language = String(expression.language || "")
      .split("/")
      .pop();
    for (const m of expression.is_embodied_by || []) {
      const format = String(m.format || "")
        .split("/")
        .pop();
      if (["DOCX", "PDF"].includes(format) && m.is_exemplified_by)
        candidates.push({ format, language, url: m.is_exemplified_by });
    }
  }
  // DOCX first: smaller, best structure; then the English version
  candidates.sort((a) => (a.format === "DOCX" ? -1 : 1));
  candidates.sort((a) => (a.language === "ENG" ? -1 : 1));
  // the document exists but publishes neither a DOCX nor a PDF
  if (!candidates.length) throw new Error("no DOCX or PDF distribution");

  const pick = candidates[0];
  const ext = pick.format.toLowerCase();
  const dest = path.join(TMP_DIR, `${fileName(reference)}.${ext}`);
  fs.mkdirSync(TMP_DIR, { recursive: true });

  if (!fs.existsSync(dest)) {
    const res = await fetch(
      `https://data.europarl.europa.eu/${pick.url.replace(/^\//, "")}`,
      {
        // the EP answers 500 to `accept: */*` on these distribution paths
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${pick.url}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  if (pick.language !== "ENG")
    console.log(
      `   🌐 ${reference}: no English version, using ${pick.language}`
    );
  return { file: dest, url: pick.url, format: pick.format, doc };
}

/** markitdown → markdown; pdftotext as a last resort for PDFs. */
function toMarkdown(file) {
  const md = spawnSync("markitdown", [file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (md.status === 0 && md.stdout && md.stdout.trim()) return md.stdout;
  if (md.stderr)
    console.warn("   ⚠️  markitdown:", md.stderr.trim().split("\n")[0]);

  if (file.endsWith(".pdf")) {
    const txt = spawnSync("pdftotext", ["-layout", file, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (txt.status === 0 && txt.stdout) return txt.stdout;
  }
  throw new Error("no converter worked for " + path.basename(file));
}

/** The document as markdown, saved once and reused afterwards. */
async function documentMarkdown(reference) {
  const dest = path.join(OEIL_DIR, fileName(reference));
  fs.mkdirSync(OEIL_DIR, { recursive: true });

  if (fs.existsSync(dest) && !argv.force) {
    return fs.readFileSync(dest, "utf8");
  }

  const found = await fetchDocument(reference);
  if (!found) return null;
  const body = toMarkdown(found.file);
  fs.writeFileSync(dest, body);
  stats.documents++;
  console.log(
    `   📄 ${reference} ${found.format} ${body.length} chars → ${path.relative(
      ROOT,
      dest
    )}` +
      `\n      title: ${
        (found.doc.title_dcterms && found.doc.title_dcterms.en) || "?"
      }` +
      `\n      source: ${found.url}`
  );
  return body;
}

const SYSTEM = `You explain decisions of the European Parliament to citizens who have no legal or EU background. Write plain English, short sentences, no jargon, no acronyms without expanding them, no preamble, no "this report" framing.

The text may be in a language other than English; answer in English regardless.

Ignore the procedural parts: the committee's own votes (the results of the vote in committee, the roll-call or show-of-hands results there), the list of members who voted, the composition of the committee, and the administrative references. They say how the text was adopted, not what it changes.`;

function summaryPrompt(text) {
  return `Here is a report of the European Parliament.

${text}

Write, in this order:
1. one paragraph of 60 to 90 words explaining what this report changes, or what it asks for, in words a citizen can follow;
2. three bullet points of at most 20 words each: what concretely changes, who it affects, what happens next.
Do not invent facts that are not in the text. If the report only gives an opinion, say so plainly.`;
}

function chunkPrompt(text, index, total) {
  return `Part ${index + 1} of ${total} of a European Parliament report.

${text}

In at most 60 words, list only the concrete changes or positions stated in this part. No introduction.`;
}

function mergePrompt(parts) {
  return `You have summaries of the successive parts of the same European Parliament report.

${parts.map((p, i) => `Part ${i + 1}: ${p}`).join("\n\n")}

Write, in this order:
1. one paragraph of 60 to 90 words explaining what this report changes, or asks for, in words a citizen can follow;
2. three bullet points of at most 20 words each.
Do not invent facts.`;
}

/** One DeepSeek call; returns the answer and accumulates the token counters. */
async function complete(prompt, { model, maxTokens = 900 } = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key)
    throw new Error("DEEPSEEK_API_KEY is not set (environment or .env)");

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
        // thinking mode is the default and its reasoning is billed as output;
        // summarising does not need it
        thinking: { type: "disabled" },
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const usage = json.usage || {};
      stats.tokensIn += usage.prompt_tokens || 0;
      stats.tokensOut += usage.completion_tokens || 0;
      return (
        (json.choices && json.choices[0] && json.choices[0].message.content) ||
        ""
      );
    }

    const body = await res.text();
    if (res.status === 401 || res.status === 402)
      throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 200)}`);
    if (res.status === 429 || res.status >= 500) {
      const delay = Math.min(2000 * 2 ** attempt, 30000);
      console.warn(`   ⏳ DeepSeek ${res.status}, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 200)}`);
  }
  throw new Error("DeepSeek kept failing");
}

/** Chunk on paragraph boundaries, so a chunk never cuts mid-sentence. */
function chunks(text, size) {
  const out = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    if (current.length + paragraph.length + 2 > size && current) {
      out.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + paragraph;
  }
  if (current) out.push(current);
  return out;
}

async function summarise(
  reference,
  markdown,
  model,
  attach = storeWholeTextVotes
) {
  const dest = path.join(SUMMARY_DIR, fileName(reference));
  fs.mkdirSync(SUMMARY_DIR, { recursive: true });
  if (fs.existsSync(dest) && !argv.force) {
    stats.skipped++;
    // a summary written before this pass existed still has to reach its votes
    const existing = fs.readFileSync(dest, "utf8").trim();
    if (existing) await attach(reference, existing);
    return;
  }

  const body = markdown.trim();
  const parts = chunks(body, CHUNK);
  const tokens = { in: stats.tokensIn, out: stats.tokensOut };

  let answer;
  if (parts.length === 1) {
    answer = await complete(summaryPrompt(body), { model });
  } else {
    console.log(`   ✂️  ${reference}: ${parts.length} chunks`);
    const partial = [];
    for (let i = 0; i < parts.length; i++) {
      partial.push(
        await complete(chunkPrompt(parts[i], i, parts.length), {
          model,
          maxTokens: 200,
        })
      );
    }
    answer = await complete(mergePrompt(partial), { model });
  }

  fs.writeFileSync(dest, answer.trim() + "\n");
  stats.summaries++;
  await attach(reference, answer.trim());
  console.log(
    `   ✍️  ${reference} → ${path.relative(ROOT, dest)} (${model}, ${
      body.length
    } chars in, ${stats.tokensIn - tokens.in} tokens in / ${
      stats.tokensOut - tokens.out
    } out)`
  );
}

/**
 * A vote "on the whole text" (`Proposal for a decision`, `Motion for a
 * resolution (as a whole)`, `Proposition de la Commission`) is about the report
 * itself, so its text in rollcall_texts is the summary.
 */
const WHOLE_TEXT = /ensemble du texte|as a whole|motion for a resolution|proposition de r[ée]solution|proposals? for (?:a )?decisions?|proposition de la commission|commission proposal|projet de d[ée]cision|draft council decision|projet du conseil|draft legislative act|approval without vote/i;

async function storeWholeTextVotes(reference, summary) {
  const all = await db("rollcalls")
    .where("ref", reference)
    .select("id", "name", "vote_type");
  const rows = all.filter(
    (v) => v.vote_type === "main" || WHOLE_TEXT.test(v.name || "")
  );
  for (const row of rows) {
    await db("rollcall_texts")
      .insert({
        rollcall: row.id,
        section: null,
        part: null,
        text: summary,
        kind: "summary",
        source: "summary",
        chars: summary.length,
        updated_at: new Date().toISOString(),
      })
      .onConflict("rollcall")
      .merge();
  }
  stats.attached += rows.length;
  if (rows.length && !argv.attach)
    console.log(
      `   🗳  ${reference}: summary attached to ${rows.length} whole-text vote(s)`
    );
}

/** Attach every summary already on disk to its whole-text votes. */
async function attachExisting() {
  if (!fs.existsSync(SUMMARY_DIR)) {
    console.error("no summaries in " + path.relative(ROOT, SUMMARY_DIR));
    return;
  }
  const files = fs.readdirSync(SUMMARY_DIR).filter((f) => f.endsWith(".md"));
  console.log(`🔗 ${files.length} summaries to attach`);
  for (const file of files) {
    const reference = file.replace(/\.md$/, "").replace(/_(\d{4})$/, "/$1");
    const summary = fs
      .readFileSync(path.join(SUMMARY_DIR, file), "utf8")
      .trim();
    if (!summary) continue;
    // the same text can be a report reference and a motion's doc_ref
    await storeWholeTextVotes(reference, summary);
    await storeMotionVotes(reference, summary);
  }
  console.log(
    `${stats.attached} vote(s) attached across ${files.length} summaries`
  );
}

/**
 * A motion is its own document (`doc_ref` = B10-0028/2024), so its votes are
 * found by that column, not by `ref` (which is the joint motion or the report).
 */
async function storeMotionVotes(reference, summary) {
  const rows = await db("rollcalls").where("doc_ref", reference).pluck("id");
  for (const id of rows) {
    await db("rollcall_texts")
      .insert({
        rollcall: id,
        section: null,
        part: null,
        text: summary,
        kind: "summary",
        source: "summary",
        chars: summary.length,
        updated_at: new Date().toISOString(),
      })
      .onConflict("rollcall")
      .merge();
  }
  stats.attached += rows.length;
  if (rows.length && !argv.attach)
    console.log(
      `   🗳  ${reference}: summary attached to ${rows.length} motion vote(s)`
    );
}

/** The motions that still have no text: one document each. */
async function motionReferences() {
  const rows = await db.raw(`SELECT DISTINCT r.doc_ref AS ref
       FROM rollcalls r
      WHERE r.doc_ref GLOB '*10-[0-9][0-9][0-9][0-9]/*'
        AND NOT EXISTS (SELECT 1 FROM rollcall_texts t WHERE t.rollcall = r.id)
      ORDER BY r.doc_ref`);
  return rows.map((r) => r.ref);
}

async function runList(list, model, attach) {
  for (const reference of list) {
    try {
      const markdown = await documentMarkdown(reference);
      if (!markdown) {
        stats.failed++;
        console.warn(`   ⚠️  ${reference}: no document published by the API`);
        continue;
      }
      if (argv.dry) continue;
      await summarise(reference, markdown, model, attach);
    } catch (e) {
      stats.failed++;
      console.warn(`   ⚠️  ${reference}: ${e.message}`);
      // a bad key or an empty balance fails every document: stop at once
      if (/^DeepSeek (401|402)/.test(e.message)) process.exit(1);
    }
  }
}

async function main() {
  if (argv.attach) {
    await attachExisting();
    return;
  }
  if (!argv.dry && !process.env.DEEPSEEK_API_KEY) {
    console.error(
      "DEEPSEEK_API_KEY is not set. Add it to .env in the repo root (DEEPSEEK_API_KEY=sk-…) or export it."
    );
    process.exit(1);
  }
  const model = argv.model || MODEL;
  const inputs = argv._.filter(Boolean);

  // explicit references: attach the summary both as a report (by ref) and as a
  // motion (by doc_ref), which is what one reference can be
  if (inputs.length && !argv.motions) {
    console.log(
      `📚 ${inputs.length} reference(s), model ${
        argv.dry ? "(none, --dry)" : model
      }`
    );
    await runList(
      argv.missing
        ? inputs.filter(
            (r) => !fs.existsSync(path.join(SUMMARY_DIR, fileName(r)))
          )
        : inputs,
      model,
      async (reference, summary) => {
        await storeWholeTextVotes(reference, summary);
        await storeMotionVotes(reference, summary);
      }
    );
    reportCost();
    return;
  }

  // --report / --motions restrict; both by default (and with --all)
  const reports = argv.report || !argv.motions;
  const motions = argv.motions || !argv.report;

  if (reports) {
    let list = await references();
    if (argv.limit) list = list.slice(0, Number(argv.limit));
    console.log(
      `📚 ${list.length} report(s), model ${argv.dry ? "(none, --dry)" : model}`
    );
    await runList(list, model, storeWholeTextVotes);
  }
  if (motions) {
    let list = await motionReferences();
    if (argv.limit) list = list.slice(0, Number(argv.limit));
    console.log(
      `🗳  ${list.length} motion(s), model ${argv.dry ? "(none, --dry)" : model}`
    );
    await runList(list, model, storeMotionVotes);
  }

  reportCost();
}

function reportCost() {
  const cost = (stats.tokensIn * PRICE_IN + stats.tokensOut * PRICE_OUT) / 1e6;
  console.log(
    `\n${stats.documents} fetched, ${stats.summaries} summarised, ${stats.skipped} already there, ${stats.failed} failed` +
      `\n${stats.tokensIn} tokens in, ${
        stats.tokensOut
      } out — at most $${cost.toFixed(2)} (off-peak, cache miss)`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
