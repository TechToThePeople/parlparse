// The AI summary of a report, as a column of the report itself.
//
// A summary used to live only in `data/content/summary/<ref>.md`, and reached the
// database only through `rollcall_texts` — which is keyed by vote and holds one
// text per vote, so only reports with a whole-text vote carried it (762 of 1,678).
// The rest, and every report that was never voted, had their summary nowhere.
exports.up = async function (knex) {
  await knex.schema.table("reports", function (table) {
    table.text("summary").nullable(); // the same text as the file
    table.string("summary_model", 50).nullable(); // deepseek-flash
    table.datetime("summary_at").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("reports", function (table) {
    table.dropColumn("summary");
    table.dropColumn("summary_model");
    table.dropColumn("summary_at");
  });
};
