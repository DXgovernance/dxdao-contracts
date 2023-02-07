const moment = require("moment");
const {
  deploySnapshotRepGuild,
} = require("../scripts/deployUtils/deployGuild");

const config = {
  GUILD_ID: "VoiceGuild",
  TOKEN_ID: "VoiceRepToken",
  TOKEN_NAME: "Voice Reputation Token",
  TOKEN_SYMBOL: "VRT",
  guildConfig: {
    proposalTime: moment.duration(3, "days").asSeconds(),
    timeForExecution: moment.duration(7, "days").asSeconds(),
    votingPowerPercentageForProposalExecution: 4000, // 40% voting power for proposal execution
    votingPowerPercentageForProposalCreation: 500, // 5% voting power for proposal creation
    name: "Voice Guild", // guild name
    voteGas: "0", // vote gas
    maxGasPrice: "0", // max gas price
    maxActiveProposals: 20, // max active proposals
    lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
  },

  initialRepHolders: [
    { address: "0x91aef3c3b9bab2c306548269ff9b6771f2b107d8", amount: "20" },
    { address: "0x29e1a61fccd40408f489336993e798d14d57d77f", amount: "15" },
    { address: "0x436Bb9e1f02C9cA7164afb5753C03c071430216d", amount: "7" }, // 7.5 down to 7. Notify
    { address: "0x1861974f32eaCDCceD0F81b0f8eCcFeD58153a9D", amount: "20" },
    { address: "0x759A2169dA1b826F795A00A9aB5f29F9ca39E48a", amount: "15" },
    { address: "0x91628ddc3a6ff9b48a2f34fc315d243eb07a9501", amount: "7" }, // 7.5 down to 7. Notify
  ],

  deployExtraSalt: "voice",
};
module.exports = hre => deploySnapshotRepGuild(config)(hre);

module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];

module.exports.tags = [config.GUILD_ID];
module.exports.config = config;

