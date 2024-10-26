config = require("./config/database.js")();

//  settings: { client: 'sqlite3', connection: { filename: 'term10.db' } },
config.connections.mepwatch.settings.connection.filename = "./data/term10.db";
console.log(config.connections.mepwatch);

module.exports = config.connections.mepwatch.settings;
