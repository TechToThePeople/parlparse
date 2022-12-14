"use strict";
const db = require("./lib/db.js");
const fs = require("fs");
const d3 = require("d3-dsv");
const log = require("./lib/log.js");

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

const writePositions = async (id) => {
  const positions = await db
    .select(
      "mep_vote as mepid",
      "name",
      "position as result",
      "meps.eugroup",
      "rollcall as identifier",
      "vote_id"
    )
    .from("positions")
    .leftJoin("meps", "meps.vote_id", "mep_vote")
    .where("rollcall", id);

  fs.writeFileSync("../9/cards/" + id + ".csv", d3.csvFormat(positions));
};

log.time("cards");
let written = 0;
db.select(db.raw("rollcalls.*,title,url"))
  .from("rollcalls")
  .leftJoin("reports", "rollcalls.ref", "reports.reference")
  .orderBy("rollcalls.id", "desc")
  .then(async (votes) => {
    for (const vote of votes) {
      const csv = "../9/cards/" + vote.id + ".csv";
      try {
        const exists = fs.existsSync(csv);
        if (exists && !date && !argv.force) {
          continue;
        }
        if (date && !argv.force) {
          const vdate = vote.date.toISOString().substring(0, 10);
          if (vdate !== date) continue;
        }
      } catch (err) {
        // nothing special to do, let's create the card that doesn't exist
      }
      written++;
      const dest = "../9/cards/" + vote.id + ".json";
      fs.writeFileSync(dest, JSON.stringify(vote));
      await writePositions(vote.id);
      //      mepid,mep,result,group,identifier
    }
    log.success(votes.length, "votes processed");
    if (votes.length !== written) log.info(written, "new votes");
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
