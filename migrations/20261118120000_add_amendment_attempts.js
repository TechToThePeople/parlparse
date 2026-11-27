// A vote whose amendment text is not in any document used to be retried on every
// run. Count the attempts, and let a human park one explicitly:
//   update rollcalls set amendment_status = 'manual' where id = 199981;
// 'unavailable' is set by ai/amendments.js itself when a report publishes no
// amendment documents at all — nothing to fetch, so nothing to retry.
exports.up = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.integer("amendment_attempts").notNullable().defaultTo(0);
    table.string("amendment_status", 20).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.dropColumn("amendment_attempts");
    table.dropColumn("amendment_status");
  });
};
