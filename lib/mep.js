const db = require("./db.js");

const meps = [];

function exists(voteId) {
  return meps.includes(voteId);
}

async function all() {
  //const r = await db('meps').where();
  const r = await db.select("vote_id", "ep_id").from("meps");
  r.forEach((d) => meps.push(+d.vote_id));
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
exports.isMep = exists;
exports.addMep = add;
