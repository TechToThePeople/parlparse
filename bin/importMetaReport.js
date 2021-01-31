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
  parsed.forEach(async (rollcall) => {
    console.log(rollcall);
    if (!rollcall.identifier) {
      log.fatal("no identifier", rollcall);
    }
    try {
      const r = await db("rollcalls")
        .where("id", rollcall.identifier)
        .update("green_remark", rollcall.remarks);
    } catch (e) {
      console.log(e);
    }
  });
};

const file = argv._[0];
log.time("import");
processing(file);
log.timeEnd();
