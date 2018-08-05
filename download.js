const fs = require('fs');
const http = require('http');
const urlParse = require('url').parse;
const csv = require('fast-csv');
const zlib = require("zlib");

http.globalAgent.maxSockets = 15;

var config ={ "folder": "./data/" };

promises = [];
const file="./data/"+"rollcall.csv";
var total=0;

csv.fromPath(file, {headers: true})
  .on("data", function(d){
    var p=downloadFile(d.code,d.baseurl,"xml");
    p.catch(console.log);
    promises.push(p);
    //promises.push(downloadFile(d.code,d.baseurl,"xml"));
  })
  .on("end", function(){
});

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
    console.log ("file:"+dest);
    if (fs.existsSync(dest)) {
      total ++;
      resolve(url);
    }

    var file = fs.createWriteStream(dest);
    var options= urlParse(url +"."+extension);
    options.headers=headers;
    var request = http.get(options, function(res) {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];
      if (statusCode !== 200) {
        error = new Error('Request Failed. '+url +'\n' +
                        `Status Code: ${statusCode}`);

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
    }).on('error', function(err) { // Handle errors
      fs.unlink(dest);
      reject(err);
    });
  });
};
