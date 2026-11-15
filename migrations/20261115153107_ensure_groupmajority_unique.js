// sql/updatemajority.sql is an upsert on (eugroup, rollcall), which needs this
// unique index. It exists on the databases built from the Strapi dump, but no
// migration ever created it, so a fresh or rebuilt database silently degraded to
// "no such conflict target" (or full-table scans) when the upsert ran.
exports.up = function (knex) {
  return knex.raw(
    "CREATE UNIQUE INDEX IF NOT EXISTS groupmajority_eugroup_rollcall_unique ON groupmajority (eugroup, rollcall)"
  );
};

exports.down = function () {
  // the index predates this migration on the original databases; leaving it in
  // place is harmless.
};
