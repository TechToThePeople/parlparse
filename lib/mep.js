const db = require("./db.js");

const meps = [];
function exists(voteId) {
  return meps.includes(voteId);
}

async function unmatched() {
  const r = await db
    .select("vote_id", "name", "eugroup")
    .from("meps")
    .whereNull("ep_id");
  return r;
}

async function all() {
  //const r = await db('meps').where();
  const r = await db.select("vote_id", "ep_id").from("meps");
  r.forEach((d) => meps.push(+d.vote_id));
}

async function update(voteId, d) {
  try {
    const r = await db("meps")
      .where("vote_id", voteId)
      .update({
        ep_id: d.epid,
        first_name: d.first_name,
        last_name: d.last_name,
        country: d.constituency.country,
        party: d.constituency.party,
        birthdate: d.Birth.date,
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
  await all();
}

exports.init = init;
exports.all = all;
exports.unmatched = unmatched;
exports.isMep = exists;
exports.addMep = add;
exports.update = update;
