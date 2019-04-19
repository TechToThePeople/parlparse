const fs = require('fs');
const csv = require('fast-csv');
const zlib = require("zlib");
const XmlStream = require('xml-stream');
const {chain} = require("stream-chain");

var config ={ "folder": "./data/" };

promises = [];
var total={};

var attendance=streamCSV("./data/mep_attendance.csv");
promises.push(new Promise((resolve, reject) => {
  attendance.on("close",() => resolve);
}));


function streamCSV(file){
  const head = "status,id,name,date".split(",");
  const csvwriter = require('csv-write-stream')({separator:",",headers: head,sendHeaders:true});


  function row (d){
    return d;
  };
  const pipeline = chain([
    row,
    csvwriter,
    fs.createWriteStream(file)
  ]);
  pipeline.on("close", () => console.log("close" +file));
  return pipeline;
};


csv.fromPath("./data/attendance.csv", {headers: true})
  .on("data", function(d){
    if (!d.extensions.includes("xml")){
      console.log ("xml unpublished: " + d.reference);
      return;
    }
    var p=transformFile(d);
    promises.push(p);
  })
  .on("end", ()=>{
    
    Promise
      .all(promises)
      .catch((err) =>{
        console.log(err);
      })
      .then(() => {
        console.log("all processed:");
        for (var i in total) {
          console.log (i +":"+total[i]);
         };
        attendence.close();
      });
  });

function transformFile(d){
  const file = "./data/"+ d.code +"/" + d.baseurl.split('/').pop() + ".xml.zip";
  if (!fs.existsSync(file)) {
    console.error("file missing "+file);
    return;
  }
  return new Promise((resolve, reject) => {
    var xml = new XmlStream(
      fs.createReadStream(file)
      .pipe(zlib.createGunzip())
    )
    //xml.on("data",(d)=>{console.log(d)});
    xml.on ("updateElement: Attendance.Participant.Name",(row)=>{
      var t={
        status:"attended"
        ,id:row['$']['MEP.Identifier']
        ,name:row.$text
        ,date:d.date
      };
      attendance.write(t);
//      { '$': { 'MEP.Identifier': '96837' },'$text': 'Kammerevert','$name': 'Attendance.Participant.Name' }
    });
    xml.on ("updateElement: Attendance.Excused.Name",(row)=>{
      var t={
        status:"excused"
        ,id:row['$']['MEP.Identifier']
        ,name:row.$text
        ,date:d.date
      };
      attendance.write(t);
    });
    xml.on ("end",()=>{
      resolve()});
  });

}
