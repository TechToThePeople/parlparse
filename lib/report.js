const db = require("./db.js");
const fetch = require("node-fetch");
const xml2js = require("xml2js");

const reports = [];
const parser = new xml2js.Parser({
  //  tagNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())],
  //  attrNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())]
});

function exists(id) {
  return reports.includes(id);
}

async function download(ref) {
  const url =
    "https://oeil.secure.europarl.europa.eu/oeil/popups/printresultlist.xml?q=documentEP:D-" +
    ref; //B9-0411/2020
  try {
    const r = await fetch(url);
    const xml = await r.text();
    const d = await new Promise((resolve, reject) =>
      parser.parseString(xml, (err, result) =>
        err ? reject(err) : resolve(result)
      )
    );
    if (!d.procedureList.items || !d.procedureList.items[0].item) {
      console.log("can't find " + ref, d);
      return;
    }
    let doc = d.procedureList.items[0].item[0];
    console.log(doc);
    let report = {
      reference: ref,
      url: doc.link[0],
      title: doc.title[0].replace(/\n/gm, " ").trim(),
      //      date:Date.parse(doc.lastpubdate[0]), Who the fuck can generate such insane date format?
      committee: (doc.committee && doc.committee[0]) || null,
      raw: JSON.stringify(d),
    };
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
  console.log("from roll");
  const r = await db
    .select("ref")
    .from("rollcalls")
    .groupBy("ref")
    .orderByRaw("count(*) desc");
  console.log(r);
  r.forEach((d) => {
    const report = download(d.ref);
    reports.push(+d.ref);
  });
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
    console.error(e);
  }
  //.then (d => console.log(d));
}

exports.fromRoll = fromRoll;
exports.process = download;
exports.all = all;
exports.isReport = exists;
exports.addReport = add;

//fromRoll();
