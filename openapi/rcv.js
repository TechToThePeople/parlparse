#!/usr/bin/env node
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
const zlib = require("zlib");
const {
  fetchDocumentList,
  extractDateFromId,
  parseArgs,
  printUsage,
  getWaf,
} = require("./lib");

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

  // Check if already downloaded
  if (!force && fs.existsSync(zipPath)) {
    console.log(`   ⏭️  Already downloaded (use --force to re-download)`);
    return "skip";
  }

  // Download English RCV XML from doceo
  const doceoUrl = `https://www.europarl.europa.eu/doceo/document/${identifier}_EN.xml`;

  console.log(`📥 Downloading RCV XML via browser…`);
  try {
    const result = await getWaf().downloadViaBrowser(doceoUrl);
    if (
      result.status === 200 &&
      result.body.includes("<PV.RollCallVoteResults")
    ) {
      fs.mkdirSync(rcvDir, { recursive: true });
      const compressed = zlib.gzipSync(result.body, { level: 9 });
      fs.writeFileSync(zipPath, compressed);
      console.log(
        `   ✓ saved ${zipPath} (${result.body.length} → ${compressed.length} bytes)`
      );
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
      return "skip";
    }
  } catch (e) {
    console.warn(`   ⚠️  ${e.message}`);
    return "skip";
  }

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
  return "ok";
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
