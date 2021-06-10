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
  alias: { h: "help", a: "all", u: "update", f: "force", d: "date" },
});

const main = (argv) => {
  const help = (error = false) => {
    error && log.fatal("parameter missing");
    log.info(
      "\n--all -a : process all days or:",
      "\n--date=2020-04-09 -d=2020-04-09 : process a single day (today by default if no date)",
      "\n--date=-1 -d=-1 : process yesterday (n days before)",
      "\n--update -u : retry download even if already downloaded and parse it if different",
      "\n--force -f : parse again (by default, skip)"
    );
    process.exit(error);
  };

  if (argv.help) {
    help();
  }

  log.time("plenary");

  if (argv.all) {
    const start = new Date("2019-07-02"); //start of the 9th term

    const end = argv.date ? new Date(argv.date) : new Date(); // ends today or at the day param

    log.note("process all days: ", start, end);

    all(start, end).then(() => {
      log.timeEnd("plenary");
      process.exit(1);
    });
  } else {
    !argv.date && help(true);
    argv.date === true
      ? (date = new Date().toISOString().substring(0, 10)) // today
      : (date = argv.date);
    if (argv.date <= 0) {
      const t = new Date(new Date().valueOf() + 1000 * 3600 * 24 * argv.date);
      date = t.toISOString().substring(0, 10);
    }
    const d = date.split("-");
    if (d.length !== 3) {
      log.error("can't parse the date", date);
      process.exit(1);
    }
    const start = new Date();

    run(date).then(() => {
      log.timeEnd("plenary");
      process.exit(1);
    });
  }
};

async function all(start, end) {
  let date = end;
  while (date >= start) {
    await run(date.toISOString().substring(0, 10));
    date.setDate(date.getDate() - 1);
  }

  log.success("finished");
}

async function run(date) {
  if (!initialised) {
    initialised = await init();
  }
  const d = date.split("-");
  let plenary = null;

  const name = "P9_PV(" + d[0] + ")" + d[1] + "-" + d[2] + "(RCV)_XC";
  /*  const oldurl =
    "https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/" +
    d[0] +
    "/" +
    d[1] +
    "-" +
    d[2] +
    "/liste_presence/" +
    name;
*/
  const url =
    "https://www.europarl.europa.eu/doceo/document/PV-9-" + date + "-RCV_FR";

  try {
    if (argv.update) log.await("downloading", url + ".xml");
    plenary = await downloadFile("RCV", url, {
      file: date,
      force: argv.update,
    });
    if (!plenary.fresh) {
      log.info("./data/RCV/" + date + ".xml.zip already processed");
      if (!argv.force) return;
    } else {
      log.info("processing", url, ".xml");
    }
  } catch (e) {
    if (e.statusCode && e.statusCode === 404) {
      log.warn("no plenary with rollcalls published on " + date);
      return;
    }
    console.log(e);
    return;
  }

  await init();
  plenary.status = "provisional";
  delete plenary.fresh;
  let r = await db("plenaries").insert(plenary).onConflict("date").ignore();
  if (r[0] === 0) {
    if (!argv.force) {
      log.info(
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

  const processed = await roll(plenary, argv.force);
  log.success(processed.votes, "votes processed");
  if (processed.added !== processed.votes)
    log.info(processed.added, "new votes");
  //  db.destroy();
  return processed.added;
}

if (require.main === module) {
  main(argv);
} else {
  module.exports = run;
}
