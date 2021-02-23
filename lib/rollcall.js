const fs = require("fs");
const zlib = require("zlib");
const xml2js = require("xml2js");
const db = require("./db.js");
const { isMep, addMep } = require("./mep.js");
const log = require("./log.js");

const parser = new xml2js.Parser({
  //  tagNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())],
  //  attrNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())]
});

const processRollCall = async (plenary) => {
  const formatPosition = async (vote, result, group, d) => {
    const id = +d.$.MepId;
    if (!isMep(id)) {
      log.warn("missing MEP", id, d._);
      await addMep({
        eugroup: group,
        name: d._,
        vote_id: id,
      });
    }
    return {
      rollcall: vote,
      position: result,
      //      eugroup: group,
      mep_vote: id,
    };
  };

  const position = async (vote, result, group, d) => {
    const id = +d.$.MepId;
    if (!isMep(id)) {
      log.warn("missing MEP", id, d._);
      await addMep({
        eugroup: group,
        name: d._,
        vote_id: id,
      });
    }

    const r = {
      rollcall: vote,
      position: result,
      //      eugroup: group,
      mep_vote: id,
    };
    try {
      await db("positions").insert(r);
    } catch (e) {
      log.error(e);
      if (db.errors && e.code === db.errors.unique_failure) {
        //TODO Log duplicates and skip
        return;
      } else {
        log.error(e.code, e);
        process.exit(1);
      }
    }
  };

  const group = async (vote, result, g) => {
    let p = [];
    for (const d of g) {
      let key = "PoliticalGroup.Member.Name";
      if (!d[key] && d["Member.Name"]) {
        //formatting fuckup from the EP TOTALK
        key = "Member.Name";
      }
      for (const e of d[key]) {
        const f = await formatPosition(vote, result, d.$.Identifier, e);
        p.push(f);
      }
    }
    try {
      if (p.length === 0) return;
      await db.batchInsert("positions", p, 200);
    } catch (e) {
      if (db.errors && e.code === db.errors.unique_failure) {
        //TODO Log duplicates and skip
        log.warn("already inserted", d.$.Identifier);
        process.exit();
        return;
      }
      console.log(e);
      process.exit();
    }
  };

  const vote = async (d) => {
    let name,
      ref = null;
    if (d["RollCallVote.Description.Text"][0]._) {
      //normal ref
      name = d["RollCallVote.Description.Text"][0]._;
      ref = d["RollCallVote.Description.Text"][0].a[0]._;
    } else {
      name = d["RollCallVote.Description.Text"][0];
      if (
        name.startsWith("202") ||
        name.startsWith("C9-") ||
        name.startsWith("A9-") ||
        name.startsWith("COM")
      ) {
        const pos = d["RollCallVote.Description.Text"][0].indexOf(" ");
        ref = d["RollCallVote.Description.Text"][0].substr(0, pos);
        name = d["RollCallVote.Description.Text"][0].substr(pos + 1);
      }
    }
    if (name.trim().indexOf("-") === 0)
      name = name.trim().replace("-", "").trim();
    if (d["Result.Secret"]) {
      // special case of secret votes
      log.note("secret vote");
      const dd = await db("rollcalls")
        .insert({
          id: +d.$.Identifier,
          plenary: plenary.id,
          date: d.$.Date,
          name: name,
          ref: ref,
        })
        .onConflict("id")
        .ignore();
      return 0; // we processed, but it's not a rollcall
    }
    const v = {
      id: +d.$.Identifier,
      plenary: plenary.id,
      date: d.$.Date,
      name: name,
      ref: ref,
      for: d["Result.For"] ? +d["Result.For"][0].$.Number : 0,
      against: d["Result.Against"] ? +d["Result.Against"][0]["$"]["Number"] : 0,
      abstention: d["Result.Abstention"]
        ? +d["Result.Abstention"][0]["$"]["Number"]
        : 0,
    };
    try {
      //      const dd = await db("rollcalls").insert(v,['id']).onConflict("id").merge();

      const dd = await db("rollcalls").count("*").where("id", v.id);
      console.log(dd[0].count);
      if (parseInt(dd[0].count) === 1) {
        log.complete(ref || "vote", +d.$.Identifier, name);
        const positions = await db("positions")
          .count("*")
          .where("rollcall", v.id);
        positions[0].count = parseInt(positions[0].count);
        if (positions[0].count === v.for + v.against + v.abstention) {
          log.debug(
            "already processed",
            v.for + v.against + v.abstention,
            "positions"
          );
          return 0;
        }
        log.warn(
          "partial processing... expected",
          v.for + v.against + v.abstention,
          "instead of",
          positions[0].count
        );
        await db.delete().from("positions").where("rollcall", v.id);
        log.warn("deleted");
      } else {
        if (v.name.length > 255) {
          const s = v.name.split(" - ");
          v.name = s.pop() + " - " + s.pop();
        }
        const dd = await db("rollcalls").insert(v, ["id"]); //.onConflict("id").merge();
      }
    } catch (e) {
      log.error(e);
    }

    log.watch(ref || "vote", +d.$.Identifier, name);
    try {
      d["Result.For"] &&
        (await group(
          v.id,
          "for",
          d["Result.For"][0]["Result.PoliticalGroup.List"]
        ));
      d["Result.Against"] &&
        (await group(
          v.id,
          "against",
          d["Result.Against"][0]["Result.PoliticalGroup.List"]
        ));
      d["Result.Abstention"] &&
        (await group(
          v.id,
          "abstention",
          d["Result.Abstention"][0]["Result.PoliticalGroup.List"]
        ));
    } catch (e) {
      log.error(e);
    }
    return 1;
  };

  return new Promise(async (resolve, reject) => {
    let xml = "";
    const fileContents = fs.createReadStream(
      "./data/RCV/" + plenary.date + ".xml.zip"
    );
    const unzip = zlib.createGunzip();
    fileContents.pipe(unzip);
    unzip
      .on("data", (d) => {
        xml += d.toString();
      })
      .on("end", () => {
        parser.parseString(xml, async (err, d) => {
          const r = d["PV.RollCallVoteResults"]["RollCallVote.Result"];
          let processed = 0;
          for (const d of r) {
            processed += await vote(d);
          }

          resolve({ votes: r.length, added: processed });
        });
      });
  });
};

module.exports = processRollCall;
