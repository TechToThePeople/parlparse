/*{
  type: 'AMENDMENT',
  id: 170325,
  resultType: 'raise_hand',
  title: 'B10-0142/2024',
  result: 'LAPSED',
  author: 'ECR'
}*/

exports.up = function (knex) {
  return knex.schema.createTable("votings", function (table) {
    table.increments("id").primary();
    table.datetime("date").notNullable();
    table.string("type");
    table.string("result_type");
    table.string("title");
    table.string("result");
    table.text("author");
    table.integer("term").defaultTo(10);
    table.integer("vote_id");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("votings");
};
