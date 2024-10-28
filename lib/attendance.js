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

//knex('coords').insert([{x: 20}, {y: 30},  {x: 10, y: 20}])
//1|status|varchar(255)|0||0
//2|mep_id|INTEGER|0||0
//3|date|date|1||0

const addParticipant = async (participant, sittingId, status) => {
  await db("attendances").insert({
    sitting_id: sittingId,
    mep_id: participant,
    status: status,
  });
};

const rmParticipants = async (sittingId) => {
  await db("attendances").where("sitting_id", sittingId).del();
};

const processAttendanceList = async (plenary, options) => {
  const force = options.force;
  let xml = "";
  const fileContents = fs.createReadStream(
    "./data/LP/" + plenary.date + ".xml.zip"
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
          const rcvresult = d["PV.AttendanceRegister"];
          const sitting = {
            date: rcvresult.$["Sitting.Date"],
            id: +rcvresult.$["Sitting.Identifier"],
          };
          const plenary = await db("plenaries")
            .where("date", sitting.date)
            .select("id", "date", "sitting_id")
            .first();
          if (!plenary) {
            console.log("sitting without RCVs", sitting.date);
            return reject();
          }
          if (plenary && plenary.sitting_id) {
            if (!force) {
              console.log("already processed", sitting.date);
              return reject();
            } else {
              console.log("already processed, process again", sitting.date);
              await rmParticipants(sitting.id);
            }
          }
          const r =
            d["PV.AttendanceRegister"]["Attendance.Participant.Name"] || [];
          const participants = r.map((d) => +d.$["MEP.Identifier"]);
          for (let participant of participants) {
            await addParticipant(participant, sitting.id, "attended");
          }
          const e = d["PV.AttendanceRegister"]["Attendance.Excused.Name"] || [];
          const excused = e.map((d) => +d.$["MEP.Identifier"]);
          for (let participant of excused) {
            await addParticipant(participant, sitting.id, "excused");
          }
          await db("plenaries")
            .where("id", plenary.id)
            .update({ sitting_id: sitting.id });
          console.log("done");
          return resolve({
            participant: participants.length,
            excused: excused.length,
          });
        });
      });
  });
};

module.exports = processAttendanceList;
