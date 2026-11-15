// reports.term was never filled (NULL on every row), and the CLI used to take a
// flag such as --force as a report reference and insert it as a row.
//
// The term is the number after A/B in the reference: A10-0001/2024 -> 10,
// RC-B10-0324/2025/REV1 -> 10, A9-0162/2024 -> 9.
const REF = /^(?:RC-)?[AB](\d+)-/;

exports.up = async function (knex) {
  const rows = await knex("reports").select("id", "reference", "term");

  for (const row of rows) {
    const m = String(row.reference || "").match(REF);
    const term = m ? Number(m[1]) : null;
    if (term !== null && term !== row.term) {
      await knex("reports").where("id", row.id).update({ term });
    }
  }

  // Anything not shaped like a document reference and starting with a dash is a
  // flag that leaked through the CLI (e.g. "--force").
  const junk = await knex("reports")
    .where("reference", "like", "-%")
    .select("id", "reference");
  for (const row of junk) {
    console.log(`reports: deleting junk row #${row.id} (${row.reference})`);
    await knex("rollcalls").where("ref", row.reference).update({ ref: null });
    await knex("reports").where("id", row.id).del();
  }
};

exports.down = function () {
  // data cleanup: the junk row had no meaning and the terms were derivable.
};
