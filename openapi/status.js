#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/status.js — is there anything new to import?
 *
 * A plenary day publishes four documents, all plain entries in the Open Data API,
 * so their existence is a status code — no headless browser, no WAF challenge
 * (the browser is only needed to *download* the XML from doceo, which is the
 * fallback path anyway):
 *
 *   PV-10-<date>-RCV   VOTE_ROLLCALL_PLENARY   the roll-call results
 *   PV-10-<date>-ATT   LIST_ATTEND_PLENARY     the attendance list
 *   PV-10-<date>-VOT   VOTE_RESULTS_PLENARY    every vote, roll-call or not
 *   PV-10-<date>       MINUTES_PLENARY         the minutes (nothing imports them)
 *
 * The local column says what this database already holds, so the interesting
 * value is `new`: published, not imported yet — run update.sh.
 *
 * Usage:
 *   node openapi/status.js [--days N] [--date YYYY-MM-DD] [--json]
 */

const fs = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");
const minimist = require("minimist");
const db = require("../lib/db");

const API = "https://data.europarl.europa.eu/api/v2";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0 Safari/537.36";

const argv = minimist(process.argv.slice(2), {
  boolean: ["help", "json", "sync"],
  string: ["date"],
  alias: { h: "help", n: "days" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/status.js [options]

Says whether the RCV, ATT, VOT and MINUTES documents of the recent sittings are
published, and whether this database already has them.

  --days, -n N     how many recent sitting dates to look at (default 5)
  --date <d>       one date instead
  --json           machine-readable output
  --sync           import what is new, then rebuild the CSVs and cards
  --help, -h       this text
`);
  process.exit(0);
}

/** The four documents of a sitting, and what says we already have one. */
const DOCUMENTS = [
  { key: "RCV", suffix: "-RCV", local: "positions" },
  { key: "ATT", suffix: "-ATT", local: "attended" },
  { key: "VOT", suffix: "-VOT", local: "vot" },
  { key: "MIN", suffix: "", local: null }, // minutes: published, never imported
];

/** 200 = published, 404 = not yet, anything else = could not tell. */
async function published(date, suffix) {
  try {
    const res = await fetch(
      `${API}/documents/PV-10-${date}${suffix}?format=application/ld%2Bjson`,
      {
        headers: { Accept: "application/ld+json", "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (res.status === 200) return "published";
    if (res.status === 404) return "—";
    return `?${res.status}`;
  } catch {
    return "?net";
  }
}

/** What this database already holds for that date. */
async function local(date) {
  const plenary = await db("plenaries")
    .where("date", date)
    .first("id", "sitting_id");
  const rcv = plenary
    ? (
        await db("rollcalls")
          .where({ plenary: plenary.id, method: "RCV" })
          .count("* as n")
          .first()
      ).n
    : 0;
  const positions = plenary
    ? (
        await db.raw(
          `SELECT count(*) AS n FROM positions p
             JOIN rollcalls r ON r.id = p.rollcall
            WHERE r.plenary = ?`,
          [plenary.id]
        )
      )[0].n
    : 0;
  const attended = plenary?.sitting_id
    ? (
        await db("attendances")
          .where({ sitting_id: plenary.sitting_id, status: "attended" })
          .count("* as n")
          .first()
      ).n
    : 0;
  // openapi/vot-xml.js caches the VOT XML, which is what its import reads
  const vot = fs.existsSync(
    path.join(__dirname, "..", "data", "VOT", `${date}.xml`)
  );
  const planned = (
    await db("agenda_items")
      .where({ date, kind: "vote" })
      .count("* as n")
      .first()
  ).n;
  return { rcv, positions, attended, vot, planned };
}

/** ok = published and here, new = published not imported, pub = not imported ever. */
function statusOf(doc, published, have) {
  if (published !== "published") return published;
  if (!doc.local) return "pub";
  return have ? "ok" : "new";
}

/** The importers live in openapi/, the CSV/card builders at the repo root. */
function scriptPath(name) {
  const local = path.join(__dirname, name);
  return fs.existsSync(local) ? local : path.join(__dirname, "..", name);
}

/** Run one of the importers for a single date, output passed straight through. */
function run(script, args) {
  const result = spawnSync(process.execPath, [scriptPath(script), ...args], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  if (result.status !== 0)
    console.warn(`   ⚠️  ${script} exited with ${result.status}`);
  return result.status === 0;
}

/**
 * Import only what is missing: each new document with its own script, then the
 * derived files (CSVs, cards for those dates) once.
 */
async function sync(rows) {
  const dates = rows
    .filter((r) => Object.values(r.docs).includes("new"))
    .map((r) => r.date);
  if (!dates.length) {
    console.log("→ nothing published that is not here already");
    return;
  }
  console.log(`\n→ importing ${dates.length} sitting(s): ${dates.join(" ")}\n`);

  for (const [i, date] of dates.entries()) {
    const row = rows.find((r) => r.date === date);
    console.log(`\n[${i + 1}/${dates.length}] ${date}`);
    // decisions first: it creates the row of every vote taken that day (hand and
    // electronic ones included), which the XML importers then enrich
    run("decisions.js", ["-d", date]);
    if (row.docs.RCV === "new") run("rcv.js", [date]);
    if (row.docs.ATT === "new") run("att.js", [date]);
    if (row.docs.VOT === "new") run("vot-xml.js", [date]);
    // the agenda's "planned" votes become "voted" once the roll-calls are in
    run("agenda.js", ["--date", date]);
  }

  console.log("\n→ derived files");
  run("csv.js", []);
  for (const date of dates) run("cards.js", [`--date=${date}`]);
  spawnSync("npm", ["run", "-s", "majority:csv"], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  run("status.js", ["--days", String(rows.length)]);
  console.log("\nnext: sh prod.sh (publishes the CSVs to ../10/data)");
}

async function main() {
  let dates = [];
  if (argv.date) dates = [argv.date];
  else {
    const rows = await db.raw(
      `SELECT DISTINCT date FROM agenda_items ORDER BY date DESC LIMIT ?`,
      [Number(argv.days || 5)]
    );
    dates = rows.map((r) => r.date);
    const today = new Date().toISOString().slice(0, 10);
    for (const d of [
      today,
      new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    ])
      if (!dates.includes(d)) dates.push(d);
    dates.sort();
  }

  const out = [];
  for (const date of dates) {
    const mine = await local(date);
    const docs = {};
    for (const doc of DOCUMENTS) {
      const status = await published(date, doc.suffix);
      docs[doc.key] = statusOf(
        doc,
        status,
        doc.local ? mine[doc.local] : false
      );
    }
    out.push({ date, ...mine, docs });
  }

  if (argv.sync) {
    await sync(out);
    await db.destroy();
    return;
  }

  if (argv.json) {
    console.log(JSON.stringify(out, null, 1));
    await db.destroy();
    return;
  }

  const pad = (v, n) => String(v).padEnd(n);
  console.log(
    `${pad("date", 12)}${pad("RCV", 5)}${pad("ATT", 5)}${pad("VOT", 5)}${pad(
      "MIN",
      5
    )}local`
  );
  for (const r of out) {
    const local =
      r.rcv || r.positions || r.attended
        ? `${r.rcv} RCV, ${r.positions} positions, ${r.attended} attended`
        : r.planned
        ? `planned: ${r.planned} vote(s)`
        : "—";
    console.log(
      `${pad(r.date, 12)}${pad(r.docs.RCV, 5)}${pad(r.docs.ATT, 5)}${pad(
        r.docs.VOT,
        5
      )}${pad(r.docs.MIN, 5)}${local}`
    );
  }

  const pending = out.filter((r) => Object.values(r.docs).includes("new"));
  if (pending.length)
    console.log(
      `\n→ ${pending.length} sitting(s) with a document published but not imported: run ./update.sh`
    );
  else
    console.log(
      "\n→ nothing to import.   ok = published and here · pub = published (nothing " +
        "imports the minutes) · new = published, not imported · — = not published " +
        "· ?nnn = the API did not answer"
    );
  await db.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
