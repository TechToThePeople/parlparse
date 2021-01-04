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

const head = "date,code,status,reference,name,baseurl,extensions".split(",");
const csvStream = format({ headers: head });

let writeStream = fs.createWriteStream("./data/rollcall.csv");
//csvStream.pipe(process.stdout).on("end", () => process.exit());
csvStream.pipe(writeStream).on("end", () => process.exit());

//download (()=>(console.log('done')));

let date = null;
if (process.argv[2]) date = process.argv[2];
else date = new Date().toISOString().substring(0, 10);
const d = date.split("-");
if (d.length !== 3) {
  console.error("can't parse the date " + date);
  process.exit(1);
}
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

(async function run() {
  let plenary = null;

  try {
    plenary = await downloadFile("RCV", url, date);
  } catch (e) {
    console.log("error", e);
    return;
  }

  await init();
  const start = new Date();
  plenary.status = "provisional";
  let r = await db("plenaries").insert(plenary).onConflict("date").ignore();

  if (r[0] === 0) {
    r = await db("plenaries").select("id").where({ date: plenary.date });
    plenary.id = r[0].id;
  } else {
    plenary.id = r[0];
  }

  await roll(plenary);
  console.info("Execution time: %dms", new Date() - start);
  //  db.destroy();
  csvStream.write({
    date: date,
    code: "RCV",
    status: "temp",
    reference: name,
    name: "Roll call",
    baseurl: url,
    extensions: "xml",
  });
})();

console.log("finished");
