// Normalise the requested_by strings imported before the writer did it:
// "ECR\nPfE, ECR" -> "ECR, PfE", "S&D, Verts/ALE:" -> "S&D, Verts/ALE".
const ROWS_PER_UPDATE = 500;

function normalizeRequestedBy(raw) {
  if (!raw) return null;
  const seen = [];
  for (const part of String(raw).split(/[,\n]/)) {
    const group = part.trim().replace(/:+$/, "").trim();
    if (group && !seen.includes(group)) seen.push(group);
  }
  return seen.length ? seen.join(", ").slice(0, 255) : null;
}

exports.up = async function (knex) {
  const distinct = await knex("rollcalls")
    .whereNotNull("requested_by")
    .distinct("requested_by");

  let updated = 0;
  for (const { requested_by: raw } of distinct) {
    const clean = normalizeRequestedBy(raw);
    if (clean === raw) continue;
    const ids = await knex("rollcalls").where("requested_by", raw).pluck("id");
    for (let i = 0; i < ids.length; i += ROWS_PER_UPDATE) {
      updated += await knex("rollcalls")
        .whereIn("id", ids.slice(i, i + ROWS_PER_UPDATE))
        .update({ requested_by: clean });
    }
  }

  // NULL requested_by marks rows from the RCV-XML importer; re-running
  // `node openapi/plenary.js --all` fills them in place (same ids).
  console.log(
    `normalize_requested_by: ${distinct.length} distinct values, ${updated} rows updated`
  );
};

exports.down = function () {
  // not reversible: the original spacing/newlines are gone.
};
