require("@nomiclabs/hardhat-web3");
const moment = require("moment");

task("deploy-guilds-develop", "Deploy dxvote with develop config")
  .addParam("registryAddress", "The registry for the given network")
  .setAction(async () => {
    console.log("Entered first script");

    const deployconfig = {
      tokens: [
        {
          name: "DXDao on localhost",
          symbol: "DXD",
          type: "ERC20",
          distribution: [
            {
              address: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
              amount: web3.utils.toWei("220"),
            },
            {
              address: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
              amount: web3.utils.toWei("50"),
            },
            {
              address: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
              amount: web3.utils.toWei("10"),
            },
          ],
        },
        {
          name: "REPGuildToken",
          symbol: "RGT",
          type: "ERC20SnapshotRep",
          distribution: [
            {
              address: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
              amount: 1000,
            },
            {
              address: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
              amount: 4000,
            },
            {
              address: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
              amount: 10000,
            },
          ],
        },
      ],

      permissionRegistryDelay: moment.duration(10, "minutes").asSeconds(),
      guildRegistry: registryAddress,
      guilds: [
        {
          token: "DXD",
          contractName: "DXDGuild",
          name: "DXDGuild",
          proposalTime: moment.duration(10, "minutes").asSeconds(),
          timeForExecution: moment.duration(5, "minutes").asSeconds(),
          votingPowerForProposalExecution: "30",
          votingPowerForProposalCreation: "1",
          voteGas: "0",
          maxGasPrice: "0",
          maxActiveProposals: "2",
          lockTime: moment.duration(10, "minutes").asSeconds(),
        },
        {
          token: "RGT",
          contractName: "SnapshotRepERC20Guild",
          name: "REPGuild",
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
