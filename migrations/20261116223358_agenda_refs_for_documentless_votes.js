// The last 84 votes with no reference are procedure: "Request by The Left Group"
// on Wednesday's agenda, requests for an urgent decision, adjournment motions,
// approvals without vote. They come from `<vote type="EUGI">` blocks (dvId
// "000001"), which carry no document at all — the "document" is the sitting's
// agenda.
//
// Grouped per sitting day rather than per month: the 37 days below fall into 22
// months, and a month can hold two separate part-sessions (e.g. 2025-03-10/12/13
// and 2025-03-31 are different sittings), so `agenda-YYYY-MM` would merge votes
// that have nothing to do with each other.
exports.up = async function (knex) {
  const rows = await knex("rollcalls")
    .whereNull("ref")
    .select("id", "date", "plenary");

  const reports = new Set();
  let updated = 0;
  for (const row of rows) {
    const day = String(row.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const reference = `agenda-${day}`;
    await knex("rollcalls").where("id", row.id).update({ ref: reference });
    updated++;
    reports.add(reference);
  }

  for (const reference of reports) {
    const existing = await knex("reports")
      .where("reference", reference)
      .first();
    if (existing) continue;
    await knex("reports").insert({
      reference,
      title: `Agenda of the sitting of ${reference.slice("agenda-".length)}`,
    });
  }

  console.log(
    `rollcalls.ref: ${updated} procedural votes given ${reports.size} agenda-<day> references`
  );
};

exports.down = async function (knex) {
  const refs = await knex("reports")
    .where("reference", "like", "agenda-%")
    .pluck("reference");
  await knex("reports").whereIn("reference", refs).del();
  await knex("rollcalls").whereIn("ref", refs).update({ ref: null });
};
