#!/usr/bin/env node
/**
 * openapi/reports.js — Fetch document/report metadata from the OpenAPI
 * and populate the reports table.
 *
 * For each unique document reference found in rollcalls.ref:
 *   1. Convert to an API document ID (e.g. B10-0007/2024 → B-10-2024-0007)
 *   2. Fetch metadata from GET /api/v2/documents/{id}
 *   3. Classify creator entries into rapporteur, committee, eugroups
 *   4. Upsert into the reports table
 *
 * Usage:
 *   node openapi/reports.js            # process all missing references
 *   node openapi/reports.js --all      # same (default)
 *   node openapi/reports.js --force    # re-process already fetched ones
 */

const db = require("../lib/db");
const fs = require("fs");
const path = require("path");

const API_BASE = "https://data.europarl.europa.eu/api/v2";
const COMMITTEES_PATH = path.resolve(
  __dirname,
  "..",
  "data",
  "committees.json"
);

// Known EP political group codes (API code → internal code)
const GROUP_MAP = {
  PPE: "PPE",
  EPP: "EPP",
  "S-D": "S&D",
  ECR: "ECR",
  RENEW: "Renew",
  "VERTS-ALE": "Verts/ALE",
  "GUE-NGL": "GUE/NGL",
  ESN: "ESN",
  PFE: "PfE",
  LEFT: "The Left",
  NI: "NI",
  PATRIOTS: "Patriots",
};

// Load committee codes
const committees = JSON.parse(fs.readFileSync(COMMITTEES_PATH, "utf-8"));

/**
 * Convert a document reference like "B10-0007/2024" to API ID "B-10-2024-0007".
 */
function refToApiId(ref) {
  if (!ref || !ref.includes("/")) return null;
  const parts = ref.split("/");
  if (parts.length !== 2) return null;
  const year = parts[1];
  const left = parts[0];
  const segments = left.split("-");
  const number = segments.pop();
  const rest = segments.join("-");
  // Insert dash between letter(s) and term: B10 → B-10
  const fixed = rest.replace(/^([A-Za-z]+(?:\-[A-Za-z]+)?)(\d+)$/, "$1-$2");
  return fixed + "-" + year + "-" + number;
}

/**
 * Appears to be a committee (in committees.json)?
 */
function isCommittee(code) {
  return !!committees[code];
}

/**
 * Appears to be a political group (in GROUP_MAP)?
 */
function isGroup(code) {
  return !!GROUP_MAP[code];
}

/**
 * Classify creator entries (from the API response) into parts.
 */
function classifyCreators(creators) {
  const rapporteur = [];
  const eugroups = [];
  let committee = null;

  for (const c of creators || []) {
    // person/257047 → MEP rapporteur candidate
    if (c.startsWith("person/")) {
      const id = c.replace("person/", "");
      if (/^\d+$/.test(id)) rapporteur.push(id);
      continue;
    }
    // org/CODE
    if (c.startsWith("org/")) {
      const code = c.replace("org/", "");
      if (isCommittee(code)) {
        committee = code;
      } else if (isGroup(code)) {
        eugroups.push(GROUP_MAP[code]);
      }
      // Unknown org — skip
    }
  }

  return {
    rapporteur: rapporteur.length > 0 ? rapporteur[0] : null, // first rapporteur only
    eugroups:
      eugroups.length > 0 ? [...new Set(eugroups)].sort().join(",") : null,
    committee,
  };
}

/**
 * Fetch a single document from the OpenAPI with retry on 429.
 */
async function fetchDocument(apiId) {
  const url = `${API_BASE}/documents/${apiId}?format=application/ld+json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      return json.data ? json.data[0] : null;
    }
    if (res.status === 429) {
      const delay = 2000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return null; // non-retryable error
  }
  return null;
}

/**
 * Get English title from document expressions.
 */
function getEnglishTitle(doc) {
  const expressions = doc.is_realized_by || [];
  for (const expr of expressions) {
    if ((expr.language || "").includes("ENG")) {
      return expr.title?.en || null;
    }
  }
  return null;
}

async function main() {
  const force = process.argv.includes("--force");

  // 1. Collect unique refs from rollcalls
  const refs = await db("rollcalls")
    .distinct("ref")
    .whereNotNull("ref")
    .where("ref", "!=", "")
    .whereNot("ref", "LIKE", "agenda%")
    .whereNot("ref", "LIKE", "EP error")
    .orderBy("ref");

  const refValues = refs.map((r) => r.ref).filter(Boolean);
  console.log(`📋 ${refValues.length} unique document references found`);

  // 2. Filter out already-enriched refs (skip if committee or rapporteur is already set)
  const existing = await db("reports")
    .select("reference")
    .whereNotNull("committee")
    .orWhereNotNull("rapporteur");
  const enrichedSet = new Set(existing.map((r) => r.reference));

  let toProcess = refValues;
  if (!force) {
    toProcess = refValues.filter((r) => !enrichedSet.has(r));
    console.log(
      `   → ${toProcess.length} to process (${
        refValues.length - toProcess.length
      } already enriched)`
    );
  } else {
    console.log(`   → processing all (--force)`);
  }

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const ref = toProcess[i];
    const apiId = refToApiId(ref);

    if (!apiId) {
      console.log(
        `   ⏭️  [${i + 1}/${toProcess.length}] ${ref} → cannot convert`
      );
      fail++;
      continue;
    }

    process.stdout.write(
      `   [${i + 1}/${toProcess.length}] ${ref} → ${apiId} … `
    );
    let doc = await fetchDocument(apiId);

    if (!doc) {
      console.log("❌ not found");
      fail++;
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    const title = getEnglishTitle(doc);
    const date = doc.document_date || null;
    const creators = doc.creator || [];
    const classified = classifyCreators(creators);

    // Determine work type label
    const workType = (doc.work_type || "").split("/").pop() || "";

    await db("reports")
      .insert({
        reference: ref,
        title: title || doc.label || null,
        date,
        type: workType,
        committee: classified.committee,
        rapporteur: classified.rapporteur,
        eugroups: classified.eugroups,
        term: 10,
        url: `https://www.europarl.europa.eu/doceo/document/${apiId}_EN.html`,
      })
      .onConflict("reference")
      .merge();

    console.log(
      `✓ ${classified.committee || "—"} ${classified.eugroups || ""}`
    );
    ok++;

    // Rate-limit delay (API is aggressive)
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n✅ Done: ${ok} OK, ${fail} failed`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
