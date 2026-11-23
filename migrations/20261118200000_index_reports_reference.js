// `reports.reference` is joined everywhere — csv.js (rollcalls.ref), the agenda
// view/backfill, and the MEP page's rebel list, where the plan read
// `SCAN rep LEFT-JOIN` and rescanned all 1,719 rows for every rebel vote.
exports.up = function (knex) {
  return knex.raw(
    "CREATE INDEX IF NOT EXISTS reports_reference ON reports (reference)"
  );
};

exports.down = function (knex) {
  return knex.raw("DROP INDEX IF EXISTS reports_reference");
};
