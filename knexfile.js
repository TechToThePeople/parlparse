const config = require("./config/database.js")();

// Which connection knex uses: DB=live for the postgres server, default is the
// local sqlite file.
const name = process.env.DB || "mepwatch";
const settings = config.connections[name].settings;
if (name === "mepwatch") settings.connection.filename = "./data/term10.db";

module.exports = settings;
