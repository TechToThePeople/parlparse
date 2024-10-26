exports.up = function (knex) {
  return knex.schema.createTable("votes", function (table) {
    table.increments("id").primary();
    table.datetime("date").notNullable().defaultTo(knex.fn.now());
    table.string("description", 255);
    table.string("result", 255);
    table.integer("plenary");
    table.integer("rollcall_id").unique().nullable();
    table.text("name").notNullable();
    table.string("ref", 255);
    table.integer("term");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("votes");
};
