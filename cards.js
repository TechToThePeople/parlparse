#!/usr/bin/env node
"use strict";
const db = require("./lib/db.js");
const fs = require("fs");
const d3 = require("d3-dsv");
const log = require("./lib/log.js");
const term = 10;

const _groupAlias = {
  //  PPE: "EPP",
  NI: "NA",
  //  "The Left": "GUE/NGL",
  "GUE/NGL": "The Left",
};

let argv = require("minimist")(process.argv.slice(2), {
  alias: { h: "help", f: "force", d: "date" },
});
let date = null;

const help = (error = false) => {
  console.log(argv);
  error && console.error("parameter missing");
  console.log(
    "--force -f : retry download even if already downloaded and parse it anyway (by default, skip)",
    "\n--date=2020-04-09 -d=2020-04-09 : process a single day"
  );
  process.exit(error);
};

if (argv.help) {
  help();
}
if (argv.date) {
  if (argv.date <= 0) {
    const t = new Date(new Date().valueOf() + 1000 * 3600 * 24 * argv.date);
    date = t.toISOString().substring(0, 10);
  } else {
    date = argv.date;
  }
  const d = date.split("-");
  if (d.length !== 3) {
    log.error("can't parse the date", date);
    process.exit(1);
  }
  console.log("processing only " + date);
}

const writePositions = async (id, date) => {
  const positions = await db
    .select(
      "mep_vote as mepid",
      //      "name",
      "position as result",
      "eugroup",
      "rollcall as identifier"
    )
    .from("positions")
    //  .leftJoin("meps", "meps.ep_id", "mep_id")
    .where("rollcall", id);

  const _positions = new Set(positions.map((d) => d.mepid));
  const attendances = await db("attendances")
    .select("mep_id", "attendances.status", "eugroup")
    .join("plenaries", "plenaries.sitting_id", "attendances.sitting_id")
    .leftJoin("meps", "meps.ep_id", "mep_id")
    .where("plenaries.date", date);

  attendances.forEach((a) => {
    if (!_positions.has(a.mep_id)) {
      positions.push({
        mepid: a.mep_id,
        result: a.status,
        eugroup: a.eugroup,
        identifier: id,
      });
    }
  });

  fs.writeFileSync(
    "../" + term + "/cards/" + id + ".csv",
    d3.csvFormat(positions)
  );
};

log.time("cards");
let written = 0;
let refreshed = 0;
// the text the vote was about (a split part, or the report summary for a vote on
// the whole text): one query, then attached by rollcall id
db("rollcall_texts")
  .then((rows) => new Map(rows.map((r) => [r.rollcall, r])))
  .then((texts) =>
    db
      .select(db.raw("rollcalls.*,title,url"))
      .from("rollcalls")
      .leftJoin("reports", "rollcalls.ref", "reports.reference")
      .orderBy("rollcalls.id", "desc")
      .where("rollcalls.term", term)
      .then((votes) => ({ votes, texts }))
  )
  .then(async ({ votes, texts }) => {
    for (const vote of votes) {
      const voted = texts.get(vote.id);
      if (voted) {
        vote.section = voted.section;
        vote.part = voted.part;
        vote.part_text = voted.text;
        vote.part_kind = voted.kind;
        vote.part_source = voted.source;
      }
      const csv = "../" + term + "/cards/" + vote.id + ".csv";
      const vdate = vote.date.substring(0, 10);
      console.log(vdate);
      try {
        if (date && !argv.force && vdate !== date) continue;
        // existing card: refresh the metadata json only, the csv is expensive
        if (fs.existsSync(csv) && !argv.force) {
          fs.writeFileSync(
            "../" + term + "/cards/" + vote.id + ".json",
            JSON.stringify(vote)
          );
          refreshed++;
          continue;
        }
      } catch {
        // nothing special to do, let's create the card that doesn't exist
      }
      written++;
      const dest = "../" + term + "/cards/" + vote.id + ".json";
      fs.writeFileSync(dest, JSON.stringify(vote));
      // the per-MEP csv only changes when positions change; rewriting the json
      // keeps name/ref/committee/outcome/requested_by fresh for existing cards
      if (fs.existsSync(csv) && !argv.force) continue;
      // only roll-call votes have individual positions; a hand/electronic/secret
      // vote would just produce an empty csv, so don't write one at all
      if (vote.method && vote.method !== "RCV") continue;
      await writePositions(vote.id, vdate);
      //      mepid,mep,result,group,identifier
    }
    log.success(votes.length, "votes processed");
    if (refreshed) log.info(refreshed, "card metadata refreshed");
    if (votes.length !== written + refreshed) log.info(written, "new votes");
    log.timeEnd("cards");
    process.exit(1);
  });
/*
  {
    id: 109161,
    date: '2019-10-24 12:16:55',
    description: null,
    for: 511,
    against: 64,
    abstention: 66,
    plenary: 419,
    name: ' -  Younous Omarjee - Vote unique',
    ref: 'A9-0020/2019',
    created_by: null,
    updated_by: null
  },

 *
 *
{"id":102194,
"date":"2019-03-12 12:41:08",
"report":"A8-0092/2019",
"name":"CHANGE ME",
"rapporteur":"RAPPORTEUR",
"desc":"Branislav Škripek - Vote unique",
"for":594,"against":75,"abstention":2}

*/
