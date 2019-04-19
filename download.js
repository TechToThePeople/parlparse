const fs = require('fs');
const http = require('http');
const urlParse = require('url').parse;
const csv = require('fast-csv');
const zlib = require("zlib");

http.globalAgent.maxSockets = 8;

var config ={ "folder": "./data/" };

promises = [];
var total={};

["rollcall.csv","attendance.csv"].map ((file)=>{ //ignore the votes for now, the format is just that bad
total[file]=0;
csv.fromPath("./data/"+file, {headers: true})
  .on("data", function(d){
    if (!d.extensions.includes("xml")){
      console.log ("xml unpublished: " + d.reference +" " + d.baseurl + d.reference + ".xml");
      return;
    }
    var p=downloadFile(d.code,d.baseurl,"xml");
    p.catch((err)=>{
      console.log("got an error");
      console.log(arguments);
    });
    promises.push(p);
    p.catch(console.log).then(() => {
      total[file]++;
    });
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
      });
  });
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
      console.log ("already downloaded file:"+dest);
      //do we need to return that it was cached already?
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
        file.close(()=>resolve(url)); 
      });
    }).on('error', (err) => { // Handle errors
      fs.unlinkSync(dest);
      reject(err);
    });
  });
};
