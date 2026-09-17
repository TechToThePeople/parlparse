#!/usr/bin/env node
/**
 * openapi/att.js — Fetch attendance list documents and download English XML.
 *
 * Saves:
 *   data/openapi/att/{identifier}.json     — metadata + file URLs
 *   data/ATT/{date}.xml.zip                — gzip-compressed English XML
 *
 * Usage:
 *   node openapi/att.js 2024-07-16
 *   node openapi/att.js PV-10-2024-07-16-ATT
 *   node openapi/att.js --date=2024-07-16
 */

const {
  fetchDocumentList,
  extractDateFromId,
  parseArgs,
  printUsage,
  getWaf,
} = require("./lib");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const WORK_TYPE = "LIST_ATTEND_PLENARY";

async function main() {
  const { help, input, force, all } = parseArgs();

  if (help) {
    printUsage(process.argv[1], "attendance list documents");
    process.exit(0);
  }

  let dates;
  if (all) {
    console.log("📋 Fetching all attendance document dates…");
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
    printUsage(process.argv[1], "attendance list documents");
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

    // Rate-limit: 1.5s between dates, but only after actual downloads (skip is instant)
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
    console.log(`\n✅ Done — attendance list already cached.`);
  }
}

/**
 * Process a single attendance date.
 * @returns {'ok' | 'skip' | 'done'}
 */
async function processDate(date, force) {
  // Construct identifier directly — pattern is always PV-10-YYYY-MM-DD-ATT
  const identifier = `PV-10-${date}-ATT`;
  const resolved = {
    identifier,
    date,
    label: `P10_PV(${date.replace(/-/g, "")})(ATT)`,
  };

  // Output path
  const attDir = path.resolve(__dirname, "..", "data", "ATT");
  const zipPath = path.join(attDir, `${resolved.date}.xml.zip`);

  // Check if already downloaded
  if (!force && fs.existsSync(zipPath)) {
    console.log(`   ⏭️  Already downloaded (use --force to re-download)`);
    return "skip";
  }

  // 3. Download English XML from doceo and save gzip-compressed to data/ATT/
  const doceoUrl = `https://www.europarl.europa.eu/doceo/document/${resolved.identifier}_EN.xml`;

  console.log(`📥 Downloading English XML via browser…`);
  try {
    const result = await getWaf().downloadViaBrowser(doceoUrl);
    if (
      result.status === 200 &&
      result.body.includes("<PV.AttendanceRegister")
    ) {
      fs.mkdirSync(attDir, { recursive: true });
      const compressed = zlib.gzipSync(result.body, { level: 9 });
      fs.writeFileSync(zipPath, compressed);
      console.log(
        `   ✓ saved ${zipPath} (${result.body.length} → ${compressed.length} bytes)`
      );
    } else if (result.status === 202) {
      console.error(
        `   ❌ WAF challenge failed after retry — cannot download ${resolved.identifier}`
      );
      process.exit(1);
    } else {
      console.warn(
        `   ⚠️  HTTP ${result.status} — not valid attendance XML (${result.body.length} bytes)`
      );
      if (result.body.length < 500)
        console.warn(`      ${result.body.substring(0, 300)}`);
    }
  } catch (e) {
    console.warn(`   ⚠️  ${e.message}`);
  }

  // 6. Parse the downloaded XML and insert into attendances table
  if (fs.existsSync(zipPath)) {
    console.log(`📊 Processing attendance into database…`);
    try {
      const processAttendance = require("../lib/attendance");
      const result = await processAttendance(
        { date: resolved.date },
        { folder: "./data/ATT/", force }
      );
      if (result) {
        console.log(
          `   → ${result.participant} participants, ${result.excused} excused`
        );
      }
    } catch (e) {
      const msg = (e && e.message) || String(e || "unknown error");
      if (!msg.includes("sitting without RCVs")) {
        console.warn(`   ⚠️  DB insert skipped: ${msg}`);
      }
    }
  }

  console.log(`\n✅ Done — attendance list saved.`);
  return "ok";
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
