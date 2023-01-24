"use strict";
const fs = require("fs");
const mep = require("./lib/mep.js");

const meps = JSON.parse(fs.readFileSync("./data/meps.json", "utf8")).map(
  function (r) {
    // fix meps with missing lastname
    if (!(r.last_name || "").trim()) {
      let names = { first: [], last: [] };
      r.first_name.split(/\s+/g).forEach(function (n) {
        const c = n.replace(/Mc/g, "MC").replace(/ß/g, "SS"); // account for exemptions to uppercase rule: Mc and ß
        names[c === c.toUpperCase() ? "last" : "first"].push(n);
      });
      r.last_name = names.last.join(" ");
      r.first_name = names.first.join(" ");
    }
    return r;
  }
);

const inout = JSON.parse(fs.readFileSync("./data/inout.json", "utf8"));
const eugroups = {
  "The Left": "GUE/NGL",
  EPP: "PPE",
  "Greens/EFA": "Verts/ALE",
  NA: "NI",
};
const fixgroups = { "The Left": "GUE/NGL" };
const log = require("./lib/log.js");

const pushMEP = (d) => {
  d.epid = d.id;
  d.first_name = [];
  d.last_name = [];

  const names = d.fullName.split(" ");
  names.map((n) => {
    const c = n.replace(/Mc/g, "MC").replace(/ß/g, "SS"); // exemptions to uppercase rule: Mc and ß
    const index = c === c.toUpperCase() ? "last_name" : "first_name";
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
      start: t.start9,
      Birth: { date: "1970-01-01" },
      end: t.end || null,
      eugroup: t.eugroup,
      constituency: { party: t.party, country: t.country },
    };
    if (t.birthdate !== "") r.Birth = { date: t.birthdate };
    else {
      r.Birth = {};
    }
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
    if (found.Birth && found.Birth.date === "") {
      console.log("missing birth info " + m.name.toLowerCase() + " " + m.ep_id);
      found.Birth.date = null;
    }
    if (fixgroups[found.eugroup]) {
      found.eugroup = fixgroups[found.eugroup];
    }
    !found && console.log(m, found);
    try {
      found && (await mep.update(m.vote_id, found));
    } catch (e) {
      console.log(found, e);
    }
  }
  process.exit(0);
});
