require("@nomiclabs/hardhat-web3");
const moment = require("moment");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

task("deploy-guilds-develop", "Deploy dxvote with develop config").setAction(
  async () => {
    console.log("Entered first script");
    // const PermissionRegistry = await hre.artifacts.require(
    //   "PermissionRegistry"
    // );
    const ERC20Guild = await hre.artifacts.require("ERC20Guild");

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

      actions: [
        {
          type: "guild-lockTokens",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            guildName: "DXDGuild",
            amount: web3.utils.toWei("100"),
          },
        },
        {
          type: "guild-withdrawTokens",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            guildName: "DXDGuild",
            amount: web3.utils.toWei("10"),
          },
          time: moment.duration(10, "minutes").asSeconds() + 1,
        },
        {
          type: "guild-createProposal",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            guildName: "DXDGuild",
            to: ["DXDGuild"],
            callData: [
              new web3.eth.Contract(ERC20Guild.abi).methods
                .setPermission(
                  [NULL_ADDRESS],
                  [ANY_ADDRESS],
                  [ANY_FUNC_SIGNATURE],
                  [web3.utils.toWei("5").toString()],
                  [true]
                )
                .encodeABI(),
            ],
            value: ["0"],
            totalActions: "1",
            title: "Proposal Test #0",
            description:
              "Allow call any address and function and send a max of 5 ETH per proposal",
          },
        },
        {
          type: "guild-voteProposal",
          from: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
          data: {
            guildName: "DXDGuild",
            proposal: 0,
            action: "1",
            votingPower: web3.utils.toWei("90").toString(),
          },
        },
        {
          time: moment.duration(10, "minutes").asSeconds(),
          type: "guild-endProposal",
          from: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
          data: {
            guildName: "DXDGuild",
            proposal: 0,
          },
        },
      ],
    };

    await hre.run("deploy-guilds", {
      deployconfig: JSON.stringify(deployconfig),
    });
  }
);
