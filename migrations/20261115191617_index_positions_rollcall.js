// `positions` had no index at all, so every per-roll-call lookup (cards.js,
// csv.js, qa queries) scanned 3.9M rows. cards.js does one query per vote.
exports.up = function (knex) {
  return knex.raw(
    "CREATE INDEX IF NOT EXISTS positions_rollcall ON positions (rollcall)"
  );
};

exports.down = function (knex) {
  return knex.raw("DROP INDEX IF EXISTS positions_rollcall");
};
