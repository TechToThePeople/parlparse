const db = require("./db.js");
const fetch = require("node-fetch");
const fs = require("fs");
const xml2js = require("xml2js");
const log = require("./log.js");
const path = require("path");

const term = 10;
const committees = Object.assign(
  {},
  ...Object.entries(
    JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../data/committees.json"),
        "utf8"
      )
    )
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

async function download(_ref) {
  let ref = _ref.replace(/([A-Z])(\d+)-(\d+)\/(\d{4})/, "$1-$2-$4-$3");
  if (ref.startsWith("RC-B")) {
    ref = ref.replace("RC-B", "RC");
  }
  //https://data.europarl.europa.eu/api/v2/documents/A-10-2024-0011?format=application%2Fld%2Bjson&language=en
  const url =
    "https://data.europarl.europa.eu/api/v2/documents/" +
    ref +
    "?format=application%2Fld%2Bjson&language=en"; //B9-0411/2020
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log("error", response.statusText, url);
      return;
    }
    const _data = await response.json();
    const data = _data.data[0];
    const report = {
      reference: _ref,
      url: "https://www.europarl.europa.eu/doceo/document/" + ref + "_EN.html",
      title: data.title_dcterms.en.trim(),
      //      date:Date.parse(doc.lastpubdate[0]), Who the fuck can generate such insane date format?
      raw: JSON.stringify(data),
    };

    const comm = data.creator
      .filter((d) => d.startsWith("org/"))
      .map((d) => d.slice(4));
    //    if (comm.length === 1) {      report.committee = comm.slice(4);    }
    report.committee = comm.join(" ");
    //at least for work_type=def/ep-document-types/RESOLUTION_MOTION_JOINT this isn't the committee
    try {
      c = await add(report);
      return c;
    } catch (e) {
      console.log(e);
    }
  } catch (error) {
    console.error("There was a problem with the fetch operation:", error);
  }
}

async function broken_download(ref) {
  //https://data.europarl.europa.eu/api/v2/documents/A-10-2024-0011?format=application%2Fld%2Bjson&language=en
  let prefix = undefined;
  let url =
    "https://oeil.secure.europarl.europa.eu/oeil/popups/printresultlist.xml?q=documentEP:D-" +
    ref; //B9-0411/2020
  // now A reports are published there?
  if (ref.startsWith("RC-")) {
    ref = ref.slice(3);
    prefix = "RC-";
  }
  if (
    ref.indexOf("C") === 0 ||
    ref.indexOf("20") === 0 ||
    ref.indexOf("A") === 0 ||
    ref.indexOf("B") === 0
  )
    console.log("ref", ref);
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
    if (prefix) {
      report.reference = prefix + ref;
      const d = ref.replace(/B(\d+)-(\d+)\/(\d+)/, "RC-$1-$3-$2");
      report.url =
        "https://www.europarl.europa.eu/doceo/document/" + d + "_EN.html";
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
    .where("rollcalls.term", term)
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
