// Committee responsible for the voted item, stored as the EP acronym (`ENVI`,
// `ENVI, SANT` for joint) like `reports.creator`. Filled from the VOT XML's
// `committee` attribute, which spells the name out in full.
exports.up = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.string("committee", 100).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.dropColumn("committee");
  });
};
