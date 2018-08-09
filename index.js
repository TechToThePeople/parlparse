'use strict';
const   fs = require("fs");
const osmosis = require('osmosis');
const {chain}  = require('stream-chain');


const options = {
//Minutes + rollcalls
  provisional:"http://www.europarl.europa.eu/RegistreWeb/search/typedoc.htm?codeTypeDocu=PPVP&leg=8&lg=FR&currentPage=1&sortAndOrderBy=date_docu_desc",
  finalised:"http://www.europarl.europa.eu/RegistreWeb/search/typedoc.htm?codeTypeDocu=PPVD&leg=8&lg=FR&currentPage=1&sortAndOrderBy=date_docu_desc",
  code: {
    RCV:"data/rollcall.csv"
   ,VOT:"data/vote.csv"
   ,LP:"data/attendance.csv"
   ,minute:"data/minute.csv"
   ,prov_minute:"data/prov_minute.csv"
   ,error:"data/error.csv"
  }
};

var buffer={};
var noxml=[];
for (var code in options.code) {
  buffer[code] = {};
}

const promises= [];
const pipes={};
for (var code in options.code) {
  pipes[code]=streamCSV(options.code[code]);
  promises.push(new Promise((resolve, reject) => {
    pipes[code].on("close",() => resolve);
  }));
}


scrape(options.finalised,(d)=>{
  d.status="final";
  if (buffer[d.code]) {
    if (!d.extensions.includes('xml'))
      noxml[d.date + d.code]=d;
    if (buffer[d.code][d.date] && buffer[d.code][d.date].reference !== d.reference){
      // yes, some documents are listed multiple times, because of reasons
      console.log ("multiple files for "+d.code+ " on "+d.date 
        +". ref:" + buffer[d.code][d.date].reference+ "<=>" + d.reference);
    }
    buffer[d.code][d.date]=d;
  }else{
    console.log(d);
    buffer['error'].push(d);
  }
})
.then(()=>{
  scrape(options.provisional,(d)=>{
    d.status="prov";
    if (!buffer[d.code][d.date]){ // better a prov than none
      buffer[d.code][d.date]=d;
      return;
    }
    if (d.extensions.includes('xml') && noxml[d.date + d.code]){ //replace the final without xml by a provisional with
      console.log("replace final without xml by provisional");
      console.log(d);
    }
  }).then(()=>{
    for (var b in buffer) {
      console.log(buffer[b]);
      for (var i in buffer[b]) {
        pipes[b].write(buffer[b][i]);
      }
    }

  });
  
});

Promise
  .all(promises)
  .then(() => { 
    for (var i in pipes) {
      pipes[i].end(); //closing
    }
    console.log("all finished")
  });

function streamCSV(file){
  const head = "date,code,status,reference,name,baseurl,extensions".split(",");
  const csvwriter = require('csv-write-stream')({separator:",",headers: head,sendHeaders:true});

  function row (d) {
    d.extensions = d.extensions.join("|");
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

function scrape(docurl,callback) {
return new Promise((resolve, reject) => {
  osmosis.get(docurl)
  .log(console.log)
.error(console.log)
    .paginate('.ep_boxpaginate a#nav_next',1000)
    .find('.notice')
    .set({
      'name':'.result_details_link',
      'date':'.date',
      'reference':'.reference[1]',
      'type':'.reference[2]',
      'urls':['.documents a@href']
    })
    .then((context, d) => {
      d.code= d.reference.slice(d.reference.lastIndexOf('(')+1,-1); //(VOT) (RCV) (LP)
      if(!d.code || d.code.indexOf(')') > -1 ) {
        switch(d.type) {
          case 'Provisional minutes - Plenary documents':
            d.code="prov_minute";
            break;
          case 'Finalised minutes - Plenary documents': 
            d.code="minute";
            break;
          default:
            console.log(d.type);
            d.code="error";
        }
      }
      d.date=d.date.slice(-10);
      d.extensions=[];
      d.urls.forEach((f)=>{
        d.baseurl=f.substr(0,f.lastIndexOf('.'));
        d.extensions.push(f.substr(f.lastIndexOf('.') + 1));
      });
      delete d.urls;

    })
    .data(callback)
    .done (d => {
      console.log("done");
      resolve(docurl);
    });
});
};
