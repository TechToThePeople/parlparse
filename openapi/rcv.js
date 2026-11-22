#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/rcv.js — Download English RCV XML and process into the database.
 *
 * Saves:
 *   data/RCV/{date}.xml.zip   — gzip-compressed English roll-call XML
 *   Then parses it and populates rollcalls + positions tables.
 *
 * Usage:
 *   node openapi/rcv.js 2024-07-17
 *   node openapi/rcv.js PV-10-2024-07-17-RCV
 *   node openapi/rcv.js --all
 */

const fs = require("fs");
const path = require("path");
const {
  fetchDocumentList,
  fetchDocumentById,
  extractDateFromId,
  parseArgs,
  printUsage,
  getWaf,
  saveRcvXml,
} = require("./lib");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0 Safari/537.36";

/**
 * The XML the API publishes for this sitting, when it names one: doceo's
 * `-RCV_EN.xml` shortcut can be a preliminary version — for 2025-03-12 it holds
 * 172620 where the final file holds 172953, the vote the VOT document reports.
 */
async function publishedXml(identifier) {
  try {
    const json = await fetchDocumentById(identifier);
    const doc = (json.data || [json])[0] || {};
    const urls = [];
    for (const expression of doc.is_realized_by || []) {
      if (!String(expression.id || "").endsWith("/en")) continue;
      for (const m of expression.is_embodied_by || []) {
        if (String(m.format || "").includes("XML") && m.is_exemplified_by)
          urls.push(
            `https://data.europarl.europa.eu/${m.is_exemplified_by.replace(
              /^\//,
              ""
            )}`
          );
      }
    }
    return urls;
  } catch {
    return [];
  }
}

/** Download the first URL that answers with real roll-call XML. */
async function downloadPublished(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(120000),
      });
      if (res.status !== 200) continue;
      const body = await res.text();
      if (body.includes("<PV.RollCallVoteResults")) return body;
    } catch {
      // try the next one
    }
  }
  return null;
}

const WORK_TYPE = "VOTE_ROLLCALL_PLENARY";

async function main() {
  const { help, input, force, all } = parseArgs();

  if (help) {
    printUsage(process.argv[1], "roll-call vote XML");
    process.exit(0);
  }

  let dates;
  if (all) {
    console.log("📋 Fetching all roll-call document dates…");
    const docs = await fetchDocumentList(WORK_TYPE);
    dates = docs
      .map((d) => extractDateFromId(d.identifier))
      .filter(Boolean)
      .sort();
    console.log(`   → ${dates.length} dates found`);
  } else if (!input) {
    console.error(
      "Error: provide a date or document identifier, or use --all."
    );
    printUsage(process.argv[1], "roll-call vote XML");
    process.exit(1);
  } else {
    dates = [input];
  }

  let totalOk = 0;
  let totalSkip = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (dates.length > 1) console.log(`\n[${i + 1}/${dates.length}] ${date}`);

    const result = await processDate(date, force);
    if (result === "ok") totalOk++;
    else if (result === "skip") totalSkip++;

    if (result === "ok" && dates.length > 1 && i < dates.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  await Promise.race([
    getWaf().closeBrowser(),
    new Promise((resolve) =>
      setTimeout(() => {
        console.log("   ⏳ browser close safety timeout");
        resolve();
      }, 5000)
    ),
  ]);

  if (dates.length > 1) {
    console.log(
      `\n✅ Done: ${totalOk} fetched, ${totalSkip} skipped (${dates.length} total)`
    );
  } else if (totalOk === 0) {
    console.log(`\n✅ Done — roll-call votes already cached.`);
  }
}

/**
 * Process a single roll-call date.
 * @returns {'ok' | 'skip'}
 */
async function processDate(date, force) {
  // Construct identifier directly — pattern is always PV-10-YYYY-MM-DD-RCV
  const identifier = `PV-10-${date}-RCV`;
  const rcvDir = path.resolve(__dirname, "..", "data", "RCV");
  const zipPath = path.join(rcvDir, `${date}.xml.zip`);

  // A downloaded file was not always processed (the old code returned here), so
  // the database step below runs for every date, cached or not.
  const cached = !force && fs.existsSync(zipPath);
  if (cached) console.log(`   ⏭️  Already downloaded, importing it`);
  else await download(date, identifier, zipPath);

  // Process into database via lib/rollcall.js
  if (fs.existsSync(zipPath)) {
    console.log(`📊 Processing roll-call votes into database…`);
    try {
      const processRollCall = require("../lib/rollcall");
      const db = require("../lib/db");

      // Get or create plenaries row
      let plenary = await db("plenaries").where("date", date).first();
      if (!plenary) {
        const [id] = await db("plenaries").insert({
          date,
          term: 10,
          source: "openapi",
        });
        plenary = await db("plenaries").where("id", id).first();
      }

      const result = await processRollCall(plenary, {
        folder: "./data/RCV/",
        force,
      });
      if (result) {
        console.log(`   → ${result.votes} votes, ${result.added} positions`);
      }
    } catch (e) {
      console.warn(`   ⚠️  DB processing: ${e.message}`);
    }
  }

  console.log(`\n✅ Done — roll-call votes saved.`);
  return cached ? "skip" : "ok";
}

/** Download English RCV XML from doceo into data/RCV/. */
async function download(date, identifier, zipPath) {
  const doceoUrl = `https://www.europarl.europa.eu/doceo/document/${identifier}_EN.xml`;

  // the API's own distribution first (it is the final version when one exists)
  const published = await publishedXml(identifier);
  const body = await downloadPublished(published);
  if (body) {
    saveRcvXml(date, body);
    return true;
  }

  console.log(`📥 Downloading RCV XML via browser…`);
  try {
    const result = await getWaf().downloadViaBrowser(doceoUrl);
    if (
      result.status === 200 &&
      result.body.includes("<PV.RollCallVoteResults")
    ) {
      saveRcvXml(date, result.body);
    } else if (result.status === 202) {
      console.error(
        `   ❌ WAF challenge failed after retry — cannot download ${identifier}`
      );
      process.exit(1);
    } else {
      console.warn(
        `   ⚠️  HTTP ${result.status} — not valid RCV XML (${result.body.length} bytes)`
      );
      if (result.body.length < 500)
        console.warn(`      ${result.body.substring(0, 300)}`);
      return false;
    }
  } catch (e) {
    console.warn(`   ⚠️  ${e.message}`);
    return false;
  }
  return fs.existsSync(zipPath);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
