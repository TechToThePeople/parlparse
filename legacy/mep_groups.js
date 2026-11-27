const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename: "./data/term10.db",
  },
  useNullAsDefault: true,
});

knex
  .select("eugroup", knex.raw("count(*) as mep_count"))
  .from("meps")
  .groupBy("eugroup")
  .orderBy("mep_count", "desc")
  .then((results) => {
    console.table(results);
  })
  .catch((err) => {
    console.error(err);
  })
  .finally(() => {
    knex.destroy();
  });
