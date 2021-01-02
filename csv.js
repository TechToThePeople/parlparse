//identifier,date,report,desc,title,for,against,abstention

const roll = require("./lib/rollcall.js");
const { init } = require("./lib/mep.js");
const db = require("./lib/db.js");
const fs = require("fs");
const { format } = require("@fast-csv/format");

const rollcall = () => {
  console.log("aaa");
  return new Promise(async (resolve, reject) => {
    const file = "./data/item_rollcall.csv";
    const head = "identifier,date,report,desc,title,for,against,abstention".split(
      ","
    );
    const writeStream = fs.createWriteStream(file);
    const csvStream = format({ headers: head });
    csvStream.pipe(writeStream).on("finish", () => {
      console.log("fini rollcall");
      resolve();
      //    process.exit();
    });

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
  });
};

const textTabled = () => {
  return new Promise(async (resolve, reject) => {
    const file = "./data/text_tabled.csv";
    const head = "date,reference,type,title,rapporteur,committee,intra,oeil,doc".split(
      ","
    );
    const writeStream = fs.createWriteStream(file);
    const csvStream = format({ headers: head });
    csvStream.pipe(writeStream).on("finish", () => {
      console.log("end");
      resolve();
      //    process.exit();
    });

    const rcv = await db
      .select("date", "title", "reference", "committee", "url as oeil")
      .from("reports");
    rcv.forEach((r) => {
      console.log(r);
      csvStream.write(r);
    });
    //console.log(rcv);
    csvStream.end();

    //csvStream.pipe(process.stdout).on("end", () => process.exit());
  });
};

Promise.all([textTabled(), rollcall()]).then((values) => {
  console.log("done", values);
  process.exit();
});

/*
(async function() {
  const c = await textTabled ();
  const d = await rollcall ();
})();
*/
