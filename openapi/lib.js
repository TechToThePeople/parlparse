#!/usr/bin/env node
/**
 * Shared utilities for the EP Open Data API v2 scripts.
 * Uses native fetch (Node 18+) — no node-fetch dependency.
 */

const fs = require("fs");
const path = require("path");
// waf is loaded lazily — see getWaf() below

/** Lazy waf accessor — only loads puppeteer-core when first needed. */
let _waf = null;
function getWaf() {
  if (!_waf) _waf = require("../waf");
  return _waf;
}

const API_BASE = "https://data.europarl.europa.eu/api/v2";
const API_BASE_URL = "https://data.europarl.europa.eu";
const OUTPUT_BASE = path.resolve(__dirname, "..", "data", "openapi");
const TERM = 10;

/**
 * Build a URL with query parameters.
 */
function buildUrl(path, params) {
  // Strip leading slash so path is treated as relative to the base URL
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const base = API_BASE.endsWith("/") ? API_BASE : API_BASE + "/";
  const url = new URL(relativePath, base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Generic fetch wrapper — GET a JSON-LD resource.
 * Retries with exponential backoff on 429 (rate limit).
 */
async function apiFetch(urlPath, params = {}) {
  const url = buildUrl(urlPath, { format: "application/ld+json", ...params });
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429) {
      const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
      console.warn(
        `   ⏳ rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/5)`
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`API ${res.status} for ${url}: ${res.statusText}`);
  }
  throw new Error(`API rate limit exceeded for ${url} after 5 retries`);
}

/**
 * Fetch the list of documents for a given work-type and term.
 * Handles pagination via offset/limit automatically.
 */
async function fetchDocumentList(workType, term = TERM) {
  const all = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const json = await apiFetch("/documents", {
      "work-type": workType,
      "parliamentary-term": term,
      limit,
      offset,
    });

    const batch = json.data || [];
    all.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
  }

  return all;
}

/**
 * Fetch a single document by its identifier (e.g. "PV-10-2024-07-17-RCV").
 */
async function fetchDocumentById(identifier) {
  return apiFetch(`/documents/${identifier}`);
}

/**
 * Fetch all decisions (votes) for a plenary sitting.
 * sittingId looks like "MTG-PL-2024-07-17".
 */
async function fetchDecisions(sittingId) {
  return apiFetch(`/meetings/${sittingId}/decisions`, { limit: 200 });
}

/**
 * Fetch a specific decision by its ID.
 */
async function fetchDecisionById(sittingId, decisionId) {
  return apiFetch(`/meetings/${sittingId}/decisions/${decisionId}`);
}

/**
 * Find a plenary sitting by date.
 * Returns the first MTG-PL-* event for the given date, or null.
 */
async function fetchMeetingByDate(dateStr) {
  // Meeting IDs follow a predictable pattern: MTG-PL-YYYY-MM-DD
  // Try direct access first (fast path)
  const meetingId = `MTG-PL-${dateStr}`;
  try {
    const json = await apiFetch(`/meetings/${meetingId}`);
    const item = json.data ? json.data[0] : null;
    if (item && item.activity_id === meetingId) return item;
  } catch {
    // Fallback: query the meetings list
  }

  // Fallback: broader search
  const json = await apiFetch("/meetings", {
    limit: 50,
  });
  const items = json.data || [];
  return (
    items.find(
      (m) =>
        m.activity_id?.startsWith("MTG-PL-") && m.activity_id?.endsWith(dateStr)
    ) || null
  );
}

/**
 * Resolve user input to a canonical document identifier.
 *
 * Accepts:
 *   - A date string "2024-07-17" → looks up the document list
 *   - A full identifier "PV-10-2024-07-17-RCV" → used as-is
 *
 * @param {string} workType — e.g. "VOTE_ROLLCALL_PLENARY"
 * @param {string} input   — date or ID
 * @returns {Promise<{identifier: string, date: string, label: string}>}
 */
