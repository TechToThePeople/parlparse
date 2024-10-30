const fs = require("fs");
const zlib = require("zlib");
const xml2js = require("xml2js");
const db = require("./db.js");
const { isMep, addMep } = require("./mep.js");
const log = require("./log.js");
const term = 10;
const parser = new xml2js.Parser({
  //  tagNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())],
  //  attrNameProcessors:[d => (d.replaceAll(".","_").toLowerCase())]
});

const getVote = async (date) => {
  const vote = await db("votes").select("id").where({ date: date }).first();
  console.log("vote", vote);
  return vote?.id || undefined;
};

const processVoting = async (voting, voteId) => {
  const v = {
    id: +voting.$.votingId,
    type: voting.$.type,
    result_type: voting.$.resultType?.toLowerCase(),
    title: voting.title[0]
      ? voting.title.join(",")
      : voting.amendmentSubject?.join(","),
    result: voting.$.result,
    date: new Date(voting.$.voteTimestamp),
    author: voting.amendmentAuthor?.join(","),
    vote_id: voteId,
  };
  const r = await db("votings").insert(v).onConflict("id").merge();
  if (!v.title) console.log(v);
};

const processVote = async (v2, sitting) => {
  const v = {
    id: +v2.$.dlvId,
    type: v2.$.type,
    title: v2.title?.join(","),
    date: sitting.date,
    updated: sitting.updated,
    label: v2.label,
  };
  //  votings: [ { voting: [Array] } ],
  //  remarks: [ { remark: [Array] } ],
  //  documents: [ { document: [Array] } ]
  const plenary = await db("plenaries")
    .select("id")
    .where({ date: v.date })
    .first();
  v.plenary_id = plenary?.id;
  let vote = await db("votes").insert(v).onConflict("id").ignore();
  if (!vote[0]) {
    vote[0] = await getVote(v.date);
  }
  let count = 0;
  for (let v3 of v2.votings) {
    for (let v4 of v3.voting) {
      await processVoting(v4, vote[0]);
      count++;
    }
  }
  return count;
};

const processVotes = async (plenary, options) => {
  const force = options.force;
  let xml = "";
  const fileContents = fs.createReadStream(
    "./data/VOT/" + plenary.date + ".xml.zip"
  );
  const unzip = zlib.createGunzip();
  fileContents.pipe(unzip);
  return new Promise(async (resolve, reject) => {
    unzip
      .on("data", (d) => {
        xml += d.toString();
      })
      .on("end", () => {
        parser.parseString(xml, async (err, d) => {
          let results = { votes: 0, votings: 0 };
          for (let votes of d.file.sitting) {
            const sitting = {
              date: votes.$.date.substring(0, 10),
              updated: votes.$.lastUpdate,
            };
            const plenary = await db("plenaries")
              .where("date", sitting.date)
              .select("id", "date", "sitting_id")
              .first();
            if (!plenary) {
              console.log("sitting without RCVs", sitting.date);
              return reject();
            }
            if (await getVote(sitting.date)) {
              // TODO: find way to match
              if (!force) {
                console.log("already processed", sitting.date);
                return reject();
              } else {
                console.log("already processed, process again", sitting.date);
              }
            }
            for (let _vote of votes.votes) {
              for (let v2 of _vote.vote) {
                const result = await processVote(v2, sitting);
                results.votes++;
                results.votings += result;
              }
            }
          }
          return resolve(results);
        });
      });
  });
};

module.exports = processVotes;
