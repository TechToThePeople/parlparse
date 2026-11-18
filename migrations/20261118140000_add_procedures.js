// A report is one step of a procedure (2025/0227(COD)) that the EP's open data
// publishes with the whole chain: every document of the process (other
// committees' opinions, Council positions, Commission proposals) and the
// activities that link them. Keyed by the code as the EP writes it.
exports.up = async function (knex) {
  await knex.schema.createTable("procedures", function (table) {
    table.string("code", 20).primary(); // 2025/0227(COD)
    table.string("type", 10).nullable(); // COD
    table.text("title").nullable(); // process title, English
    table.string("stage", 50).nullable(); // current stage id (RDG1)
    table.text("documents").nullable(); // JSON: every document of the process
    table.text("activities").nullable(); // JSON: {date, type, document}
    table.text("raw").nullable(); // the API payload
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.table("reports", function (table) {
    table.string("procedure", 20).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.table("reports", function (table) {
    table.dropColumn("procedure");
  });
  await knex.schema.dropTable("procedures");
};
