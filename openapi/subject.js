#!/usr/bin/env node
/**
 * The subjects of a procedure, from two sources.
 *
 * 1. The OEIL procedure page — the "Subject" block, exactly as the site shows it:
 *
 *      <p class="font-weight-bold mb-1">Subject</p>
 *      <p>6.20 Common commercial policy in general<br/>
 *         8.70 Budget of the Union<br/>
 *         8.70.02 Financial regulations</p>
 *
 *    This numbering does not exist in the open data, so it can only be harvested.
 *
 * 2. The open data, on the documents of the procedure: `isAboutDirectoryCode`
 *    (Publications Office `dir-eu-legal-act`), `isAboutSubjectMatter` (policy
 *    areas: BUDG, PROT), `is_about` (EuroVoc concepts). Their codes mean the same
 *    things but are numbered differently (016020 = "Budget" where OEIL says 8.70),
 *    hence one row per (scheme, code).
 *
 * Labels are fetched once per code from the Publications Office / EuroVoc (SKOS
 * prefLabel, English) and cached in the table.
 *
 * Usage:
 *   node openapi/subject.js [options]
 *
 *   --procedure <code>  only that procedure (2025/0227(COD))
 *   --force             redo procedures that already have subjects
 *   --dry               parse and print, write nothing
 *   --limit, -n         stop after N procedures
 *   --sleep             ms between requests (default 700: the API allows 500/5min)
 *   --help, -h
 */
"use strict";

const minimist = require("minimist");
const db = require("../lib/db");

const API = "https://data.europarl.europa.eu/api/v2";
const OEIL = "https://oeil.europarl.europa.eu/oeil/en/procedure-file";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0 Safari/537.36";

// code -> the SKOS concept that carries its label
const LABEL_URL = {
  "dir-eu-legal-act": (c) =>
    `http://publications.europa.eu/resource/authority/dir-eu-legal-act/${c}`,
  "subject-matter": (c) =>
    `http://publications.europa.eu/resource/authority/subject-matter/${c}`,
  eurovoc: (c) => `http://eurovoc.europa.eu/${c}`,
};

