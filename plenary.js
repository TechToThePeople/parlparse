/*
date,code,status,reference,name,baseurl,extensions
019-04-18,RCV,final,P8_PV(2019)04-18(RCV),"Procès-verbal- Votes par appel nominal - Jeudi, 18 avril 2019",http://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2019/04-18/liste_presence/P8_PV(2019)04-18(RCV)_XC,pdf|xml|docx
*/

//https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/yyyy/mm-dd/liste_presence/Pl_PV(yyyy)mm-dd(RCV)_XC.xml

const https = require("https");
const downloadFile = require("./lib/download.js");
const roll = require("./lib/rollcall.js");
const { init } = require("./lib/mep.js");
const db = require("./lib/db.js");
const log = require("./lib/log.js");
const { format } = require("@fast-csv/format");

const head = "date,code,status,reference,name,baseurl,extensions".split(",");
const csvStream = format({ headers: head });

let date = null;
let initialised = false;
let argv = require("minimist")(process.argv.slice(2), {
  alias: { h: "help", a: "all", f: "force", d: "date" },
});
const help = (error = false) => {
  error && log.fatal("parameter missing");
  log.info(
    "\n--all -a : process all days or:",
    "\n--date=2020-04-09 -d=2020-04-09 : process a single day (today by default if no date)",
    "\n--force -f : retry download even if already downloaded and parse it anyway (by default, skip)"
  );
  process.exit(error);
};

if (argv.help) {
  help();
}

if (argv.all) {
  console.log("process all days");
  const start = new Date("2019-07-02"); //start of the 9th term

  const end = argv.date ? new Date(argv.date) : new Date(); // ends today or at the day param

  all(start, end).then(() => {
    console.info("Execution time: %dms", new Date() - start);
    process.exit(1);
  });
} else {
  !argv.date && help(true);
  argv.date === true
    ? (date = new Date().toISOString().substring(0, 10))
    : (date = argv.date);
  const d = date.split("-");
  if (d.length !== 3) {
    console.error("can't parse the date " + date);
    process.exit(1);
  }
  const start = new Date();

  run(date).then(() => {
    log.timeEnd();
    console.info("Execution time: %dms", new Date() - start);
    process.exit(1);
  });
}

async function all(start, end) {
  let date = end;
  console.log(date, start, end);
  while (date >= start) {
    await run(date.toISOString().substring(0, 10));
    date.setDate(date.getDate() - 1);
  }

  console.log("finished");
}

async function run(date) {
  if (!initialised) {
    initialised = await init();
  }
  const d = date.split("-");
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
    plenary = await downloadFile("RCV", url, {
      file: date,
      force: argv.force === "download",
    });
  } catch (e) {
    if (e.statusCode && e.statusCode === 404) {
      console.log("no plenary with rollcalls published on " + date);
      return;
    }
    console.log(e);
    return;
  }

  await init();
  plenary.status = "provisional";
  let r = await db("plenaries").insert(plenary).onConflict("date").ignore();
  if (r[0] === 0) {
    if (!argv.force) {
      console.log(
        "plenary on " +
          date +
          "->skip because already processed. Add --force to process anyway"
      );
      return;
    }
    r = await db("plenaries").select("id").where({ date: plenary.date });
    plenary.id = r[0].id;
  } else {
    plenary.id = r[0];
  }

  await roll(plenary);
  //  db.destroy();
}
