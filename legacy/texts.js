"use strict";
const fs = require("fs");
const osmosis = require("osmosis");
const { chain } = require("stream-chain");

const options = {
  //reports + motions(?)
  //  url:"http://www.europarl.europa.eu/plenary/en/texts-submitted.html",
  report:
    "http://www.europarl.europa.eu/oeil/search/search.do?searchTab=y&q=documentEP:D-A8-????/????&snippet=true&noHeader=false&lang=en&dismax=y&all&limit=3000",
  motion:
    "http://www.europarl.europa.eu/oeil/search/search.do?searchTab=y&q=documentEP:D-B8-????/????&snippet=true&noHeader=false&lang=en&dismax=y&all&limit=4000",
};

const promises = [];
const pipes = {};
pipes["report"] = streamCSV("data/text_tabled.csv");
promises.push(
  new Promise((resolve, reject) => {
    pipes["report"].on("close", () => resolve);
  })
);

[2021, 2020, 2019, 2018, 2017, 2016, 2014].forEach((yy) => {
  scrape(options.report.replace("/????", "/" + yy), {}, "report").then(() => {
    console.log("scraped report 8th term " + yy);
  });
});
/*
 */
scrape(options.motion, {}, "motion").then(() => {
  console.log("scraped motions 8th term");
});

Promise.all(promises).then(() => {
  for (var i in pipes) {
    pipes[i].end(); //closing
  }
  console.log("all finished");
});

function streamCSV(file, header) {
  const head = "reference,type,name,rapporteur,committee,intra,oeil,doc".split(
    ","
  );
  const csvwriter = require("csv-write-stream")({
    separator: ",",
    headers: head,
    sendHeaders: true,
  });

  function row(d) {
    d.rapporteur = d.rapporteur ? d.rapporteur.join("|") : "";
    return d;
  }

  const pipeline = chain([row, csvwriter, fs.createWriteStream(file)]);
  pipeline.on("close", () => console.log("close" + file));
  return pipeline;
}

function scrape(docurl, param, type) {
  return new Promise((resolve, reject) => {
    param = param || { timeout: 3000 };
    osmosis
      .get(docurl, param)
      .log(console.log)
      .error(console.log)
      .find(".single_result")
      .set({
        name: ".procedure_title",
        reference: "td em",
        oeil: ".procedure_title a@href",
        intra: ".rssEntry_title",
        doc: ".rssEntry_title a@href",
        more: [".rssEntry_row_value_item"],
        //'urls':['.documents a@href']
      })
      .then((context, d) => {
        d.type = type;
        if (d.more) {
          d.rapporteur = d.more[1];
          d.committee = d.more[0];
        }
        if (d.rapporteur) {
          d.rapporteur = d.rapporteur.split(",");
          d.rapporteur.forEach((r, i) => {
            d.rapporteur[i] = r.trim();
          });
        }
        pipes["report"].write(d);
      })
      .done((d) => {
        console.log("done");
        resolve(docurl);
      });
  });
}
