const db = require("./db.js");
const fetch = require("node-fetch");

const term = 10;
const reports = [];

function exists(id) {
  return reports.includes(id);
}

// `rollcalls.ref` also holds references the API does not publish: the virtual
// ones we create ourselves (budget-<year>, agenda-<YYYY-MM-DD>) and the C10
// Commission proposals. Asking the API for those only yields "Not Found".
const DOCUMENT_REF = /^(?:RC-)?[AB]\d+-\d+\/\d{4}(?:\/REV\d+)?$/;

async function download(_ref) {
  if (!DOCUMENT_REF.test(_ref)) return;
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
      ?.filter((d) => d.startsWith("org/"))
      .map((d) => d.slice(4));
    //    if (comm.length === 1) {      report.committee = comm.slice(4);    }
    report.committee = comm?.join(" ") | "";
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
    if (!d.ref || !DOCUMENT_REF.test(d.ref)) {
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
