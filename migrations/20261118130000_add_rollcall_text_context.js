// The paragraph a split part belongs to, with the words it is about already
// marked (<b> for added, <del> for removed): the reader of vote.html sees the
// sentence in its place instead of a lone phrase.
exports.up = function (knex) {
  return knex.schema.table("rollcall_texts", function (table) {
    table.text("context").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcall_texts", function (table) {
    table.dropColumn("context");
  });
};
