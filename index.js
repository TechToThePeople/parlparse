'use strict';
const   fs = require("fs");
const osmosis = require('osmosis');
const {chain}  = require('stream-chain');


const options = {
//Minutes + rollcalls
  ppvp_url:"http://www.europarl.europa.eu/RegistreWeb/search/typedoc.htm?codeTypeDocu=PPVP&leg=8&lg=EN&currentPage=1&sortAndOrderBy=date_docu_desc",
  ppvd_url:"http://www.europarl.europa.eu/RegistreWeb/search/typedoc.htm?codeTypeDocu=PPVD&leg=8&lg=EN&currentPage=1&sortAndOrderBy=date_docu_desc",
  code: {
    RCV:"data/rollcall.csv"
   ,VOT:"data/vote.csv"
   ,LP:"data/attendance.csv"
   ,minute:"data/minute.csv"
   ,prov_minute:"data/prov_minute.csv"
   ,error:"data/error.csv"
  }
};

const pipes={};
for (var code in options.code) {
  pipes[code]=streamCSV(options.code[code]);
};

const promises= [];
/*for (var i in pipes) {
  var p = 
  promises.push(new Promise((resolve, reject) => {
    pipes[i].on("close", resolve);
  }));
}*/

promises.push(scrape(options.ppvp_url,pipes)); //provisional
promises.push(scrape(options.ppvd_url,pipes)); //finalised

Promise
  .all(promises)
  .then(() => { 
    for (var i in pipes) {
      pipes[i].end(); //closing
    }
    console.log("all finished")
  });

function streamCSV(file){
  const head = "date,code,reference,name,baseurl,extensions".split(",");
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

function scrape(docurl,pipes) {
return new Promise((resolve, reject) => {
  osmosis.get(docurl)
  .log(console.log)
.error(console.log)
    .paginate('.ep_boxpaginate a#nav_next',200)
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
    .data( d => {
      process.stdout.write(" ");

      if (pipes[d.code]) {
        pipes[d.code].write(d);
      }else{
        console.log(d);
        pipes['error'].write(d);
      }
    })
    .data( d => {
//      console.log(d);
    })
    
    .done (d => {
      console.log("done");
      resolve(docurl);
    });
});
};
