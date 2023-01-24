const db = require("./db.js");
const fetch = require("node-fetch");
const fs = require("fs");
const xml2js = require("xml2js");
const log = require("./log.js");
const path = require("path");
const committees = Object.assign(
  {},
  ...Object.entries(
    JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/committees.json"), "utf8"))
  ).map(([a, b]) => ({ [b]: a }))
);
const reports = [];
const parser = new xml2js.Parser({
  //  tagNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())],
  //  attrNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())]
});

function exists(id) {
  return reports.includes(id);
}

async function download(ref) {
  let url =
    "https://oeil.secure.europarl.europa.eu/oeil/popups/printresultlist.xml?q=documentEP:D-" +
    ref; //B9-0411/2020
  // now A reports are published there?
  if (
    ref.indexOf("C") === 0 ||
    ref.indexOf("20") === 0 ||
    ref.indexOf("A") === 0
  )
    // proposal from the commission
    url =
      "https://oeil.secure.europarl.europa.eu/oeil/popups/printresultlist.xml?searchType=0&s1&all&limit=500&lang=en&text=" +
      ref;
  try {
    const r = await fetch(url);
    const xml = await r.text();
    const d = await new Promise((resolve, reject) =>
      parser.parseString(xml, (err, result) =>
        err ? reject(err) : resolve(result)
      )
    );
    if (!d.procedureList.items || !d.procedureList.items[0].item) {
      log.error("can't find " + ref);
      return;
    }
    let doc = d.procedureList.items[0].item[0];
    let report = {
      reference: ref,
      url: doc.link[0],
      title: doc.title[0].replace(/\n/gm, " ").trim(),
      //      date:Date.parse(doc.lastpubdate[0]), Who the fuck can generate such insane date format?
      raw: JSON.stringify(d),
    };
    if (doc.committee) {
      const c = doc.committee[0].replace(/\n/gm, " ").trim();
      report.committee = committees[c] || c;
    }
    console.log(report);
    try {
      c = await add(report);
      return c;
    } catch (e) {
      console.log(e);
    }
  } catch (e) {
    console.log(e);
  }
}

async function fromRoll() {
  const r = await db
    .select("ref")
    .from("rollcalls")
    .groupBy("ref")
    //  if (!force) {
    .leftJoin("reports", "reports.reference", "rollcalls.ref")
    //    .whereNull("reports.id")
    .whereNull("reports.url")
    //    .orWhere("reports.url",'=',"")
    //}
    .orderByRaw("count(*) desc");

  for (const d of r) {
    if (!d.ref) {
      continue;
    }
    await download(d.ref);
    reports.push(+d.ref);
  }
  return;
}

async function all() {
  //const r = await db('meps').where();
  const r = await db.select("reference").from("reports");
  r.forEach((d) => reports.push(+d.reference));
}

async function add(d) {
  try {
    const r = await db("reports").insert(d).onConflict("reference").merge();
    reports.push(+d.reference);
    return r;
  } catch (e) {
    console.error(e, d);
  }
  //.then (d => console.log(d));
}

exports.fromRoll = fromRoll;
exports.process = download;
exports.all = all;
exports.isReport = exists;
exports.addReport = add;

//fromRoll();
