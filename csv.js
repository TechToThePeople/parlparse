#!/usr/bin/env node
//identifier,date,report,desc,title,for,against,abstention

const roll = require("./lib/rollcall.js");
const { init } = require("./lib/mep.js");
const db = require("./lib/db.js");
const fs = require("fs");
const { format } = require("@fast-csv/format");
const term = 10;
const types = require("pg").types;
types.setTypeParser(1184, (val) => val.slice(0, -3));
types.setTypeParser(1082, (val) => val);

const rollcall = () => {
  return new Promise(async (resolve, reject) => {
    const file = "./data/item_rollcall.csv";
    const head = "identifier,date,report,desc,title,for,against,abstention".split(
      ","
    );
    const writeStream = fs.createWriteStream(file);
    const csvStream = format({ headers: head });
    csvStream.pipe(writeStream).on("finish", () => {
      console.log("written", file);
      resolve();
      //    process.exit();
    });

    const rcv = await db
      .select(
        "id as identifier",
        "date",
        "for",
        "against",
        "abstention",
        "name as title",
        "ref as report"
      )
      .where("term", term)
      .from("rollcalls");
    console.log("rollcalls", rcv.length);
    rcv.forEach((r) => {
      csvStream.write(r);
    });
    //console.log(rcv);
    csvStream.end();

    //csvStream.pipe(process.stdout).on("end", () => process.exit());
  });
};

const mep = () => {
  return new Promise(async (resolve, reject) => {
    const file = "./data/meps.csv";
    const head = "epid,firstname,lastname,active,start,end,birthdate,country,gender,eugroup,party,email,twitter,term,voteid".split(
      ","
    );
    const writeStream = fs.createWriteStream(file);
    const csvStream = format({ headers: head });
    csvStream.pipe(writeStream).on("finish", () => {
      console.log("written", file);
      resolve();
      //    process.exit();
    });

    const data = await db
      .select(
        "ep_id as epid",
        "first_name as firstname",
        db.raw("coalesce(last_name,name) as lastname"),
        //        db.raw("1 as active"),
        "start",
        "end",
        "birthdate",
        "country",
        "term",
        db.raw("'' as gender"),
        "eugroup",
        "party",
        db.raw("'' as email"),
        db.raw("'' as twitter"),
        db.raw("10 as term10"),
        "vote_id as voteid"
      )
      .from("meps")
      .whereNotNull("ep_id")
      .orderBy("ep_id", "desc");
    data.forEach((r) => {
      csvStream.write(r);
    });
    //console.log(rcv);
    csvStream.end();

    //csvStream.pipe(process.stdout).on("end", () => process.exit());
  });
};

const textTabled = () => {
  return new Promise(async (resolve, reject) => {
    const file = "./data/text_tabled.csv";
    const head = "date,reference,type,title,rapporteur,committee,intra,oeil,doc".split(
      ","
    );
    const writeStream = fs.createWriteStream(file);
    const csvStream = format({ headers: head });
    csvStream.pipe(writeStream).on("finish", () => {
      console.log("written", file);
      resolve();
      //    process.exit();
    });

    const rcv = await db
      .select("date", "title", "reference", "committee", "url as oeil")
      .from("reports");
    rcv.forEach((r) => {
      csvStream.write(r);
    });
    //console.log(rcv);
    csvStream.end();

    //csvStream.pipe(process.stdout).on("end", () => process.exit());
  });
};

Promise.all([textTabled(), rollcall(), mep()]).then((values) => {
  console.log("done", values);
  process.exit();
});

/*
(async function() {
  const c = await textTabled ();
  const d = await rollcall ();
})();
*/
