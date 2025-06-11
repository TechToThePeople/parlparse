#!/usr/bin/env node
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
const eugroups = {};

const _eugroups = {
  "The Left": "GUE/NGL",
  EPP: "PPE",
  "Greens/EFA": "Verts/ALE",
  NA: "NI",
};
const fixgroups = { "The Left": "GUE/NGL", NI: "NA" };
//const fixgroups = {};
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
  let r;
  if (epid) {
    r = meps.find((element) => epid == element.epid);
  }
  if (!r) {
    r = meps.find((element) => {
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
  }
  if (!r) {
    const t = allMeps.find((element) => {
      if (!element.start10) return false;
      if (element.lastname.toLowerCase() === name) {
        if (element.eugroup !== eugroup) {
          console.error(
            element.lastname,
            "Missmatch group",
            element.eugroup,
            eugroup
          );
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
      term: 10,
      start: t.start10,
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
    r.start = "2024-07-02";
  }
  return r;
};

async function importMEPs() {
  for (const d of meps) {
    try {
      const r = await mep.insert(d);
      if (!r) console.log("already imported", d.epid, d.last_name);
    } catch (e) {
      throw e;
    }
  }
}

(async () => {
  // Call the main function in a Node CLI
  //await importMEPs();
  const nocountry = await mep.missingCountry();
  nocountry.forEach(async (incomplete) => {
    const found = meps.find((element) => element.epid === incomplete.ep_id);
    found && (await mep.update(incomplete.ep_id, found));
  });

  const db = await mep.fetch(10);
  Object.values(inout).forEach(async (io) => {
    const found = db.find((element) => element.epid === io.id);
    if (io.file === "outgoing" && found && !found.end) {
      //end && !found.end) {
      console.log("need to end", found, io);
      const r = await mep.end(io.id, io.end);
      console.log("ended", found);
    }
  });
  const all = await mep.all();
  console.log("all", all.length);
  for (const m of all) {
    const found = find(m.name?.toLowerCase(), m.eugroup, +m.ep_id);
    if (found.Birth && found.Birth.date === "") {
      found.Birth.date = null;
    }
    if (fixgroups[found.eugroup]) {
      found.eugroup = fixgroups[found.eugroup];
    }
    if (fixgroups[m.eugroup]) {
      m.eugroup = fixgroups[m.eugroup];
    }
    if (found.eugroup != m.eugroup) {
      console.log(
        "need to fix group",
        m.ep_id,
        found.last_name,
        m.eugroup,
        "->",
        found.eugroup
      );
      found && (await mep.update(m.ep_id, found));
    }
  }
  const unmatched = await mep.unmatched();
  console.log("unmatched", unmatched.length);
  for (const m of unmatched) {
    console.log("unmatched, not sure we update properly");
    process.exit(1);
    const found = find(m.name?.toLowerCase(), m.eugroup, +m.ep_id);
    if (found.Birth && found.Birth.date === "") {
      console.log(
        "missing birth info " + m.last_name?.toLowerCase() + " " + m.ep_id
      );
      found.Birth.date = null;
    }
    if (fixgroups[found.eugroup]) {
      found.eugroup = fixgroups[found.eugroup];
    }
    if (fixgroups[m.eugroup]) {
      m.eugroup = fixgroups[m.eugroup];
    }
    !found && console.log(m, found);
    try {
      found && (await mep.update(m.ep_id, found));
    } catch (e) {
      console.log(found, e);
    }
  }
  process.exit(0);
})();
