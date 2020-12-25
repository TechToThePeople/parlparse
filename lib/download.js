const fs = require("fs");
const https = require("https");
const urlParse = require("url").parse;
const csv = require("@fast-csv/format");
const zlib = require("zlib");

https.globalAgent.maxSockets = 8;

var config = { folder: "./data/" };

const downloadFile = (folder, url, file) => {
  const headers = { "Accept-Encoding": "gzip" };
  config.file = file;

  return new Promise((resolve, reject) => {
    folder = config.folder + folder;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    if (!fs.existsSync(config.folder + "tmp")) {
      fs.mkdirSync(config.folder + "tmp");
    }
    var dest = folder + "/" + config.file + ".xml.zip";
    if (fs.existsSync(dest)) {
      console.log("already downloaded file:" + dest);
      //do we need to return that it was cached already?
      resolve({ date: config.file, url: url + ".xml" });
      return;
    } else {
      console.log("downloading file:" + dest);
    }

    const tmpDest = config.folder + "tmp" + config.file;
    var file = fs.createWriteStream(tmpDest);
    var options = urlParse(url + ".xml");
    options.headers = headers;
    var request = https
      .get(options, function (res) {
        const { statusCode } = res;
        const contentType = res.headers["content-type"];
        if (statusCode !== 200) {
          error = new Error(
            "Request Failed. " + url + ".xml" + `Status Code: ${statusCode}`
          );
          res.resume();
          fs.unlink(tmpDest, () => reject(error));
          return;
        }

        if (res.headers["content-encoding"] !== "gzip") {
          res = res.pipe(zlib.createGzip());
        }
        res.pipe(file);
        file.on("finish", function () {
          file.close(() => {
            fs.renameSync(tmpDest, dest);
            resolve({ date: config.file, url: url + ".xml" });
          });
        });
      })
      .on("error", (err) => {
        // Handle errors
        fs.unlinkSync(dest);
        reject(err);
      });
  });
};

module.exports = downloadFile;

//export default downloadFile;
