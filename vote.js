#!/usr/bin/env node
/*
date,code,status,reference,name,baseurl,extensions
*/

//https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2020/12-18/liste_presence/P9_PV(2020)12-18(LP)_FR.xml

const https = require("https");
const downloadFile = require("./lib/download.js");
const vote = require("./lib/vote.js");
const { init } = require("./lib/mep.js");
const db = require("./lib/db.js");

let date = null;
let initialised = false;
let argv = require("minimist")(process.argv.slice(2), {
  alias: { h: "help", a: "all", f: "force", d: "date" },
});
const help = (error = false) => {
  console.log(argv);
  error && console.error("parameter missing");
  console.log("--all -a : process all days or:");
  console.log(
    "--date=2020-04-09 -d=2020-04-09 : process a single day (today by default if no date)"
  );
  console.log(
    "--force -d : retry download even if already downloaded and parse it anyway (by default, skip)"
  );
  process.exit(error);
};

if (argv.help) {
  help();
}

if (argv.all) {
  console.log("process all days");
  const start = new Date("2024-07-16"); //start of the 10th term

  const end = argv.date ? new Date(argv.date) : new Date(); // ends today or at the day param
  (async () => {
    await all(start, end);
    console.info("Execution time: %dms", new Date() - start);
    process.exit(0);
  })();
} else {
  date = argv.date || new Date().toISOString().substring(0, 10);
  const d = date.split("-");
  if (d.length !== 3) {
    console.error("can't parse the date " + date);
    process.exit(1);
  }
  const start = new Date();

  run(date).then(() => {
    console.info("Execution time: %dms", new Date() - start);
    process.exit(1);
  });
}

async function all(start, end) {
  let date = end;
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

  const name = "PV-10-" + d[0] + "-" + d[1] + "-" + d[2] + "-ATT_EN";

  //https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2020/12-18/liste_presence/P9_PV(2020)12-18(LP)_FR.xml
  //https://www.europarl.europa.eu/doceo/document/PV-10-2024-10-21-ATT_EN.xml
  const url = "https://www.europarl.europa.eu/doceo/document/" + name;
  console.log(url);
  try {
    plenary = await downloadFile("LP", url, { file: date, force: argv.force });
  } catch (e) {
    console.log("no plenary on", date);
    return;
  }

  await init();
  try {
    const processed = await vote(plenary, {
      force: argv.force,
    });
    console.log("processed", processed);
  } catch (e) {
    console.log(e);
  }
  //  db.destroy();
}
