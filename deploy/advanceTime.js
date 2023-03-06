const { time } = require("@openzeppelin/test-helpers");
const moment = require("moment");

// Sync the blockchain time to the current time
module.exports = async () => {
  const target = Math.floor(moment.now() / 1000);
  console.log(`Increasing blockchain timestamp to ${target}`);
  await time.increaseTo(target);
};

module.exports.tags = ["AdvanceTime"];
