// Where the text came from, clickable: the amendment range document, the VOT XML,
// or the report's page. Each row has exactly one origin (the extractors pick the
// most precise source first), so a column is enough.
exports.up = function (knex) {
  return knex.schema.table("rollcall_texts", function (table) {
    table.text("source_url").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcall_texts", function (table) {
    table.dropColumn("source_url");
  });
};
