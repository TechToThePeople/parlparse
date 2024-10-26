// find data/RCV -exec zgrep -l 'Intentions' {} \; | sed -En "s/data\/RCV\/(.*).xml.zip/\1/p" | xargs -I{} node plenary.js -d {} --correction-only

"use strict";
const db = require("./lib/db.js");
const fs = require("fs");
const d3 = require("d3-dsv");
const log = require("./lib/log.js");
const term = 10;
let argv = require("minimist")(process.argv.slice(2), {
  alias: { h: "help", f: "force" },
});

const help = (error = false) => {
  console.log(argv);
  error && console.error("parameter missing");
  console.log(
    "--force -f : retry download even if already downloaded and parse it anyway (by default, skip)"
  );
  process.exit(error);
};

if (argv.help) {
  help();
}

const writeCorrection = async (id) => {
  const fileName = (id) => "../" + term + "/cards/correction." + id + ".csv";

  const positions = await db
    .select(
      "mep_vote as mepid",
      db.raw("lower(correction) as intent"),
      "position as result",
      "rollcall as identifier"
    )
    .from("positions")
    .whereNotNull("correction")
    .where("rollcall", id);

  fs.writeFileSync(fileName(id), d3.csvFormat(positions));
};

log.time("cards");
let written = 0;
db.select("rollcall as id")
  .from("positions")
  .whereNotNull("correction")
  .groupBy("id")
  .then(async (votes) => {
    for (const vote of votes) {
      try {
        const exists = fs.existsSync(fileName(vote.id));
        if (exists && !argv.force) {
          continue;
        }
      } catch (err) {
        // nothing special to do, let's create the card that doesn't exist
      }
      written++;
      await writeCorrection(vote.id);
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