const argv = minimist(process.argv.slice(2), {
  boolean: ["dry", "force", "help"],
  string: ["procedure", "sleep"],
  alias: { h: "help", n: "limit" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/subject.js [options]

  --procedure <code>  only that procedure (2025/0227(COD))
  --force             redo procedures that already have subjects
  --dry               parse and print, write nothing
  --limit, -n         stop after N procedures
  --sleep             ms between requests (default 700)
  --help, -h
`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch rather than https.get: the Publications Office URIs are http:// and
// redirect to https, and OEIL is not the same host as the API
const get = async (url, accept) => {
  try {
    const res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: "" };
  }
};

/** Repeated 429/5xx: the API allows 500 requests per 5 minutes. */
async function getWithBackoff(url, accept) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await get(url, accept);
    if (r.status === 200 || r.status === 404) return r;
    await sleep(3000 * attempt);
  }
  return { status: 0, body: "" };
}

/** The Subject block of an OEIL procedure page: [{code, label}]. */
function oeilSubjects(html) {
  const at = html.search(/class="font-weight-bold mb-1">\s*Subject\s*</i);
  if (at < 0) return [];
  const block = html.slice(at, at + 2000).match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!block) return [];
  return block[1]
    .split(/<br\s*\/?>/i)
    .map((line) =>
      line
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
      return m ? { code: m[1], label: m[2] } : { code: null, label: line };
    })
    .filter((s) => s.code);
}

/** isAboutDirectoryCode / isAboutSubjectMatter / is_about of one document. */
function apiSubjects(record) {
  const out = [];
  for (const uri of record.isAboutDirectoryCode || [])
    out.push({
      scheme: "dir-eu-legal-act",
      code: String(uri).split("/").pop(),
    });
  for (const uri of record.isAboutSubjectMatter || [])
    out.push({ scheme: "subject-matter", code: String(uri).split("/").pop() });
  for (const uri of record.is_about || [])
    if (String(uri).includes("eurovoc.europa.eu"))
      out.push({ scheme: "eurovoc", code: String(uri).split("/").pop() });
  return out;
}

/** English prefLabel of a SKOS concept. */
function prefLabel(rdf) {
  const en = rdf.match(
    /<skos:prefLabel[^>]*xml:lang="en"[^>]*>([\s\S]*?)<\/skos:prefLabel>/
  );
  return en ? en[1].replace(/<[^>]+>/g, "").trim() : null;
}

const stats = {
  procedures: 0,
  skipped: 0,
  noSubject: 0,
  subjects: 0,
  links: 0,
  labels: 0,
  failed: 0,
};

/** Store one subject, returning its id. The label is fetched once per code. */
async function subjectId(scheme, code, label, pause) {
  const row = await db("subjects").where({ scheme, code }).first("id", "label");
  if (row && row.label) return row.id;
  let resolved = label || null;
  if (!resolved && LABEL_URL[scheme]) {
    const { status, body } = await getWithBackoff(LABEL_URL[scheme](code));
    if (status === 200) {
      resolved = prefLabel(body);
      stats.labels++;
    }
    await sleep(pause);
  }
  if (argv.dry) {
    console.log(`      ${scheme} ${code} → ${resolved || "(no label)"}`);
    return null;
  }
  if (row) {
    await db("subjects")
      .where("id", row.id)
      .update({ label: resolved, updated_at: new Date().toISOString() });
    return row.id;
  }
  const [id] = await db("subjects").insert({
    scheme,
    code,
    label: resolved,
  });
  return id;
}

async function main() {
  const pause = Number(argv.sleep || 700);
  const rows = await db.raw(
    `SELECT p.code, p.documents
       FROM procedures p
      WHERE 1 = 1
        ${argv.procedure ? "AND p.code = ?" : ""}
        ${
          !argv.force && !argv.procedure ? "AND p.subjects_checked IS NULL" : ""
        }
      ORDER BY p.code`,
    argv.procedure ? [argv.procedure] : []
  );
  const procedures = rows.slice(0, argv.limit ? Number(argv.limit) : undefined);
  console.log(`📑 ${procedures.length} procedure(s)`);

  for (const { code, documents } of procedures) {
    stats.procedures++;
    const found = [];

    // 1. the OEIL page
    const oeil = await getWithBackoff(
      `${OEIL}?reference=${encodeURIComponent(code)}`,
      "text/html"
    );
    const oeilOk = oeil.status === 200;
    if (oeilOk) {
      for (const s of oeilSubjects(oeil.body))
        found.push({ scheme: "oeil", code: s.code, label: s.label });
    }
    await sleep(pause);

    // 2. the documents of the process: the first one that carries a classification
    let docs = [];
    try {
      docs = (JSON.parse(documents || "[]") || []).slice(0, 4);
    } catch {
      docs = [];
    }
    let apiOk = docs.length === 0;
    for (const doc of docs) {
      const { status, body } = await getWithBackoff(
        `${API}/documents/${doc}?format=application/ld%2Bjson`,
        "application/ld+json"
      );
      await sleep(pause);
      if (status !== 200) continue;
      apiOk = true;
      let record;
      try {
        record = JSON.parse(body).data[0];
      } catch {
        continue;
      }
      const fromApi = apiSubjects(record || {});
      if (fromApi.length) {
        found.push(...fromApi);
        break;
      }
    }

    if (!oeilOk || !apiOk) {
      // no answer is not an answer: leave it unchecked so the next run retries it
      stats.failed++;
      console.log(
        `   ⚠️  ${code}: could not read the sources ` +
          `(OEIL ${oeil.status}, ${apiOk ? "API ok" : "API silent"})`
      );
      continue;
    }
    if (!found.length) {
      stats.noSubject++;
      console.log(`   · ${code}: no subject published`);
      if (!argv.dry)
        await db("procedures")
          .where("code", code)
          .update({ subjects_checked: new Date().toISOString() });
      continue;
    }

    stats.subjects += found.length;
    if (argv.dry) {
      console.log(`   ${code}:`);
      for (const s of found)
        console.log(`      ${s.scheme} ${s.code} ${s.label || ""}`);
      continue;
    }
    for (const s of found) {
      const id = await subjectId(s.scheme, s.code, s.label, pause);
      if (id == null) continue;
      await db("procedure_subjects")
        .insert({ procedure: code, subject: id })
        .onConflict(["procedure", "subject"])
        .ignore();
      stats.links++;
    }
    await db("procedures")
      .where("code", code)
      .update({ subjects_checked: new Date().toISOString() });
    stats.skipped++;
  }

  console.log(
    `\n${stats.links} subject link(s) over ${stats.subjects} subject(s), ` +
      `${stats.labels} label(s) fetched, ${stats.noSubject} procedure(s) ` +
      `without a published subject, ${stats.failed} could not be read ` +
      `(left for the next run)`
  );
  await db.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
