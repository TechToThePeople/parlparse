"use strict";
const fs = require("fs");
const mep = require("./lib/mep.js");
const file = "./data/meps.json";
const meps = JSON.parse(fs.readFileSync(file, "utf8"));
const inout = JSON.parse(fs.readFileSync("./data/inout.json", "utf8"));
const eugroups = { EPP: "PPE", "Greens/EFA": "Verts/ALE", NA: "NI" };

const pushMEP = (d) => {
  d.epid = d.id;
  d.first_name = [];
  d.last_name = [];

  const names = d.fullName.split(" ");
  names.map((n) => {
    const index = n === n.toUpperCase() ? "last_name" : "first_name";
    d[index].push(n);
  });
  d.first_name = d.first_name.join(" ");
  d.last_name = d.last_name.join(" ");
  meps.push(d);
};

for (const id of Object.keys(inout)) {
  if (!inout[id].end) {
    const mep = meps.find((element) => element.epid === +id);
    if (!mep) {
      pushMEP(inout[id]);
    } else {
      //  meps.push(inout[id]);
    }
  } else {
    const i = meps.findIndex((element) => element.epid === +id);
    if (i === -1) {
      pushMEP(inout[id]);
    } else if (inout[id].end) {
      meps[i].end = inout[id].end;
    }
  }
}
const csv = require("d3-dsv");

const allMeps = csv.csvParse(fs.readFileSync("./data/meps.all.csv", "utf8"));

const find = (name, eugroup, epid) => {
  let r = meps.find((element) => {
    if (epid) {
      return epid == element.epid;
    }
    if (element.last_name.toLowerCase() === name) {
      if (
        element.eugroup !== eugroup &&
        eugroups[element.eugroup] !== eugroup
      ) {
        console.error("active Missmatch group", element.eugroup, eugroup);
      }
      return true;
    }
  });
  if (!r) {
    const t = allMeps.find((element) => {
      if (!element.start9) return false;
      if (element.lastname.toLowerCase() === name) {
        if (element.eugroup !== eugroup) {
          console.error("Missmatch group", element.eugroup, eugroup);
        }
        return true;
      }
      if (
        name.includes(" ") &&
        element.lastname.toLowerCase() +
          " " +
          element.firstname.toLowerCase() ===
          name
      ) {
        if (element.eugroup !== eugroup)
          console.error("nu Missmatch group", element.eugroup, eugroup);
        return true;
      }
      return false;
    });
    if (!t) {
      return false;
    }
    r = {
      epid: t.epid,
      first_name: t.firstname,
      last_name: t.lastname,
      Birth: { date: t.birthdate },
      start: t.start9,
      end: t.end,
      constituency: { party: t.party, country: t.country },
    };
  }
  if (inout[r.epid]) {
  } else {
    r.start = "2019-07-02";
  }
  return r;
};

//mep.unmatched().then(async (unmatched) => {
mep.all().then(async (unmatched) => {
  //  const m = unmatched[0];
  for (const m of unmatched) {
    const found = find(m.name.toLowerCase(), m.eugroup, +m.ep_id);
    !found && console.log(m, found);
    found && (await mep.update(m.vote_id, found));
  }
  process.exit(0);
});
