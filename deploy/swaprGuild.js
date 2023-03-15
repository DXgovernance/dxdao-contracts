const moment = require("moment");
const {
  deploySnapshotRepGuild,
} = require("../scripts/deployUtils/deployGuild");

const config = {
  GUILD_ID: "SwaprGuild",
  TOKEN_ID: "SwaprRepToken",
  TOKEN_NAME: "Swapr Reputation Token",
  TOKEN_SYMBOL: "SRT",
  guildConfig: {
    proposalTime: moment.duration(3, "days").asSeconds(),
    timeForExecution: moment.duration(7, "days").asSeconds(),
    votingPowerPercentageForProposalExecution: 4000, // 40% voting power for proposal execution
    votingPowerPercentageForProposalCreation: 200, // 2% voting power for proposal creation
    name: "Swapr Guild", // guild name
    voteGas: "0", // vote gas
    maxGasPrice: "0", // max gas price
    maxActiveProposals: 20, // max active proposals
    lockTime: moment.duration(7, "days").asSeconds(), // lock time, not used but should be higher than proposal time
  },

  initialRepHolders: [
    { address: "0xb5806a701c2ae0366e15bde9be140e82190fa3d6", amount: "17" }, //  zett
    { address: "0x617512FA7d3fd26bdA51b9Ac8c23b04a48D625f1", amount: "15" }, //  venky
    { address: "0xF006779eAbE823F8EEd05464A1628383af1f7afb", amount: "15" }, //  Adam
    { address: "0x26358E62C2eDEd350e311bfde51588b8383A9315", amount: "12" }, //  Violet
    { address: "0xe716ec63c5673b3a4732d22909b38d779fa47c3f", amount: "10" }, //  Leo
    { address: "0x05A4Ed2367BD2F0Aa63cC14897850be7474bc722", amount: "8" }, // Diogo
    { address: "0xe836a47d43c684a3089290c7d64db65ddcbd20eb", amount: "8" }, // MilanV
    { address: "0x3b2c9a92a448be45dcff2c08a0d3af4178fc14d7", amount: "5" }, // Velu
    { address: "0x261e421a08028e2236928efb1a1f93cea7e95ce7", amount: "5" }, // Paolo
    { address: "0x8a5749a90c334953fd068aca14f1044eb3f7dfdd", amount: "3" }, // Vance
    { address: "0xb492873d940dac02b5021dff82282d8374509582", amount: "2" }, // Mirko
  ],
  deployExtraSalt: "swapr",
};

module.exports = hre => deploySnapshotRepGuild(config)(hre);

module.exports.dependencies = [
  "Create2Deployer",
  "PermissionRegistry",
  "GuildRegistry",
];

module.exports.tags = [config.GUILD_ID];
module.exports.config = config;
