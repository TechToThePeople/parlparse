// The EP writes en and em dashes into what should be a hyphen ("A10–0008/2024"),
// and those rows never join against `reports.reference`, so their votes could not
// find the report document. `lib/refs.js` normalises on the way in now; this
// fixes what arrived before it did.
const COLUMNS = [
  ["rollcalls", "ref"],
  ["rollcalls", "doc_ref"],
  ["reports", "reference"],
  ["agenda_items", "report"],
];

exports.up = async function (knex) {
  for (const [table, column] of COLUMNS) {
    const rows = await knex(table)
      .whereNotNull(column)
      .where(column, "like", "%–%")
      .orWhere(column, "like", "%—%")
      .select("id", column);
    for (const row of rows) {
      const fixed = String(row[column])
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .trim();
      if (fixed && fixed !== row[column])
        await knex(table)
          .where("id", row.id)
          .update({ [column]: fixed });
    }
    if (rows.length)
      console.log(`${table}.${column}: ${rows.length} dash(es) fixed`);
  }
};

exports.down = function () {
  // nothing to restore: the dash was wrong
};
