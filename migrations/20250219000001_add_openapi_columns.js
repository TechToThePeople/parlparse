exports.up = function (knex) {
  return knex.schema
    .table("rollcalls", function (table) {
      table.string("method", 50).nullable();
      table.integer("attendees").nullable();
      table.string("requested_by", 255).nullable();
      table.string("doc_ref", 255).nullable();
      table.string("vote_type", 50).nullable();
    })
    .then(function () {
      return knex.schema.table("plenaries", function (table) {
        table.string("source", 50).nullable();
      });
    });
};

exports.down = function (knex) {
  return knex.schema
    .table("rollcalls", function (table) {
      table.dropColumn("method");
      table.dropColumn("attendees");
      table.dropColumn("requested_by");
      table.dropColumn("doc_ref");
      table.dropColumn("vote_type");
    })
    .then(function () {
      return knex.schema.table("plenaries", function (table) {
        table.dropColumn("source");
      });
    });
};
