const fs = require("fs");
const zlib = require("zlib");
const xml2js = require("xml2js");
const db = require("./db.js");
const { isMep, addMep } = require("./mep.js");

const parser = new xml2js.Parser({
  //  tagNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())],
  //  attrNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())]
});

const processRollCall = async (plenary) => {
  const formatPosition = async (vote, result, group, d) => {
    const id = +d.$.MepId;
    if (!isMep(id)) {
      console.log("missing MEP", id, d._);
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
      console.log("missing MEP", id, d._);
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
      if (e.code === db.errors.unique_failure) {
        //TODO Log duplicates and skip
        return;
      } else {
        console.error(e);
        process.exit(1);
      }
    }
  };

  const group = async (vote, result, g) => {
    let p = [];
    for (const d of g) {
      for (const e of d["PoliticalGroup.Member.Name"]) {
        const f = await formatPosition(vote, result, d.$.Identifier, e);
        p.push(f);
      }
    }
    try {
      if (p.length === 0) return;
      await db.batchInsert("positions", p, 200);
    } catch (e) {
      console.log(e);
    }
  };

  const vote = async (d) => {
    const v = {
      id: +d.$.Identifier,
      plenary: plenary.id,
      date: d.$.Date,
      name: d["RollCallVote.Description.Text"][0]._ || "",
      ref: d["RollCallVote.Description.Text"][0].a
        ? d["RollCallVote.Description.Text"][0].a[0]._
        : "???",
      for: +d["Result.For"][0].$.Number,
      against: +d["Result.Against"][0]["$"]["Number"],
      abstention: +d["Result.Abstention"][0]["$"]["Number"],
    };
    try {
      const dd = await db("rollcalls").insert(v).onConflict("id").ignore();
    } catch (e) {
      console.log(e);
    }

    try {
      await group(
        v.id,
        "for",
        d["Result.For"][0]["Result.PoliticalGroup.List"]
      );
    } catch (e) {
      console.log(e);
    }
    await group(
      v.id,
      "against",
      d["Result.Against"][0]["Result.PoliticalGroup.List"]
    );
    await group(
      v.id,
      "abstention",
      d["Result.Abstention"][0]["Result.PoliticalGroup.List"]
    );
  };

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
        // fs.writeFileSync('./data/rollcall.json', JSON.stringify(d));
        const r = d["PV.RollCallVoteResults"]["RollCallVote.Result"];
        for (const d of r) {
          await vote(d);
        }
        //          'RollCallVoteResults.Titles': [ { 'RollCallVoteResults.Title.Text': [Array] } ],
        //  'RollCallVote.Result'1
      });
    });
};

module.exports = processRollCall;
