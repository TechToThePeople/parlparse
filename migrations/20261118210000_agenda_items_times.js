// When an agenda point happens. The API gives the time on the meeting part
// ("PLENARY SESSION VOTES 12:00–13:00"), whose `consists_of` lists the agenda
// points that fall inside it; the points themselves carry no time.
//
//   kind='part'   one row per meeting part, with start/end and its label
//   kind='vote'   `part` points at the part it belongs to, start/end copied from it
exports.up = async function (knex) {
  await knex.schema.table("agenda_items", function (table) {
    table.string("start", 30).nullable(); // 2026-11-24T12:00:00+01:00
    table.string("end", 30).nullable();
    table.text("part").nullable(); // the meeting part it is scheduled in
  });
  // the view selected a.*, which sqlite expands at creation: recreate it
  await knex.raw("DROP VIEW IF EXISTS agenda_items_with_votes");
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
  await knex.schema.table("agenda_items", function (table) {
    table.dropColumn("start");
    table.dropColumn("end");
    table.dropColumn("part");
  });
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
