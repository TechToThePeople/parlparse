const fs = require('fs');
const csv = require('fast-csv');
const zlib = require("zlib");
const XmlStream = require('xml-stream');
const {chain} = require("stream-chain");

var config ={ "folder": "./data/" };

promises = [];
var total={};

if (process.argv.length == 3) {
  var file=process.argv[2];
  console.log ("parsing " +file +" into /tmp");
  config.folder = "/tmp/";
}


var mep_rollcall=streamCSV(config.folder +"mep_rollcall.csv","mepid,mep,result,group,identifier");
var item_rollcall=streamCSV(config.folder+"item_rollcall.csv","identifier,date,report,desc,title,for,against,abstention");

promises.push(new Promise((resolve, reject) => {
  item_rollcall.on("close",() => resolve);
}));

promises.push(new Promise((resolve, reject) => {
  mep_rollcall.on("close",() => resolve);
}));

function streamCSV(file,column){
  const head = column.split(",");
  const csvwriter = require('csv-write-stream')({separator:",",headers: head,sendHeaders:true});


  function row (d){
//    console.log(d)
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

var csvParser= csv.fromPath("./data/rollcall.csv", {headers: true})
  .on("data", function(d){

    if (!d.extensions.includes("xml")){
      console.log ("xml unpublished: " + d.reference);
      return;
    }
    promises.push(transformFile(d));
//    csvParser.pause();
//    csvParser.emit("end");
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
        mep_rollcall.close();
        item_rollcall.close();
      });
  });

function transformFile(d){
  const file = "./data/"+ d.code +"/" + d.baseurl.split('/').pop() + ".xml.zip";
  return new Promise((resolve, reject) => {
    var re_report =/A8-\d{4}\/\d{4}/;
    var re_motion =/[RC-]B8-\d{4}\/\d{4}/;
    var unzip=zlib.createGunzip({flush:zlib.Z_SYNC_FLUSH,finishFlush: zlib.Z_SYNC_FLUSH});
    unzip
      .setEncoding('utf8')
      .on('error',(err)=>{
        console.log('unzip error file '+file,err);
        this.emit('error file '+file, err);
    });
    var xml = new XmlStream(
      fs.createReadStream(file)
      //.pipe(zlib.createGunzip())
      .pipe(unzip)
    );

    //xml.on("data",(d)=>{console.log(d)});
    var vote= {
      push: function (k,v) {
        if (this[k]) {console.log(this);console.error("value for "+k+ " already set to "+ this[k]);}
        this[k] = v;
      },
      pop: function (k) {
        this[k]= null;
      }
    }
    //vote.pull ("url");
    vote.push ("url",d.baseurl+".xml");

    xml.on ("error",(err)=>{
      console.log('error '+file,err);
      reject(err);
    });
    xml.on ("startElement: RollCallVote.Result",(result)=>{
      vote.push("identifier",result.$.Identifier);
      vote.push("date",result.$.Date);
//      console.log (">"+vote.date);
    });
    xml.on ("endElement: RollCallVote.Result",(result)=>{
//      console.log ("<"+vote.date);
      item_rollcall.write(vote);
      vote.pop("identifier");
      vote.pop("date");
      vote.pop("report");
      vote.pop("desc");
      vote.pop("title");
      "for,against,abstention,secret".split(",").map((result)=>{
        vote.pop(result);
      });
    });
    xml.on ("updateElement: RollCallVote.Description.Title",(i) =>{
      console.log(i);
      vote.push("title",i.$text);
    });
    xml.on ("updateElement: RollCallVote.Description.Text",(i) =>{
      if (i.a){ 
        vote.report = i.a.$text;
      }
      var doc=re_report.exec(i.$text);
      if (doc) {
        i.$text=i.$text.replace(doc[0]+" - ","");
        vote.report = doc[0];
      } else {
        var doc=re_motion.exec(i.$text);
        if (doc) {
          i.$text=i.$text.replace(doc[0]+" - ","");
//          if (doc[0].startsWith("RC-")) { //the "normal"
//            vote.report = doc[0].substring(3); //remove RC-
//          }
        }
      }
      if (i.$text.charAt(0) == '-')
        i.$text = i.$text.substring(1);
      vote.push("desc", i.$text.trim());
      //reports start with "A8-0054/2017 -" or mandate with "RC-B8-0245/2017 -"
//      console.log (" "+vote.desc);
    });
    "For,Against,Abstention,Secret".split(",").map((result)=>{
      xml.on ("startElement: Result."+result,(i) =>{
        vote.push("result",i.$name.split(".").pop().toLowerCase());
        vote.push("total",+i.$.Number);
        vote.push(i.$name.split(".").pop().toLowerCase(),i.$.Number);
        vote.push("processed",0);
//        console.log (" >"+vote.result + "="+i.$.Number);
      })
      xml.on ("endElement: Result."+result,(i) =>{
        if (vote.processed != vote.total && vote.total != 0) {
          console.log (vote.date + " for "+ vote.identifier+" error processed "+ vote.processed +"/"+vote.total + " at" + vote.url);
//          process.exit(1);
        }
        vote.pop("result");
        vote.pop("total");
        vote.pop("processed");
      })
    });
    xml.on ("startElement: Result.PoliticalGroup.List",(i) =>{
      vote.push("group",i.$.Identifier);
    })
    xml.on ("endElement: Result.PoliticalGroup.List",(i) =>{
      vote.pop("group");
    })
    xml.on ("updateElement: PoliticalGroup.Member.Name",(mep)=>{
      vote.processed++;
      var t={mepid:mep.$.MepId,mep:mep.$text};
      ["result","group","identifier","date","desc"].map((i)=>{//group not mandatory, more QA
        t[i]=vote[i];
      });
      mep_rollcall.write(t);
    })
    xml.on ("updateElement: Member.Name",(mep)=>{
      console.log(vote);
      console.log(mep);
      console.log ("WTF updateElement: Member.Name "+ mep.$text+" on " +d.reference);
      vote.processed++;
      var t={mepid:mep.$.MepId,mep:mep.$text};
      ["result","group","identifier","date","desc"].map((i)=>{//group not mandatory, more QA
        t[i]=vote[i];
      });
      mep_rollcall.write(t);
      //process.exit(1);
    });
    
    xml.on ("end",()=>{
////      console.log("xmlend");
      resolve()});
  });

}
