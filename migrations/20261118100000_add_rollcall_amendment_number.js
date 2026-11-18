// The amendments a vote is about, as the VOT XML states it: "4=" (identical
// text), "274D" (variant D), "4= 7=" (two identical amendments voted together),
// "9-14" (a range), "1/REV" (a revision). The vote *names* are derived from
// labels and are lossy — they show at most two of them, and they spell the
// variant S where the XML says D (139 votes).
exports.up = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.string("amendment_number", 100).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.table("rollcalls", function (table) {
    table.dropColumn("amendment_number");
  });
};
