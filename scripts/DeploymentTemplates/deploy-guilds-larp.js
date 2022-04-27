require("@nomiclabs/hardhat-web3");
const moment = require("moment");

task("deploy-guilds-develop", "Deploy dxvote with develop config")
  .addParam("registry", "The registry for the given network")
  .setAction(async ({ registry }) => {
    const GuildRegistry = await hre.artifacts.require("GuildRegistry");
    const deployconfig = {
      tokens: [
        {
          name: "SWPR on rinkeby",
          symbol: "SWPR",
          type: "ERC20",
          distribution: [
            {
              address: "0xA678B50F66d212d127491F5ee82776bdeF763841",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x91aef3c3b9bab2c306548269ff9b6771f2b107d8",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x881a01BBA8182E14624c046Fd5880c84D14A1507",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x8e900cf9bd655e34bb610f0ef365d8d476fd7337",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x1Bdb1089c24713537c56A01353a8E11e5bCc8216",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x2f6d58931beE95b6250A68C38173297B75a87000",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x3e989FD8b5fB0aaE1944f9642D011E9265eb7168",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x6dcb29d579c8f8cFD9ea5ae0b78da59EFa684719",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x3B5011De5805cead8538C1e7F373d0217169C1E0",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x92569bCd1862e192F9e9A1261d3B7e62aE4160d1",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x0b17cf48420400e1d71f8231d4a8e43b3566bb5b",
              amount: web3.utils.toWei("90"),
            },
          ],
        },
        {
          name: "Multisig1",
          symbol: "REP",
          type: "ERC20SnapshotRep",
          distribution: [
            {
              address: "0xA678B50F66d212d127491F5ee82776bdeF763841",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x91aef3c3b9bab2c306548269ff9b6771f2b107d8",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x881a01BBA8182E14624c046Fd5880c84D14A1507",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x8e900cf9bd655e34bb610f0ef365d8d476fd7337",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x1Bdb1089c24713537c56A01353a8E11e5bCc8216",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x2f6d58931beE95b6250A68C38173297B75a87000",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x3e989FD8b5fB0aaE1944f9642D011E9265eb7168",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x6dcb29d579c8f8cFD9ea5ae0b78da59EFa684719",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x3B5011De5805cead8538C1e7F373d0217169C1E0",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x92569bCd1862e192F9e9A1261d3B7e62aE4160d1",
              amount: web3.utils.toWei("10"),
            },
            {
              address: "0x0b17cf48420400e1d71f8231d4a8e43b3566bb5b",
              amount: web3.utils.toWei("40"),
            },
          ],
        },
      ],

      permissionRegistryDelay: moment.duration(10, "minutes").asSeconds(),
      guildRegistry:
        registry === "0x0" ? (await GuildRegistry.new()).address : registry,
      guilds: [
        {
          token: "SWPR",
          contractName: "EnforcedBinarySnapshotERC20Guild",
          name: "SWPRGuild",
          proposalTime: moment.duration(10, "minutes").asSeconds(),
          timeForExecution: moment.duration(5, "minutes").asSeconds(),
          votingPowerForProposalExecution: "30",
          votingPowerForProposalCreation: "1",
          voteGas: "0",
          maxGasPrice: "0",
          maxActiveProposals: "0",
          lockTime: moment.duration(10, "minutes").asSeconds(),
        },
        {
          token: "REP",
          contractName: "SnapshotRepERC20Guild",
          name: "Multisig1",
          proposalTime: moment.duration(5, "minutes").asSeconds(),
          timeForExecution: moment.duration(2, "minutes").asSeconds(),
          votingPowerForProposalExecution: "50",
          votingPowerForProposalCreation: "5",
          voteGas: "0",
          maxGasPrice: "0",
          maxActiveProposals: "5",
          lockTime: moment.duration(5, "minutes").asSeconds(),
        },
      ],

      startTimestampForActions: moment().subtract(10, "minutes").unix(),

      actions: [],
    };

    await hre.run("deploy-guilds", {
      deployconfig: JSON.stringify(deployconfig),
    });
  });

module.exports = {};
