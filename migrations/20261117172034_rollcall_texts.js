// The text each vote was about, when the vote was on part of a text ("§ 19/2",
// "Recital U", "Text as a whole without the words: …").
//
// One row per rollcall (its id is the primary key). Sources:
//   vot-xml   the split-vote remark of the VOT XML (remarkSplitVote), which is
//             the exact wording put to the vote
//   summary   the AI summary of the report, for votes on the whole text
//   ai        filled later by documents/oeil.js when the part had to be extracted from
//             the document
exports.up = function (knex) {
  return knex.schema.createTable("rollcall_texts", function (table) {
    table.integer("rollcall").primary(); // = rollcalls.id
    table.string("section", 100).nullable(); // "§ 19", "Recital U", null for the whole text
    table.integer("part").nullable(); // 1, 2, 3 …
    table.text("text");
    // quoted | without-words | with-words | other | summary
    table.string("kind", 20).nullable();
    table.string("source", 20).nullable();
    table.integer("chars").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("rollcall_texts");
};
