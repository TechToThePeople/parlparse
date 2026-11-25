module.exports = () => ({
  defaultConnection: "live",
  _defaultConnection: "live",
  connections: {
    mepwatch: {
      connector: "bookshelf",
      settings: {
        client: "sqlite3",
        connection: {
          filename: "data//term10.db",
        },
      },
      options: {
        useNullAsDefault: true,
      },
    },
    live: {
      connector: "bookshelf",
      settings: {
        client: "pg",
        database: "greenvote",
        username: "greenvote",
        password: "nefw-orxa",

        connection: "postgres://greenvote:nefw-orxa@localhost:5432/greenvote",
      },
      options: {
        useNullAsDefault: true,
      },
    },
  },
});
