// Rows from the RCV-XML importer (lib/rollcall.js) never set `method`, so they
// are all roll-call votes with a NULL method. Label them RCV so `method` alone
// tells you what a row is.
exports.up = function (knex) {
  return knex("rollcalls").whereNull("method").update({ method: "RCV" });
};

exports.down = function () {
  // not reversible: these rows are indistinguishable from OpenAPI-imported RCV
  // rows afterwards.
};
