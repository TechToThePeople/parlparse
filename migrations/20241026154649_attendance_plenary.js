exports.up = function (knex) {
  return knex.schema.createTable("attendances", function (table) {
    table.integer("sitting_id").unsigned();
    table.integer("mep_id").unsigned();
    table.string("status");
    table.unique(["sitting_id", "mep_id"]);
    //    table.foreign('sitting_id').references('sitting_id').inTable('plenaries');
    // we might have sittings without plenaries with RCV, and so far all plenaries are only set for RCV
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("attendances");
};
