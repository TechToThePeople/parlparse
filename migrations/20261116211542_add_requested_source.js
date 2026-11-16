// Where `requested_by` came from. Two very different things share that column:
//
//   remarks  a group actually asked for this vote, from the VOT XML remarks
//            ("Requests for roll-call / separate / split votes")
//   api      the decisions API's responsible_organization_label, which for an
//            amendment is who tabled it ("original text" = the committee's own
//            wording) — not a request at all
//
// The site needs the distinction to say "asked by X" or "tabled by X"; using
// vote_request as a proxy fails, since a vote can have a roll-call marker and
// still carry the API's author value (no remark covers that item).
//
// Everything currently in the column came from the API: vot-xml.js only
// overwrote the rows a remark named, so this default is correct and the next
// `vot-xml --all` marks those as 'remarks'.
exports.up = async function (knex) {
  await knex.schema.table("rollcalls", function (table) {
    table.string("requested_source", 10).nullable();
  });
  await knex("rollcalls")
    .whereNotNull("requested_by")
    .update({ requested_source: "api" });
};

exports.down = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.dropColumn("requested_source");
  });
};
