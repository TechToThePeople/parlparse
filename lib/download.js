const fs = require("fs");
const https = require("https");
const zlib = require("zlib");
const log = require("./log.js");

https.globalAgent.maxSockets = 8;

var config = { folder: "./data/" };

const downloadFile = (folder, url, opt = { force: false }, c = 0) => {
  // the EP answers 403 to a bare GET (no user-agent) on both doceo and the
  // data.europarl.europa.eu distributions
  const headers = {
    "Accept-Encoding": "gzip",
    Accept: "text/xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  };
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
    console.log("exists?", dest);
    if (fs.existsSync(dest)) {
      config.size = fs.statSync(dest).size;
      if (!opt.force) {
        resolve({ date: config.file, url: url + ".xml", fresh: false });
        return;
      }
    }

    const tmpDest = config.folder + "tmp/" + config.file;
    let target;
    try {
      target = new URL(url + ".xml");
    } catch {
      return reject(new Error("invalid url: " + url + ".xml"));
    }
    https
      .get(target, { headers }, function (res) {
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
        const file = fs.createWriteStream(tmpDest);
        res.pipe(file);
        file.on("finish", function () {
          file.close(() => {
            const size = fs.statSync(tmpDest).size;
            if (size !== config.size) {
              fs.renameSync(tmpDest, dest);
            } else {
              fs.unlinkSync(tmpDest);
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
        if (c < 3 && err.code === "ECONNRESET")
          return (
            log.warn("retry %d: %s ", ++c, url),
            downloadFile(folder, url, opt, c).then(resolve).catch(reject)
          );

        // Handle errors
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
};

module.exports = downloadFile;

//export default downloadFile;
