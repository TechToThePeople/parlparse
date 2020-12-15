/*
date,code,status,reference,name,baseurl,extensions
019-04-18,RCV,final,P8_PV(2019)04-18(RCV),"Procès-verbal- Votes par appel nominal - Jeudi, 18 avril 2019",http://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2019/04-18/liste_presence/P8_PV(2019)04-18(RCV)_XC,pdf|xml|docx
*/

//https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/yyyy/mm-dd/liste_presence/Pl_PV(yyyy)mm-dd(RCV)_XC.xml

const https = require("https");
const fs = require("fs");
const downloadFile = require("./lib/download.js");

const { format } = require("@fast-csv/format");

const head = "date,code,status,reference,name,baseurl,extensions".split(",");
const csvStream = format({ headers: head });

let writeStream = fs.createWriteStream('./data/rollcall.csv');
//csvStream.pipe(process.stdout).on("end", () => process.exit());
csvStream.pipe(writeStream).on("end", () => process.exit());

//download (()=>(console.log('done')));

const name = "P9_PV(2020)11-13(RCV)_XC";
const date = "2020-11-13";
downloadFile(
  "RCV",
  "https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2020/11-13/liste_presence/" +
    name,
  "xml"
).then(() => {
//2019-04-18,RCV,final,P8_PV(2019)04-18(RCV),"Procès-verbal- Votes par appel nominal - Jeudi, 18 avril 2019",http://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2019/04-18/liste_presence/P8_PV(2019)04-18(RCV)_XC,pdf|xml|docx
  csvStream.write({
    date: date,
    code: 'RCV',
    status: "temp",
    reference: name,
    name:'Roll call',
    baseurl:
      "https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2020/11-13/liste_presence/" +
      name,
    extensions: "xml",
  });
});

console.log("finished");
