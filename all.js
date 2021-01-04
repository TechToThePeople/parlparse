/*
date,code,status,reference,name,baseurl,extensions
019-04-18,RCV,final,P8_PV(2019)04-18(RCV),"Procès-verbal- Votes par appel nominal - Jeudi, 18 avril 2019",http://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2019/04-18/liste_presence/P8_PV(2019)04-18(RCV)_XC,pdf|xml|docx
*/

//https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/yyyy/mm-dd/liste_presence/Pl_PV(yyyy)mm-dd(RCV)_XC.xml

const https = require("https");
const fs = require("fs");
const downloadFile = require("./lib/download.js");
const roll = require("./lib/rollcall.js");
const { init } = require("./lib/mep.js");
const db = require("./lib/db.js");

const { format } = require("@fast-csv/format");

const start = new Date("2019-07-02"); //start of the 9th term

const end = new Date();

let date = end;

(async function all() {
  await init();
  while (date >= start) {
    //else date = new Date().toISOString().substring(0, 10);
    const d = date.toISOString().substring(0, 10).split("-");
    if (d.length !== 3) {
      console.error("can't parse the date " + date);
      process.exit(1);
    }
    //    console.log("processing ", date.toISOString().substring(0, 10));

    await run(d);
    date.setDate(date.getDate() - 1);
  }

  console.log("finished");
})();

async function run(d) {
  let plenary = null;

  const name = "P9_PV(" + d[0] + ")" + d[1] + "-" + d[2] + "(RCV)_XC";
  const url =
    "https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/" +
    d[0] +
    "/" +
    d[1] +
    "-" +
    d[2] +
    "/liste_presence/" +
    name;
  try {
    plenary = await downloadFile("RCV", url, d[0] + "-" + d[1] + "-" + d[2]);
  } catch (e) {
    console.log(d.join("-") + "-> not a plenary, skip " + url + ".xml");
    //    console.log("error", e);
    return;
  }

  plenary.status = "provisional";
  let r = await db("plenaries").insert(plenary).onConflict("date").ignore();

  if (r[0] === 0) {
    console.log("-> already processed", plenary.date);
    return;
    //    r = await db("plenaries").select("id").where({ date: plenary.date });
    //    plenary.id = r[0].id;
  } else {
    plenary.id = r[0];
  }

  await roll(plenary);
  //  db.destroy();
}
