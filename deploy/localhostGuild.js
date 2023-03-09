const moment = require("moment");
const {
  deploySnapshotRepGuild,
} = require("../scripts/deployUtils/deployGuild");

const config = {
  GUILD_ID: "LocalhostGuild",
  TOKEN_ID: "LocalhostRepToken",
  TOKEN_NAME: "Localhost Reputation Token",
  TOKEN_SYMBOL: "LOC",
  guildConfig: {
    proposalTime: moment.duration(10, "minutes").asSeconds(),
    timeForExecution: moment.duration(7, "days").asSeconds(),
    votingPowerPercentageForProposalExecution: 2000, // 20% voting power for proposal execution
    votingPowerPercentageForProposalCreation: 200, // 2% voting power for proposal creation
    name: "Localhost Guild", // guild name
    voteGas: "0", // vote gas
    maxGasPrice: "0", // max gas price
    maxActiveProposals: 20, // max active proposals
    lockTime: moment.duration(15, "minutes").asSeconds(), // lock time, not used but should be higher than proposal time
  },
  initialRepHolders: [
    // default testing accounts #0, #1, #2
    { address: "0x9578e973bba0cc33bdbc93c7f77bb3fe6d47d68a", amount: "34" },
    { address: "0xc5b20ade9c9cd5e0cc087c62b26b815a4bc1881f", amount: "33" },
    { address: "0xaf8eb8c3a5d9d900aa0b98e3df0bcc17d3c5f698", amount: "33" },
  ],
  deployExtraSalt: "localhost",
};

module.exports = hre => deploySnapshotRepGuild(config)(hre);
module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];
module.exports.tags = [config.GUILD_ID];
module.exports.config = config;
