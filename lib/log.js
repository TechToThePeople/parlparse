"use strict";
const figures = require("figures");
const { Signale } = require("signale");

const options = {
  types: {
    debug: {
      color: "white",
      label: "debug",
    },
  },
};

module.exports = Object.assign(new Signale(options), { Signale });
