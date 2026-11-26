/**
 * Every pass can be limited to the sittings of one run: `openapi/update.js`
 * passes `dates`, a plain `--date`/`--days` does the same from the CLI.
 */
const list = (dates) =>
  Array.isArray(dates) ? dates.filter(Boolean) : dates ? [dates] : [];

/**
 * `substr(<column>, 1, 10) in (?, ?)` plus the bindings, or nothing at all.
 * `column` is the SQL expression, e.g. "r.date".
 */
function clause(column, dates) {
  const days = list(dates);
  if (!days.length) return { sql: "", bindings: [] };
  return {
    sql: ` and substr(${column}, 1, 10) in (${days.map(() => "?").join(", ")})`,
    bindings: days,
  };
}

module.exports = { list, clause };
