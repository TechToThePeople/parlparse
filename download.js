const fs = require('fs');
const http = require('http');
const urlParse = require('url').parse;
const csv = require('fast-csv');
const zlib = require("zlib");

http.globalAgent.maxSockets = 8;

var config ={ "folder": "./data/" };

promises = [];
const file="./data/"+"rollcall.csv";
var total=0;

csv.fromPath(file, {headers: true})
  .on("data", function(d){
    if (!d.extensions.includes("xml")){
      console.log ("xml unpublished: " + d.reference);
      return;
    }
    var p=downloadFile(d.code,d.baseurl,"xml");
    p.catch((err)=>{
      console.log("got an error");
      console.log(arguments);
    });
    promises.push(p);
    //promises.push(downloadFile(d.code,d.baseurl,"xml"));
  })
  .on("end", ()=>{});

promises.map ((p)=>p.then(console.log).catch(console.log));

Promise
  .all(promises)
  .catch((err) =>{
    console.log(err);
  })
  .then(() => {
    console.log("all processed:" + total)
  });


function downloadFile (folder,url,extension){
  const headers = {'Accept-Encoding': 'gzip'};
  return new Promise((resolve, reject) => {
    folder = config.folder + folder;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    var dest = folder+ "/"+ url.split('/').pop() + "."+extension +".zip";
    if (fs.existsSync(dest)) {
      console.log ("cached file:"+dest);
      total ++;
      resolve(url);
      return;
    }
    console.log ("downloading file:"+dest);

    var file = fs.createWriteStream(dest);
    var options= urlParse(url +"."+extension);
    options.headers=headers;
    var request = http.get(options, function(res) {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];
      if (statusCode !== 200) {
        error = new Error('Request Failed. '+url+"."+extension +`Status Code: ${statusCode}`);
        res.resume();
        fs.unlink(dest,()=> reject(error));
        return; 
      }

      if(res.headers['content-encoding'] !== 'gzip'){
        res=res.pipe(zlib.createGzip());
      }
      res.pipe(file);
      file.on('finish', function() {
        total ++;
        file.close(()=>resolve(url)); 
      });
    }).on('error', (err) => { // Handle errors
      fs.unlinkSync(dest);
      reject(err);
    });
  });
};
