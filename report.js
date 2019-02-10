'use strict';
const   fs = require("fs");
const osmosis = require('osmosis');
const {chain}  = require('stream-chain');


const options = {
//reports + motions(?)
  url:"http://www.europarl.europa.eu/plenary/en/texts-submitted.html",
  report:"http://www.europarl.europa.eu/plenary/en/texts-submitted.html?tabType=reports",
  motion:"http://www.europarl.europa.eu/plenary/en/texts-submitted.html?tabType=motions",
};

const promises= [];
const pipes={};
pipes['report']=streamCSV('data/text_tabled.csv');
promises.push(new Promise((resolve, reject) => {
  pipes['report'].on("close",() => resolve);
}));

/*
scrape(options.motion,"motion")
.then(()=>{
  console.log("scraped motions 8th term");
});

scrape(options.report,"report")
.then(()=>{
  console.log("scraped report 8th term");
});
*/
//scrape(options.report,"report")
////[2014,2013,2012,2010,2009].forEach (y => {
[2019,2018,2017,2015,2014,2013,2012,2011,2010,2009].forEach (y => {
/*  scrape(options.motion,{leg:7,refAYear:y},"motion")
  .then(()=>{
    console.log("scraped motions "+y);
  });
*/
  scrape(options.url,{tabActif:"tabResult",tabType:"reports",leg:7,refAYear:y},"report")
  .then(()=>{
    console.log("scraped report " +y);
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

function streamCSV(file,header){
  const head = "date,reference,type,title,rapporteur,committee,intra,oeil,doc".split(",");
  const csvwriter = require('csv-write-stream')({separator:",",headers: head,sendHeaders:true});

  function row (d) {
    d.rapporteur = d.rapporteur ? d.rapporteur.join("|") : "";
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

function scrape(docurl,param,type) {
function paginate(context,data){
  var next=context.doc().get(".zone_paginate .next_page@data-page");
  if (next)
    return {action:next.value()}
  return "404"; // todo: find a better way to done()
}

return new Promise((resolve, reject) => {
  param = param || {};
  osmosis.post(docurl,param)
//  .log(console.log)
.error(console.log)
    .paginate(paginate,10)
    .find('.notice')
    .set({
      'name':'.result_details_link',
      'date':'.date',
      'reference':'.reference[1]',
      'intra':'.reference[2]',
      'oeil':'.reference[2] a@href',
      'title':'.title a',
      'doc':'.title a@href',
      'committee':'.acronym_comdel',
      'rapporteur':'.rapporteurs'
      //'urls':['.documents a@href']
    })
    .then((context, d) => {
      d.type=type;
      d.date=d.date.slice(-10);
      if (d.rapporteur) {
        d.rapporteur=d.rapporteur.split(",");
        d.rapporteur.forEach((r,i) => {
          d.rapporteur[i]=r.trim();
        });
      }
      pipes['report'].write(d);
    })
    .done (d => {
      console.log("done");
      resolve(docurl);
    });
});
};
