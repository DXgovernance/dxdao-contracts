const moment = require("moment");
const {
  deploySnapshotRepGuild,
} = require("../scripts/deployUtils/deployGuild");

const config = {
  GUILD_ID: "CarrotGuild",
  TOKEN_ID: "CarrotRepToken",
  TOKEN_NAME: "Carrot Reputation Token",
  TOKEN_SYMBOL: "CRT",
  guildConfig: {
    proposalTime: moment.duration(3, "days").asSeconds(),
    timeForExecution: moment.duration(7, "days").asSeconds(),
    votingPowerPercentageForProposalExecution: 4000, // 40% voting power for proposal execution
    votingPowerPercentageForProposalCreation: 200, // 2% voting power for proposal creation
    name: "Carrot Guild", // guild name
    voteGas: "0", // vote gas
    maxGasPrice: "0", // max gas price
    maxActiveProposals: 20, // max active proposals
    lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
  },
  initialRepHolders: [
    { address: "0x35E2acD3f46B13151BC941daa44785A38F3BD97A", amount: "30" }, // Federico
    { address: "0x261e421a08028e2236928efb1a1f93cea7e95ce7", amount: "25" }, // Paolo
    { address: "0x05A4Ed2367BD2F0Aa63cC14897850be7474bc722", amount: "20" }, // Diogo
    { address: "0xe836a47d43c684a3089290c7d64db65ddcbd20eb", amount: "10" }, // MilanV
    { address: "0x617512FA7d3fd26bdA51b9Ac8c23b04a48D625f1", amount: "10" }, // venky
    { address: "0x436Bb9e1f02C9cA7164afb5753C03c071430216d", amount: "5" }, // Boris
  ],

  deployExtraSalt: "carrot",
};

module.exports = hre => deploySnapshotRepGuild(config)(hre);
module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];
module.exports.tags = [config.GUILD_ID];
module.exports.config = config;

