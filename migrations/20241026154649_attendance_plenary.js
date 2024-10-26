exports.up = function (knex) {
  return knex.schema.table("attendances", function (table) {
    table.integer("plenary_id").unsigned().index();
    table.unique(["plenary_id", "mep_id"]);
  });
};

exports.down = function (knex) {
  return knex.schema.table("attendances", function (table) {
    table.dropUnique(["plenary_id", "mep_id"]);
    table.dropColumn("plenary_id");
  });
};
