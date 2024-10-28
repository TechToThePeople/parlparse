exports.up = function (knex) {
  return knex.schema.table("plenaries", function (table) {
    table.integer("sitting_id").unique().nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("plenaries", function (table) {
    table.dropColumn("sitting_id");
  });
};
