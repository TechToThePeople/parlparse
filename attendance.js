/*
date,code,status,reference,name,baseurl,extensions
*/

//https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2020/12-18/liste_presence/P9_PV(2020)12-18(LP)_FR.xml

const https = require("https");
const downloadFile = require("./lib/download.js");
const roll = require("./lib/rollcall.js");
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
  const start = new Date("2019-07-02"); //start of the 9th term

  const end = new Date(argv.date); // ends today or at the day param

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

  const name = "P9_PV(" + d[0] + ")" + d[1] + "-" + d[2] + "(LP)_FR";

  //https://www.europarl.europa.eu/RegData/seance_pleniere/proces_verbal/2020/12-18/liste_presence/P9_PV(2020)12-18(LP)_FR.xml
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
    plenary = await downloadFile("LP", url, date);
  } catch (e) {
    console.log("error", e);
    return;
  }

  console.log(plenary);
  process.exit(1);
  await init();

  //  await attendance(plenary);
  //  db.destroy();
}
