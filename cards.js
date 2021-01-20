"use strict";
const db = require("./lib/db.js");
const fs = require("fs");
const d3 = require("d3-dsv");

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

const writePositions = async (id) => {
  const positions = await db
    .select(
      "mep_vote as mepid",
      "name",
      "position as result",
      "eugroup",
      "rollcall as identifier",
      "vote_id"
    )
    .from("positions")
    .leftJoin("meps", "meps.vote_id", "mep_vote")
    .where("rollcall", id);

  fs.writeFileSync("../9/cards/" + id + ".csv", d3.csvFormat(positions));
};

db.select(db.raw("rollcalls.*,title,url"))
  .from("rollcalls")
  .leftJoin("reports", "rollcalls.ref", "reports.reference")
  .orderBy("rollcalls.id", "desc")
  .then(async (votes) => {
    for (const vote of votes) {
      try {
        fs.accessSync(
          "../9/cards/" + vote.id + ".csv",
          fs.constants.R_OK | fs.constants.W_OK
        );
        if (!argv.force) {
          continue;
        }
      } catch (err) {
        // nothing special to do, let's create the card that doesn't exist
      }

      fs.writeFileSync("../9/cards/" + vote.id + ".json", JSON.stringify(vote));
      await writePositions(vote.id);
      //      mepid,mep,result,group,identifier
    }
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
