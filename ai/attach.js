#!/usr/bin/env node
/**
 * Put a report's summary on the votes that are about "the text as a whole".
 *
 * A vote on the whole text ("Proposition de résolution (ensemble du texte)",
 * "text as a whole", "Projet de décision du Conseil") has no quoted wording to
 * extract — the text is the report. The summary we already keep on the report is
 * the only sensible content for those rows, so it is written as
 * `rollcall_texts.kind = 'summary'`.
 *
 * Driven by `reports.summary` in the database, not by the files on disk: a vote
 * created by decisions.js after the summary was written still picks it up on the
 * next run, with no model call and no download. Idempotent: a row whose text
 * already is the summary is left alone.
 *
 * Usage: node ai/attach.js [--dry]
 */
const db = require("../lib/db.js");

const argv = require("minimist")(process.argv.slice(2), {
  boolean: ["dry", "verbose"],
});

// the vote is on the report/recommendation itself…
const WHOLE_TEXT = /ensemble du texte|as a whole|motion for a resolution|proposition de r[ée]solution|proposals? for (?:a )?decisions?|proposition de la commission|commission proposal|projet de d[ée]cision|proposition de d[ée]cision|draft council decision|projet du conseil|draft legislative act|approval without vote|joint text|texte conjoint|provisional agreement|accord provisoire/i;

// …but "… – Am 1", "§ 3", "Article 2" is a part of the text, never the text itself
const PART_OF_TEXT = /[–-]\s*Am\s|\bAm\s*\d|§|Article/i;

const isWholeText = (vote) =>
  vote.vote_type === "main" ||
  (WHOLE_TEXT.test(vote.name || "") && !PART_OF_TEXT.test(vote.name || ""));

/**
 * The rows the summary belongs on, given the report/motion it belongs to.
 * A motion is its own document (`doc_ref`), so it is always the whole text.
 */
function belongsTo(vote, reference) {
  if (vote.doc_ref === reference) return true;
  return vote.ref === reference && isWholeText(vote);
}

/**
 * Write the summary on the votes of one reference. Returns the rows written.
 */
async function attachReference(reference, summary) {
  const { url } =
    (await db("reports").where("reference", reference).first("url")) || {};
  const votes = await db("rollcalls")
    .where("ref", reference)
    .orWhere("doc_ref", reference)
    .select("id", "name", "vote_type", "ref", "doc_ref");
  const rows = votes.filter((vote) => belongsTo(vote, reference));
  if (!rows.length) return 0;
  return write(rows, summary, url);
}

/**
 * Every summary we have, against every vote that should carry it.
 */
async function attachAll() {
  const summaries = await db("reports")
    .whereNotNull("summary")
    .select("reference", "summary", "url");
  const byRef = new Map(summaries.map((row) => [row.reference, row]));
  const references = [...byRef.keys()];

  let written = 0;
  // SQLite caps a statement at 999 bound values
  for (let i = 0; i < references.length; i += 400) {
    const chunk = references.slice(i, i + 400);
    const votes = await db("rollcalls")
      .whereIn("ref", chunk)
      .orWhereIn("doc_ref", chunk)
      .select("id", "name", "vote_type", "ref", "doc_ref");
    const bySummary = new Map();
    for (const vote of votes) {
      const reference = [vote.doc_ref, vote.ref].find(
        (key) => key && byRef.has(key) && belongsTo(vote, key)
      );
      if (!reference) continue;
      if (!bySummary.has(reference)) bySummary.set(reference, []);
      bySummary.get(reference).push(vote);
    }
    for (const [reference, rows] of bySummary) {
      const { summary, url } = byRef.get(reference);
      written += await write(rows, summary, url);
    }
  }
  return written;
}

/**
 * Insert the summary where it is missing, and only there.
 */
async function write(votes, summary, url) {
  const text = String(summary || "").trim();
  if (!text || !votes.length) return 0;
  const ids = votes.map((vote) => vote.id);
  const existing = new Map(
    (
      await db("rollcall_texts")
        .whereIn("rollcall", ids)
        .where("kind", "summary")
        .select("rollcall", "text")
    ).map((row) => [row.rollcall, row.text])
  );
  const rows = voters(votes, existing, text, url);
  if (!rows.length || argv.dry) return rows.length;
  for (let i = 0; i < rows.length; i += 100) {
    await db("rollcall_texts")
      .insert(rows.slice(i, i + 100))
      .onConflict("rollcall")
      .merge();
  }
  return rows.length;
}

function voters(votes, existing, text, url) {
  const now = new Date().toISOString();
  return votes
    .filter((vote) => existing.get(vote.id) !== text)
    .map((vote) => ({
      rollcall: vote.id,
      section: null,
      part: null,
      text,
      kind: "summary",
      source: "summary",
      source_url: url || null,
      chars: text.length,
      updated_at: now,
    }));
}

async function main() {
  const written = await attachAll();
  console.log(
    `🔗 ${written} whole-text vote(s) ${
      argv.dry ? "would get" : "got"
    } their report summary`
  );
  await db.destroy();
}

module.exports = { attachAll, attachReference, isWholeText };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
