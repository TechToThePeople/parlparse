// The column no longer holds only committees: for motions tabled by political
// groups it holds the groups (org/PPE, org/S-D, …). Rename it to `creator` to
// match the OpenAPI `creator` field it is derived from.
//
// `csv.js` still exports it as `committee` in text_tabled.csv because ../10
// reads docs[...].committee.
exports.up = function (knex) {
  return knex.schema.table("reports", (table) => {
    table.renameColumn("committee", "creator");
  });
};

exports.down = function (knex) {
  return knex.schema.table("reports", (table) => {
    table.renameColumn("creator", "committee");
  });
};
