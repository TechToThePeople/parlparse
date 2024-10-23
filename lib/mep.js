const db = require("./db.js");

const meps = [];
function exists(voteId) {
  return meps.includes(voteId);
}

async function missingCountry() {
  const r = await db
    .select("vote_id", "name", "eugroup", "ep_id")
    .from("meps")
    //    .where("country","")
    .whereNull("country");
  //    .orWhereNull("start")
  //    .orWhereNull("birthdate");
  return r;
}
async function unmatched() {
  const r = await db
    .select("vote_id", "name", "eugroup", "ep_id")
    .from("meps")
    .whereNull("ep_id");
  //    .orWhereNull("start")
  //    .orWhereNull("birthdate");
  return r;
}

async function all() {
  const r = await db
    .select("vote_id", "name", "country", "eugroup", "ep_id")
    .from("meps");
  return r;
}

const insertAll = async () => {};

const insert = async (d) => {
  try {
    const r = await db("meps").insert({
      ep_id: d.epid,
      first_name: d.first_name,
      term: 10,
      last_name: d.last_name,
      country: d.constituency
        ? d.constituency.country.toLowerCase()
        : d.country.toLowerCase(),
      party: d.party || d.constituency.party,
      eugroup: d.eugroup,
      birthdate: d.Birth && d.Birth.date,
      start: d.start || d.constituency.start,
      end: d.end,
    });
    return true;
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT") {
      return false;
    }
  }
};

async function update(voteId, d) {
  if (!d.constituency)
    d.constituency = { country: d.country, party: "", start: d.start };
  try {
    const r = await db("meps")
      .where("vote_id", voteId)
      .update({
        ep_id: d.epid,
        first_name: d.first_name,
        term: 10,
        last_name: d.last_name,
        country: d.constituency
          ? d.constituency.country.toLowerCase()
          : d.country.toLowerCase(),
        party: d.party || d.constituency.party,
        eugroup: d.eugroup,
        birthdate: d.Birth && d.Birth.date,
        start: d.start || d.constituency.start,
        end: d.end,
      });
  } catch (e) {
    console.error(e, d);
    process.exit(1);
  }
  //.then (d => console.log(d));
}

async function add(d) {
  try {
    d.term = 10;
    if (d.ep_id) d.ep_id = parseInt(d.ep_id, 10) || undefined;
    const r = await db("meps").insert(d);
    meps.push(+d.vote_id);
    console.log(d);
    process.exit(1);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  //.then (d => console.log(d));
}

async function init() {
  const r = await db.select("vote_id", "ep_id").from("meps");
  //r.forEach((d) => meps.push(+d.vote_id));
  r.forEach((d) => meps.push(+d.ep_id));
  return true;
}

exports.init = init;
exports.all = all;
exports.unmatched = unmatched;
exports.missingCountry = missingCountry;
exports.isMep = exists;
exports.addMep = add;
exports.update = update;
exports.insertAll = insertAll;
exports.insert = insert;
