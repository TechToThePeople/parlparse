#!/usr/bin/env node
/**
 * The procedure a report belongs to (2025/0227(COD)).
 *
 * The code is in the report's own document — `<DocRef>(COM(2025)0557 – C10-… –
 * 2025/0227(COD))</DocRef>` — which `ai/oeil.js` already saved as markdown. From
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
 *   --help, -h
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const minimist = require("minimist");
const db = require("../lib/db");

const ROOT = path.join(__dirname, "..");
const OEIL_DIR = path.join(ROOT, "data", "content", "oeil");
const API = "https://data.europarl.europa.eu/api/v2/procedures";

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "force", "help"],
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

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0 Safari/537.36";

const get = (url) =>
  new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/ld+json",
          // the API answers 403 to a request without a browser User-Agent
          "User-Agent": UA,
        },
        timeout: 30000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "" });
    });
  });

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
  const url = `${API}/${eli[1]}-${eli[2]}?format=application/ld%2Bjson`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { status, body } = await get(url);
    if (status === 200) {
      try {
        return JSON.parse(body).data[0] || null;
      } catch {
        return null;
      }
    }
    if (status === 404) return null;
    // 429 or a hiccup: the API wants a pause
    await sleep(4000 * attempt);
  }
  throw new Error(`could not fetch ${url}`);
}

async function main() {
  const files = fs
    .readdirSync(OEIL_DIR)
    .filter((f) => f.endsWith(".md"))
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
