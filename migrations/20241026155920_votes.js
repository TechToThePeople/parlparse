exports.up = function (knex) {
  return knex.schema.createTable("votes", function (table) {
    table.increments("id").primary();
    table.datetime("date").notNullable();
    table.string("type");
    table.datetime("updated").notNullable().defaultTo(knex.fn.now());
    table.string("title");
    table.string("label");
    //    table.integer("plenary");
    //    table.string("ref", 255);
    table.integer("term").defaultTo(10);
    table.integer("plenary_id");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("votes");
};
