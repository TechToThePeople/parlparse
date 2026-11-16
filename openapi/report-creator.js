#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/report-creator.js — fill `reports.creator` with the committee(s) or
 * political group(s) behind each report.
 *
 * Sources, in order:
 *   1. `reports.raw` when it is an OpenAPI document (most rows) — `creator`
 *      entries like "org/ENVI" (committee) vs "org/PPE" (group).
 *   2. GET /documents/<eli> built from the reference (A10-0098/2025 →
 *      A-10-2025-0098) for rows without a usable raw.
 *   3. Scrape the oeil procedure page in `reports.url`, which also gives a
 *      committee for motions where the API lists only groups.
 *
 * Values are comma-separated ("ECON, BUDG", "PPE, ECR"), matching
 * requested_by. Report rows (A10-*) normally carry committees, motions
 * (B10-… / RC-B10-…) the groups that tabled them.
 *
 * Usage:
 *   node openapi/report-creator.js --dry          # show what would change
 *   node openapi/report-creator.js [--limit N]
 */

const minimist = require("minimist");
const db = require("../lib/db");
const { fetchDocumentById } = require("./lib");

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

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "help"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/report-creator.js [options]

Options:
  --dry         Show the changes without writing
  --limit, -n   Process at most N reports
  --help, -h    Show this help
`);
  process.exit(0);
}

/** "A10-0098/2025" -> "A-10-2025-0098"; null when the reference is unusual. */
function eliId(reference) {
  const m = String(reference).match(/^(?:RC-)?([AB])(\d+)-(\d+)\/(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[4]}-${m[3]}` : null;
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

async function main() {
  const query = db("reports").select(
    "id",
    "reference",
    "creator",
    "raw",
    "url"
  );
  if (argv.limit) query.limit(argv.limit);
  const reports = await query.orderBy("id");

  let updated = 0;
  let unchanged = 0;
  let unresolved = 0;

  for (const report of reports) {
    const eli = eliId(report.reference);
    let creators = [];

    let raw = null;
    try {
      raw = JSON.parse(report.raw || "null");
    } catch {
      raw = null;
    }
    if (raw && raw.creator) creators = creatorsFromApi(raw.creator);

    if (creators.length === 0 && eli) {
      try {
        const doc = await fetchDocumentById(eli);
        const d = (doc.data || [doc])[0] || {};
        creators = creatorsFromApi(d.creator);
      } catch {
        // 404 for references that predate the API's identifier scheme
      }
    }

    if (creators.length === 0 && report.url && report.url.includes("oeil")) {
      try {
        creators = await creatorsFromUrl(report.url);
      } catch (e) {
        console.warn(`   ⚠️  ${report.reference}: oeil ${e.message}`);
      }
    }

    if (creators.length === 0) {
      unresolved++;
      if (argv.dry && unresolved <= 20)
        console.log(`   ${report.reference.padEnd(16)} (no creator)`);
      continue;
    }

    const value = creators.join(", ").slice(0, 255);
    if (value === report.creator) {
      unchanged++;
      continue;
    }
    if (argv.dry) {
      console.log(
        `   ${report.reference.padEnd(16)} ${JSON.stringify(
          report.creator
        )} -> ${JSON.stringify(value)}`
      );
    } else {
      await db("reports").where("id", report.id).update({ creator: value });
    }
    updated++;
  }

  console.log(
    `${
      argv.dry ? "would update" : "updated"
    } ${updated}, unchanged ${unchanged}, no creator found ${unresolved} (${
      reports.length
    } reports)`
  );
  console.log(
    "note: text_tabled.csv is generated by csv.js — re-run it to publish to ../10"
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
