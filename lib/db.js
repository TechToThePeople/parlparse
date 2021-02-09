let knex = null;
const k = require("knex");
const config = require("../config/database.js");

if (knex) {
  console.log("database existing");
  process.exit(1);
} else {
  let cfg = {};
  const env = (key, value) => {
    cfg[key] = value;
    return "/var/www/greenvote/" + value;
  };

  cfg = config({ env: env });
  // cfg.connections.default.settings.debug = true;
  cfg.connections.default.settings.useNullAsDefault = true;
  //  cfg.connections.default.settings.connection = {
  //    filename: cfg.connections.default.settings.filename,
  //  };
  cfg.connections.default.settings.pool = { min: 0, max: 1 };

  knex = k(cfg.connections.default.settings);
}

async function insertReport(report) {
  return knex("reports").insert(report); //.then (d => console.log(d));
}

async function insertPlenary(d) {
  return knex("plenaries").insert(d); //.then (d => console.log(d));
}

async function insertVote(d) {
  return knex("votes").insert(d); //.then (d => console.log(d));
}
async function insertPosition(position) {
  return knex("positions").insert(position); //.then (d => console.log(d));
}

module.exports = knex;
exports.knex = knex;
exports.insertPlenary = insertPlenary;
exports.insertVote = insertVote;
