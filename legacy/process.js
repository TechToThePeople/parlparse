const plenary = require("./plenary");
console.log(plenary);
const main = async () => {
  const rollcalls = await plenary(new Date().toISOString().substring(0, 10));
  if (!rollcalls) {
    console.warn("nothing to process further");
    return;
  }
  console.debug(rollcalls);
  // reports.js
  // cards.js
  // csv.js
  // prod.sh
};

main().then((d) => {
  console.log("done", d);
  process.exit(1);
});
