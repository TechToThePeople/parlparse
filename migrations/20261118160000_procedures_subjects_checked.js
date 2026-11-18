// "We looked and it publishes nothing" must be distinguishable from "we could not
// look": only a run where both sources answered sets this.
exports.up = function (knex) {
  return knex.schema.table("procedures", function (table) {
    table.datetime("subjects_checked").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("procedures", function (table) {
    table.dropColumn("subjects_checked");
  });
};
