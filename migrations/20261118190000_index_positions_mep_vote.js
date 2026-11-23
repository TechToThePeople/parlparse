// The loyalty and rebel queries look at one MEP across every roll-call:
//
//   SELECT … FROM positions p
//     JOIN groupmajority g ON g.rollcall = p.rollcall AND g.eugroup = p.eugroup
//    WHERE p.mep_vote = ?
//
// With only `positions_rollcall` (rollcall) SQLite scanned all 4M rows: 184 ms
// per query, three per MEP page. This index leads with mep_vote and carries the
// three columns the join and the filter need, so the scan becomes a covering
// index seek — 5 ms, and it never touches the table.
exports.up = function (knex) {
  return knex.raw(
    "CREATE INDEX IF NOT EXISTS positions_mep_vote ON positions (mep_vote, rollcall, eugroup, position)"
  );
};

exports.down = function (knex) {
  return knex.raw("DROP INDEX IF EXISTS positions_mep_vote");
};
