// Two things the VOT XML knows about *why* a vote happened, which we were
// throwing away:
//
//   vote_request        the `rcv/value` marker: "RCV", "EV" (electronic),
//                       "sep" (separate vote), "split", or "<n>/RCV" for the
//                       n-th part of a split vote
//   split_requested_by  the group(s) that asked for the split of this item,
//                       from the block's "Requests for split votes" remark
exports.up = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.string("vote_request", 20).nullable();
    table.string("split_requested_by", 100).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.dropColumn("vote_request");
    table.dropColumn("split_requested_by");
  });
};
