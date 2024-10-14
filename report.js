#!/usr/bin/env node
/*
date,code,status,reference,name,baseurl,extensions
019-04-18,RCV,final,P8_PV(2019)04-18(RCV),"Procès-verbal- Votes par appel nominal - Jeudi, 18 avril 2019",http://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2019/04-18/liste_presence/P8_PV(2019)04-18(RCV)_XC,pdf|xml|docx
*/

//https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/yyyy/mm-dd/liste_presence/Pl_PV(yyyy)mm-dd(RCV)_XC.xml

const https = require("https");
const report = require("./lib/report.js");
const db = require("./lib/db.js");
const log = require("./lib/log.js");

log.time("report");
let ref = "";
if (process.argv[2]) {
  ref = process.argv[2];
} else {
  log.info("processing all reports");
}

(async function run() {
  //  await init();
  if (!ref) {
    r = await report.fromRoll();
  } else {
    r = await report.process(ref);
  }
  log.timeEnd("report");
  process.exit(1);
  //  db.destroy();
})();
