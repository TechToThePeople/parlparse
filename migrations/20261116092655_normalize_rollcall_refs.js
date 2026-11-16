// `rollcalls.ref` is built from several sources and is not always a document
// reference: "Wednesday's agenda", "Draft general budget … 2026", "C10-0119/2024"
// (a Commission proposal, which the OpenAPI does not publish as a document), and
// a few with an en dash instead of a hyphen ("A10–0008/2024").
//
// Keep only what looks like a document reference the reports table can join on;
// the readable text already sits in `rollcalls.name`.
const REF = /^(?:RC-)?[AB]\d+-\d+\/\d{4}(?:\/REV\d+)?$/;

exports.up = async function (knex) {
  const rows = await knex("rollcalls").whereNotNull("ref").select("id", "ref");
  let nulled = 0;
  let cleaned = 0;

  for (const row of rows) {
    const normalised = String(row.ref)
      .replace(/\u2013/g, "-")
      .trim();
    if (!REF.test(normalised)) {
      await knex("rollcalls").where("id", row.id).update({ ref: null });
      nulled++;
    } else if (normalised !== row.ref) {
      await knex("rollcalls").where("id", row.id).update({ ref: normalised });
      cleaned++;
    }
  }

  console.log(`rollcalls.ref: ${cleaned} normalised, ${nulled} set to NULL`);
};

exports.down = function () {
  // the dropped values were not references; nothing to restore them from.
};
