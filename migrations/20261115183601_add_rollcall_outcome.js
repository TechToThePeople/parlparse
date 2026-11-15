// `decision_outcome` (ADOPTED / REJECTED / LAPSED) was dropped by the importer.
// For hand votes it is the only substantive result the EP publishes, since they
// have no per-MEP or aggregate counts at all.
exports.up = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.string("outcome", 20).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.dropColumn("outcome");
  });
};