async function resolveId(workType, input) {
  // If it looks like a date (YYYY-MM-DD), search the document list
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const docs = await fetchDocumentList(workType);
    const suffix =
      workType === "VOTE_ROLLCALL_PLENARY"
        ? "RCV"
        : workType === "VOTE_RESULTS_PLENARY"
        ? "VOT"
        : workType === "LIST_ATTEND_PLENARY"
        ? "ATT"
        : "";
    const expectedId = `PV-10-${input.replace(/-/g, "-")}-${suffix}`;
    // First try exact match
    let match = docs.find((d) => d.identifier === expectedId);
    if (match) {
      return {
        identifier: match.identifier,
        date: input,
        label: match.label,
      };
    }
    // Fallback: fuzzy match by date in identifier
    match = docs.find((d) => d.identifier?.includes(input));
    if (match) {
      return {
        identifier: match.identifier,
        date: input,
        label: match.label,
      };
    }
    throw new Error(
      `No ${workType} document found for date ${input}. Use --list to see available dates.`
    );
  }

  // Otherwise treat as a raw identifier
  return {
    identifier: input,
    date: input.replace(/^PV-10-/, "").substring(0, 10),
    label: input,
  };
}

/**
 * Extract the date from a document identifier like "PV-10-2024-07-17-RCV".
 */
function extractDateFromId(identifier) {
  if (!identifier || typeof identifier !== "string") return null;
  // PV-10-2024-07-17-RCV → "2024-07-17"
  const parts = identifier.split("-");
  // parts: ["PV", "10", "2024", "07", "17", "RCV"]
  if (parts.length >= 5 && parts[0] === "PV") {
    return `${parts[2]}-${parts[3]}-${parts[4]}`;
  }
  return null;
}

/**
 * Save data as pretty-printed JSON to data/openapi/{subfolder}/{filename}.json.
 * Creates parent directories if needed.
 */
function saveJson(subfolder, filename, data) {
  const dir = path.join(OUTPUT_BASE, subfolder);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${filename}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  ✓ saved ${filePath}`);
  return filePath;
}

/**
 * Common argument parser for all three scripts.
 * Returns { input, help }.
 */
function parseArgs() {
  const minimist = require("minimist");
  const argv = minimist(process.argv.slice(2), {
    alias: { d: "date", h: "help", f: "force", a: "all" },
  });

  const force = argv.force || false;
  const all = argv.all || false;

  if (argv.help) {
    return { help: true, input: null, force: false, all: false };
  }

  let input = null;
  if (argv._.length > 0) {
    input = argv._[0];
  } else if (argv.date) {
    input = argv.date;
  }

  return { help: false, input, force, all };
}

/**
 * Print script usage.
 */
function printUsage(scriptName, workTypeLabel) {
  const name = path.basename(scriptName);
  console.log(`
Usage:
  node openapi/${name} [options] [<id> | <date>]

Arguments:
  <id>       A document identifier, e.g. PV-10-2024-07-17-RCV
  <date>     A date in YYYY-MM-DD format, e.g. 2024-07-17

Options:
  --date, -d <date>   Date to fetch (alternative to positional arg)
  --help, -h          Show this help

Description:
  Fetch ${workTypeLabel} for the 10th European Parliament term
  from the EP Open Data API (https://data.europarl.europa.eu/api/v2).

Examples:
  node openapi/${name} 2024-07-17
  node openapi/${name} PV-10-2024-07-17-RCV
  node openapi/${name} --date=2024-07-17
`);
}

module.exports = {
  API_BASE,
  OUTPUT_BASE,
  TERM,
  fetchDocumentList,
  fetchDocumentById,
  fetchDecisions,
  fetchDecisionById,
  fetchMeetingByDate,
  resolveId,
  extractDateFromId,
  saveJson,
  parseArgs,
  printUsage,
  getWaf,
};
