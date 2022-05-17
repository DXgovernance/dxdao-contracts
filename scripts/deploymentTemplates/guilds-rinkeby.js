require("@nomiclabs/hardhat-web3");
const moment = require("moment");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

task(
  "deploy-guilds-rinkeby",
  "Deploy SWPR and MREP guilds in rinkeby network"
).setAction(async () => {
  const deployconfig = {
    tokens: [
      {
        name: "SWPR",
        symbol: "SWPR",
        type: "ERC20",
        decimals: "18",
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
        name: "Multisig REP #1",
        symbol: "MREP",
        type: "ERC20SnapshotRep",
        decimals: "18",
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

    permissionRegistry: {
      address: NULL_ADDRESS,
    },

    guildRegistry: {
      address: NULL_ADDRESS,
    },

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
        token: "MREP",
        contractName: "SnapshotRepERC20Guild",
        name: "Multisig #1",
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

    actions: [],
  };

  await hre.run("deploy-dxdao-contracts", {
    deployconfig: JSON.stringify(deployconfig),
  });
});
