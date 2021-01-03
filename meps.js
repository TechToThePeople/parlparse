"use strict";
const fs = require("fs");
const mep = require("./lib/mep.js");
const file = "./data/meps.json";
const meps = JSON.parse(fs.readFileSync(file, "utf8"));
const eugroups = { EPP: "PPE", "Greens/EFA": "Verts/ALE", NA: "NI" };
const csv = require("d3-dsv");

const allMeps = csv.csvParse(fs.readFileSync("./data/meps.all.csv", "utf8"));

const find = (name, eugroup) => {
  console.log(name, eugroup);
  let r = meps.find((element) => {
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
          console.error("no Missmatch group", element.eugroup, eugroup);
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
        console.log(element, name);
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
      constituency: { party: t.party, country: t.country },
    };
  }
  return r;
};

mep.unmatched().then(async (unmatched) => {
  //  const m = unmatched[0];
  for (const m of unmatched) {
    const found = find(m.name.toLowerCase(), m.eugroup);
    //  console.log(m,found);
    !found && console.log(m, found);
    found && (await mep.update(m.vote_id, found));
  }
  process.exit(0);
});
