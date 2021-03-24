"use strict";
const log = require("../lib/log.js");
const db = require("../lib/db.js");
const XLSX = require("xlsx");

let argv = require("minimist")(process.argv.slice(2), {
  alias: { h: "help" },
});

console.log(argv);

const help = (error = false) => {
  error && log.fatal("parameter missing");
  log.info("$bin/importMeta.js file.xsls");
  //    "\n--force -f : retry download even if already downloaded and parse it anyway (by default, skip)"
  process.exit(error);
};

if (argv.help) {
  help();
}

if (argv._.length !== 1) {
  help(true);
}

const processing = async (file) => {
  const workbook = XLSX.readFile(file);
  let parsed = XLSX.utils.sheet_to_json(
    workbook.Sheets[workbook.SheetNames[0]],
    { FS: "***", strip: true }
  );
  return new Promise(async (resolve, reject) => {
    parsed.forEach(async (d) => {
      if (!d.report) {
        log.fatal("no identifier", d);
        process.exit(1);
      }
      //      if (!d.topic) return;
      try {
        log.info("processing", d);
        //    { report: 'A9-0174/2020', committee: 'EMPL', topic: 'EU FUNDS' }
        const r = await db("reports")
          .where("reference", d.report)
          .update({ topic: d.topic, committee: d.committee });
        log.info("updated", r);
      } catch (e) {
        log.error(d, e);
      }
    });
    resolve({ total: parsed.length });
  });
};

const file = argv._[0];
log.time("import");
processing(file).then((d) => {
  log.info("processed", d);
  log.timeEnd();
  process.exit(0);
});
