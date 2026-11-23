// The agenda of a sitting, before and after the vote: an agenda point is a fact,
// the vote is its outcome. There is no stored link to the roll-calls — one agenda
// point can produce dozens of them (A10-0271/2026 had 61 on 2026-11-12), so the
// link is the pair (date, report) and the view below does the joining.
exports.up = async function (knex) {
  await knex.schema.createTable("agenda_items", function (table) {
    table.text("id").primary(); // MTG-PL-2026-11-24-OJ-ITM-V-29
    table.integer("plenary").nullable(); // plenaries.id
    table.string("date", 10).notNullable();
    table.string("agenda_order", 10).nullable(); // "9.0"
    table.string("notation", 30).nullable(); // "V-29"
    table.string("kind", 20).notNullable(); // vote | debate | other
    table.text("title").nullable(); // activity_label.en
    // the report reference, the same shape as rollcalls.ref; its procedure and
    // committees live on `reports`, filled by openapi/reports-backfill.js
    table.string("report", 30).nullable(); // A10-0041/2026
    table.text("raw").nullable(); // structuredContent.en
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
    table.index(["date"]);
    table.index(["report"]);
  });

  // planned = votes 0; voted = votes > 0
  await knex.raw(`
    CREATE VIEW agenda_items_with_votes AS
    SELECT a.*,
           (SELECT count(*) FROM rollcalls r
             WHERE r.ref = a.report
               AND substr(r.date, 1, 10) = a.date) AS votes,
           (SELECT r.id FROM rollcalls r
             WHERE r.ref = a.report
               AND substr(r.date, 1, 10) = a.date
             ORDER BY r.id DESC LIMIT 1) AS final_vote
      FROM agenda_items a
  `);
};

exports.down = async function (knex) {
  await knex.raw("DROP VIEW IF EXISTS agenda_items_with_votes");
  return knex.schema.dropTable("agenda_items");
};
