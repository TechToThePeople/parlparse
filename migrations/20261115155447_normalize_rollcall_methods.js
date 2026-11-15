// Rows imported before the method vocabulary was fixed still carry the raw EP
// decision_method (minus the def/ prefix). Same mapping as METHOD_NAMES in
// openapi/lib.js; VOTE_ELECTRONIC_SECRET was only noticed after a full import.
const MAP = {
  VOTE_ELECTRONIC_ROLLCALL: "RCV",
  VOTE_HAND: "HAND",
  VOTE_ELECTRONIC: "ELECTRONIC",
  VOTE_ELECTRONIC_SECRET: "SECRET",
};

exports.up = async function (knex) {
  for (const [from, to] of Object.entries(MAP)) {
    const updated = await knex("rollcalls")
      .where("method", from)
      .update({ method: to });
    if (updated) console.log(`rollcalls: method ${from} -> ${to} (${updated})`);
  }
};

exports.down = function () {
  // one-way normalisation; the old spellings carry no extra meaning.
};
