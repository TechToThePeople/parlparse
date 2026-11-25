#!/usr/bin/env node
/**
 * The procedure a report belongs to (2025/0227(COD)).
 *
 * The code is in the report's own document — `<DocRef>(COM(2025)0557 – C10-… –
 * 2025/0227(COD))</DocRef>` — which `documents/oeil.js` already saved as markdown. From
 * there the EP open data has the whole chain:
 *
 *   GET /api/v2/procedures/2025-0227
 *     label                  2025/0227(COD)
 *     process_title          the title in every language
 *     process_type           COD
 *     current_stage          RDG1
 *     created_a_realization_of   every document of the process
 *     consists_of            the activities, each with its date and document
 *
 * Usage:
 *   node openapi/procedure.js [options]
 *
 *   --force      fetch again what is already stored
 *   --dry        extract the codes, fetch nothing
 *   --limit, -n  stop after N reports
 *   --sleep      milliseconds between requests (default 1000: the API answers
 *                429 under a burst)
 *   --all        also the reports of earlier terms (A9-*, …); by default the
               pipeline only follows this term, so their procedures are skipped
  --help, -h
 */
"use strict";

const fs = require("fs");
const path = require("path");
const minimist = require("minimist");
const db = require("../lib/db");
const { apiFetch } = require("./lib");

const ROOT = path.join(__dirname, "..");
const OEIL_DIR = path.join(ROOT, "data", "content", "oeil");

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "force", "all", "help"],
  string: ["sleep"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/procedure.js [options]

  --force      fetch again what is already stored
  --dry        extract the codes, fetch nothing
  --limit, -n  stop after N reports
  --sleep      milliseconds between requests (default 1000)
  --help, -h
`);
  process.exit(0);
}

/** A10-0277_2026.md -> A10-0277/2026 */
const referenceOf = (file) => file.replace(/\.md$/, "").replace(/_/, "/");

/** 2025/0227(COD) from the report's markdown, null when there is none. */
function procedureCode(markdown) {
  const docRef = markdown.match(/<DocRef>(.*?)<\/DocRef>/s);
  const there = docRef && docRef[1].match(/\d{4}\/\d{4}\s*\([A-Z]+\)/);
  if (there) return there[0].replace(/\s+/g, "");
  // no DocRef line: the first code the document mentions
  const first = markdown.slice(0, 6000).match(/\d{4}\/\d{4}\s*\([A-Z]+\)/);
  return first ? first[0].replace(/\s+/g, "") : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => String(id || "").replace(/^eli\/dl\/(doc|event)\//, "");

/** One API record -> the row of the procedures table. */
function toRow(code, record) {
  const activities = (record.consists_of || []).map((a) => ({
    date: a.activity_date || null,
    type:
      String(a.had_activity_type || "")
        .split("/")
        .pop() || null,
    document: short((a.based_on_a_realization_of || [])[0]),
    stage:
      String(a.occured_at_stage || "")
        .split("/")
        .pop() || null,
  }));
  return {
    code,
    type:
      String(record.process_type || "")
        .split("/")
        .pop() || null,
    title: (record.process_title || {}).en || null,
    stage:
      String(record.current_stage || "")
        .split("/")
        .pop() || null,
    documents: JSON.stringify(
      (record.created_a_realization_of || []).map(short)
    ),
    activities: JSON.stringify(activities),
    raw: JSON.stringify(record),
    updated_at: new Date().toISOString(),
  };
}

const stats = {
  reports: 0,
  noCode: 0,
  stored: 0,
  cached: 0,
  missing: 0,
  failed: 0,
};

async function fetchProcedure(code) {
  const eli = code.match(/(\d{4})\/(\d{4})/);
  try {
    const json = await apiFetch(`/procedures/${eli[1]}-${eli[2]}`);
    return (json.data || [json])[0] || null;
  } catch (e) {
    // a procedure the API does not know; anything else is a failed read
    if (e.status === 404) return null;
    throw e;
  }
}

async function main() {
  // A report matters when something points at it: a vote (term 10 voted on 7
  // term-9 reports as well) or an agenda entry. 81 of the 88 A9-* reports were
  // never voted here, and their term-9 procedures would only buy old OEIL fetches.
  const voted = new Set(
    (
      await db.raw("select distinct ref from rollcalls where ref is not null")
    ).map((r) => r.ref)
  );
  // only a *forthcoming* agenda point counts: the July 2024 agendas list 88 A9-*
  // reports because the first term-10 sittings voted on term-9 texts
  const today = new Date().toISOString().slice(0, 10);
  const planned = new Set(
    (
      await db.raw(
        "select distinct report from agenda_items where report is not null and date >= ?",
        [today]
      )
    ).map((r) => r.report)
  );
  const files = fs
    .readdirSync(OEIL_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => {
      if (argv.all) return true;
      const reference = referenceOf(f);
      return voted.has(reference) || planned.has(reference);
    })
    .sort();
  const known = new Map(
    (await db("procedures").select("code", "updated_at")).map((r) => [
      r.code,
      r.updated_at,
    ])
  );
  const limit = argv.limit ? Number(argv.limit) : undefined;
  const pause = Number(argv.sleep || 1000);

  for (const file of files.slice(0, limit)) {
    const reference = referenceOf(file);
    const code = procedureCode(
      fs.readFileSync(path.join(OEIL_DIR, file), "utf8")
    );
    stats.reports++;
    if (!code) {
      stats.noCode++;
      continue;
    }
    if (argv.dry) {
      console.log(`   ${reference} → ${code}`);
      continue;
    }
    if (known.has(code) && !argv.force) {
      stats.cached++;
    } else {
      try {
        const record = await fetchProcedure(code);
        if (record) {
          await db("procedures")
            .insert(toRow(code, record))
            .onConflict("code")
            .merge();
          stats.stored++;
        } else {
          stats.missing++;
          console.log(`   ⚠️  ${code}: not in the API (${reference})`);
        }
        await sleep(pause);
      } catch (e) {
        stats.failed++;
        console.warn(`   ⚠️  ${code}: ${e.message}`);
      }
    }
    await db("reports")
      .where("reference", reference)
      .update({ procedure: code });
  }

  console.log(
    `\n${stats.stored} procedure(s) stored, ${stats.cached} already there, ` +
      `${stats.missing} not in the API, ${stats.failed} failed, ` +
      `${stats.noCode} report(s) without a procedure code`
  );
  await db.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
