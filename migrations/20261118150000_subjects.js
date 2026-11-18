// The classification of a procedure: the "Subject" list OEIL shows (6.20 Common
// commercial policy in general, 8.70 Budget of the Union) plus the three
// vocabularies the open data puts on documents — and their numberings differ, so
// `scheme` is part of what identifies a subject.
exports.up = async function (knex) {
  await knex.schema.createTable("subjects", function (table) {
    table.increments("id").primary();
    table.string("scheme", 20).notNullable(); // oeil, dir-eu-legal-act, subject-matter, eurovoc
    table.string("code", 40).notNullable();
    table.string("label", 255).nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
    table.unique(["scheme", "code"]);
  });
  await knex.schema.createTable("procedure_subjects", function (table) {
    table.string("procedure", 20).notNullable(); // procedures.code
    table.integer("subject").notNullable(); // subjects.id
    table.primary(["procedure", "subject"]);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable("procedure_subjects");
  await knex.schema.dropTable("subjects");
};
