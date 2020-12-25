//identifier,date,report,desc,title,for,against,abstention

const roll = require("./lib/rollcall.js");
const { init } = require("./lib/mep.js");
const db = require("./lib/db.js");
const fs = require("fs");
const { format } = require("@fast-csv/format");

const file = "./data/item_rollcall.csv";
const head = "identifier,date,report,desc,title,for,against,abstention".split(
  ","
);
const writeStream = fs.createWriteStream(file);
const csvStream = format({ headers: head });
csvStream.pipe(writeStream).on("finish", () => {
  console.log("fini");
  process.exit();
});

(async function () {
  const rcv = await db
    .select(
      "id as identifier",
      "date",
      "for",
      "against",
      "abstention",
      "name as title",
      "ref as report"
    )
    .from("rollcalls");
  rcv.forEach((r) => {
    csvStream.write(r);
  });
  //console.log(rcv);
  console.log("read");
  csvStream.end();
  //csvStream.pipe(process.stdout).on("end", () => process.exit());
})();

console.log("process");
