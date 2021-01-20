"use strict";
const db = require("./lib/db.js");
const fs = require("fs");
const d3 = require("d3-dsv");

db.select("*")
  .from("rollcalls")
  .orderBy("id", "desc")
  .then(async (votes) => {
    for (const vote of votes) {
      console.log("processing ", vote.id);
      fs.writeFileSync("../9/cards/" + vote.id + ".json", JSON.stringify(vote));
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
        .where("rollcall", vote.id);
      fs.writeFileSync(
        "../9/cards/" + vote.id + ".csv",
        d3.csvFormat(positions)
      );

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
