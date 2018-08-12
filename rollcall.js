const fs = require('fs');
const csv = require('fast-csv');
const zlib = require("zlib");
const XmlStream = require('xml-stream');
const {chain} = require("stream-chain");

var config ={ "folder": "./data/" };

promises = [];
var total={};

var mep_rollcall=streamCSV("./data/mep_rollcall.csv","mepid,mep,result,group,identifier");
var item_rollcall=streamCSV("./data/item_rollcall.csv","identifier,date,desc,for,against,abstention,secret");

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
    var unzip=zlib.createGunzip({flush:zlib.Z_SYNC_FLUSH,finishFlush: zlib.Z_SYNC_FLUSH});
    unzip
      .setEncoding('utf8')
      .on('error',(err)=>{
        console.log('unzip error',err);
        this.emit('error', err);
    });
    var xml = new XmlStream(
      fs.createReadStream(file)
      //.pipe(zlib.createGunzip())
      .pipe(unzip)
    )
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
      console.log('error',err);
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
      vote.pop("desc");
      "for,against,abstention,secret".split(",").map((result)=>{
        vote.pop(result);
      });
    });
    xml.on ("updateElement: RollCallVote.Description.Text",(i) =>{
      vote.push("desc",i.a? i.a.$.$text + " " +i.$text: i.$text);
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
      console.log ("WTF updateElement: Member.Name");
      process.exit(1);
    });
    
    xml.on ("end",()=>{
////      console.log("xmlend");
      resolve()});
  });

}
