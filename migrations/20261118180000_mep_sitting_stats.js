// How many roll-calls a MEP could have taken part in, and how many they did.
//
// One row per MEP per sitting, only for sittings whose attendance list has been
// imported: presence is a daily register, so "could have taken part" is the RCVs
// held that day. status separates the three cases the totals need:
//
//   attended  present all day        → rcv_held counts, rcv_voted may be < held
//   excused   authorised absence     → rcv_held is recorded but not counted
//   absent    no row in the register → not present, nothing voted
exports.up = async function (knex) {
  await knex.schema.createTable("mep_sitting_stats", function (table) {
    table.integer("mep").notNullable(); // meps.id
    table.integer("plenary").notNullable(); // plenaries.id
    // attended | excused     the register says so
    // present_unregistered   no register row, but positions has votes: they were
    //                        there (the register is not complete)
    // absent                 no register row and no vote
    table.string("status", 20).notNullable();
    table.integer("rcv_held").notNullable().defaultTo(0);
    table.integer("rcv_voted").notNullable().defaultTo(0);
    table.datetime("updated_at").defaultTo(knex.fn.now());
    table.primary(["mep", "plenary"]);
    table.index(["plenary"]);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("mep_sitting_stats");
};
