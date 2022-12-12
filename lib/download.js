const fs = require("fs");
const https = require("https");
const urlParse = require("url").parse;
const zlib = require("zlib");
const log = require("./log.js");

https.globalAgent.maxSockets = 8;

var config = { folder: "./data/" };

const downloadFile = (folder, url, opt = { force: false }, c = 0) => {
  const headers = { "Accept-Encoding": "gzip" };
  config.file = opt.file;
  return new Promise((resolve, reject) => {
    let _folder = config.folder + folder;
    if (!fs.existsSync(_folder)) {
      fs.mkdirSync(_folder);
    }
    if (!fs.existsSync(config.folder + "tmp")) {
      fs.mkdirSync(config.folder + "tmp");
    }
    var dest = _folder + "/" + config.file + ".xml.zip";
    if (fs.existsSync(dest)) {
      config.size = fs.statSync(dest).size;
      if (!opt.force) {
        resolve({ date: config.file, url: url + ".xml", fresh: false });
        return;
      }
    }

    const tmpDest = config.folder + "tmp/" + config.file;
    const file = fs.createWriteStream(tmpDest);
    const options = urlParse(url + ".xml");
    options.headers = headers;
    https
      .get(options, function (res) {
        const { statusCode } = res;
        if (statusCode !== 200) {
          const error = new Error(
            "Request Failed. " + url + ".xml" + `Status Code: ${statusCode}`
          );
          error.statusCode = statusCode;
          res.resume();
          fs.unlink(tmpDest, () => reject(error));
          return;
        }

        if (res.headers["content-encoding"] !== "gzip") {
          log.warn("downloding uncompressed file");
          res = res.pipe(zlib.createGzip());
        }
        res.pipe(file);
        file.on("finish", function () {
          file.close(() => {
            const size = fs.statSync(tmpDest).size;
            if (size !== config.size) {
              fs.renameSync(tmpDest, dest);
            }
            resolve({
              date: config.file,
              url: url + ".xml",
              fresh: size !== config.size,
            });
          });
        });
      })
      .on("error", (err) => {
        // retry if connection reset
        if (c <3 && err.code === "ECONNRESET") return log.warn("retry %d: %s ", ++c, url), downloadFile(folder, url, opt, c).then(resolve).catch(reject);
        // Handle errors
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
};

module.exports = downloadFile;

//export default downloadFile;
