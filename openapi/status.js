#!/usr/bin/env node
/* eslint-env node */
/**
 * openapi/status.js — is there anything new to import?
 *
 * The quick question after a sitting: has the roll-call XML been published, and
 * the attendance list? Both are documents in the Open Data API, so a plain
 * `GET /documents/PV-10-<date>-RCV` answers 200 or 404 — no headless browser, no
 * WAF challenge, two cheap requests per date.
 *
 * It also says whether the local database already carries them, so the answer is
 * actionable: "published but not imported" means run update.sh.
 *
 *   date        RCV            ATT            local
 *   2026-11-12  published      published      95 RCV, 594 attended
 *   2026-11-24  —              —              planned 24 Nov: 9 votes
 *
 * Usage:
 *   node openapi/status.js [--days N] [--date YYYY-MM-DD]
 */

const minimist = require("minimist");
const db = require("../lib/db");

const API = "https://data.europarl.europa.eu/api/v2";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0 Safari/537.36";

const argv = minimist(process.argv.slice(2), {
  boolean: ["help", "json"],
  string: ["date"],
  alias: { h: "help", n: "days" },
});

if (argv.help) {
  console.log(`
Usage: node openapi/status.js [options]

Says whether the roll-call XML and the attendance list of the recent sittings are
published by the API, and whether this database already has them.

  --days, -n N     how many recent sitting dates to look at (default 5)
  --date <d>       one date instead
  --json           machine-readable output
  --help, -h       this text
`);
  process.exit(0);
}

/** 200 = published, 404 = not yet, anything else = could not tell. */
async function published(date, kind) {
  try {
    const res = await fetch(
      `${API}/documents/PV-10-${date}-${kind}?format=application/ld%2Bjson`,
      {
        headers: { Accept: "application/ld+json", "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (res.status === 200) return "published";
    if (res.status === 404) return "—";
    return `? ${res.status}`;
  } catch {
    return "? net";
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
  const planned = (
    await db("agenda_items")
      .where({ date, kind: "vote" })
      .count("* as n")
      .first()
  ).n;
  return { rcv, positions, attended, planned };
}

async function main() {
  let dates = [];
  if (argv.date) dates = [argv.date];
  else {
    const rows = await db.raw(
      `SELECT DISTINCT date FROM agenda_items ORDER BY date DESC LIMIT ?`,
      [Number(argv.days || 5)]
    );
    dates = rows.map((r) => r.date).sort();
    // the two days a run normally cares about, in case the agenda is empty
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
    // the document status and the local counts must not share a key: `local()`
    // returns its own `rcv`
    const rcvDoc = await published(date, "RCV");
    const attDoc = await published(date, "ATT");
    out.push({ date, rcvDoc, attDoc, ...(await local(date)) });
  }

  if (argv.json) {
    console.log(JSON.stringify(out, null, 1));
    await db.destroy();
    return;
  }

  const pad = (v, n) => String(v).padEnd(n);
  console.log(`${pad("date", 12)}${pad("RCV", 12)}${pad("ATT", 12)}local`);
  for (const r of out) {
    const local =
      r.rcv || r.positions || r.attended
        ? `${r.rcv} RCV, ${r.positions} positions, ${r.attended} attended`
        : r.planned
        ? `planned: ${r.planned} vote(s)`
        : "—";
    console.log(
      `${pad(r.date, 12)}${pad(r.rcvDoc, 12)}${pad(r.attDoc, 12)}${local}`
    );
  }
  const pending = out.filter(
    (r) =>
      (r.rcvDoc === "published" && !r.positions) ||
      (r.attDoc === "published" && !r.attended)
  );
  if (pending.length)
    console.log(
      `\n→ ${pending.length} sitting(s) published but not imported: run ./update.sh`
    );
  await db.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
