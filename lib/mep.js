const db = require("./db.js");

const meps = [];
function exists(voteId) {
  return meps.includes(voteId);
}

async function unmatched() {
  const r = await db
    .select("vote_id", "name", "eugroup", "ep_id")
    .from("meps")
    .whereNull("ep_id")
    .orWhereNull("start")
    .orWhereNull("birthdate");
  return r;
}

async function all() {
  const r = await db.select("vote_id", "name", "eugroup", "ep_id").from("meps");
  return r;
}

async function update(voteId, d) {
  try {
    const r = await db("meps")
      .where("vote_id", voteId)
      .update({
        ep_id: d.epid,
        first_name: d.first_name,
        last_name: d.last_name,
        country: d.constituency
          ? d.constituency.country.toLowerCase()
          : d.country.toLowerCase(),
        party: d.party || d.constituency.party,
        birthdate: d.Birth && d.Birth.date,
        start: d.start || d.constituency.start,
        end: d.end,
      });
    console.log("updated", r);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  //.then (d => console.log(d));
}

async function add(d) {
  try {
    const r = await db("meps").insert(d);
    console.log(r[0]);
    meps.push(+d.vote_id);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  //.then (d => console.log(d));
}

async function init() {
  const r = await db.select("vote_id", "ep_id").from("meps");
  r.forEach((d) => meps.push(+d.vote_id));
  return true;
}

exports.init = init;
exports.all = all;
exports.unmatched = unmatched;
exports.isMep = exists;
exports.addMep = add;
exports.update = update;
