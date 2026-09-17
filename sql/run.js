#!/usr/bin/env node
// Run the SQL scripts in sql/ in the right order and emit CSVs into data/.
//
// Order matters: updatemajority.sql repopulates `groupmajority`, and the
// report queries (cohesion, cordon, cordon-report, cordon-total) all read from
// it, so it must run first.

const fs = require("fs");
const path = require("path");
const { format } = require("@fast-csv/format");
const signale = require("signale");
const db = require("../lib/db.js");

// Each step: the .sql file to run relative to this script, and (optionally) the
// CSV file to write its result set into relative to the repo root.
const steps = [
  { sql: "updatemajority.sql" }, // write (DELETE + INSERT), no CSV
  { sql: "cohesion.sql", csv: "data/cohesion.csv" },
  { sql: "cordon.sql", csv: "data/cordon.csv" },
  { sql: "cordon-report.sql", csv: "data/cordon-report.csv" },
  { sql: "cordon-total.sql", csv: "data/cordon-total.csv" },
];

// Split a SQL file into individual statements. The sqlite3 driver only runs the
// first statement of a multi-statement raw() call, so statements separated by
// semicolons must be executed one at a time. This is a naive splitter that
// treats any `;` at end-of-line (after trimming) as a statement boundary, which
// is sufficient for the bundled scripts (no semicolons in string literals).
function splitStatements(sql) {
  const acc = { statements: [], current: [] };
  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    acc.current.push(line);
    if (trimmed.endsWith(";")) {
      acc.statements.push(acc.current.join("\n"));
      acc.current = [];
    }
  }
  if (acc.current.length > 0) {
    acc.statements.push(acc.current.join("\n"));
  }
  return acc.statements;
}

function writeCsv(filePath, rows, headers) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    if (rows.length === 0) {
      const cols = headers && headers.length ? headers : [];
      const headerLine = cols.join(",") + "\n";
      fs.writeFileSync(filePath, headerLine);
      signale.info("written (empty)", filePath, "0 rows");
      return resolve(0);
    }

    const headerRow =
      headers && headers.length ? headers : Object.keys(rows[0]);
    const writeStream = fs.createWriteStream(filePath);
    const csvStream = format({ headers: headerRow });
    csvStream.pipe(writeStream).on("finish", () => {
      signale.success("written", filePath, `${rows.length} rows`);
      resolve(rows.length);
    });
    csvStream.on("error", reject);
    rows.forEach((row) => csvStream.write(row));
    csvStream.end();
  });
}

async function main() {
  const dir = __dirname;
  for (const step of steps) {
    const sqlFile = path.join(dir, step.sql);
    const sql = fs.readFileSync(sqlFile, "utf8");
    signale.info("running", step.sql);

    const statements = splitStatements(sql);
    let lastRows = [];
    let lastFields = [];
    for (const statement of statements) {
      const result = await db.raw(statement);
      // sqlite3 returns { rows, fields } for SELECT; pg returns an array/result.
      const rows = result && result.rows ? result.rows : result || [];
      if (rows.length > 0 || (result && result.fields)) {
        lastRows = rows;
        lastFields =
          result && result.fields ? result.fields.map((f) => f.name) : [];
      }
    }

    if (step.csv) {
      await writeCsv(
        path.resolve(dir, "..", step.csv),
        lastRows,
        lastFields.length ? lastFields : undefined
      );
    }
  }
  signale.complete("all SQL scripts executed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    signale.error(err);
    process.exit(1);
  });
