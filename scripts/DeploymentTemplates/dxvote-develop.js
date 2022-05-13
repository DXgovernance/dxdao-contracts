require("@nomiclabs/hardhat-web3");
const moment = require("moment");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

task("deploy-dxvote-develop", "Deploy dxvote with develop config").setAction(
  async () => {
    const PermissionRegistry = await hre.artifacts.require(
      "PermissionRegistry"
    );
    const ERC20Guild = await hre.artifacts.require("ERC20Guild");

    const deployconfig = {
      dao: {
        reputation: [
          {
            address: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
            amount: 6000,
          },
          {
            address: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
            amount: 4000,
          },
          {
            address: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
            amount: 1000,
          },
        ],
        contributionReward: {
          queuedVoteRequiredPercentage: 50,
          queuedVotePeriodLimit: moment.duration(10, "minutes").asSeconds(),
          boostedVotePeriodLimit: moment.duration(3, "minutes").asSeconds(),
          preBoostedVotePeriodLimit: moment.duration(1, "minutes").asSeconds(),
          thresholdConst: 2000,
          quietEndingPeriod: moment.duration(0.5, "minutes").asSeconds(),
          proposingRepReward: 10,
          votersReputationLossRatio: 100,
          minimumDaoBounty: web3.utils.toWei("1"),
          daoBountyConst: 100,
        },

        walletSchemes: [
          {
            name: "RegistrarWalletScheme",
            doAvatarGenericCalls: true,
            maxSecondsForExecution: moment.duration(31, "days").asSeconds(),
            maxRepPercentageChange: 0,
            controllerPermissions: {
              canGenericCall: true,
              canUpgrade: true,
              canRegisterSchemes: true,
            },
            permissions: [],
            queuedVoteRequiredPercentage: 75,
            boostedVoteRequiredPercentage: 5 * 100,
            queuedVotePeriodLimit: moment.duration(15, "minutes").asSeconds(),
            boostedVotePeriodLimit: moment.duration(5, "minutes").asSeconds(),
            preBoostedVotePeriodLimit: moment
              .duration(2, "minutes")
              .asSeconds(),
            thresholdConst: 2000,
            quietEndingPeriod: moment.duration(1, "minutes").asSeconds(),
            proposingRepReward: 0,
            votersReputationLossRatio: 100,
            minimumDaoBounty: web3.utils.toWei("10"),
            daoBountyConst: 100,
          },
          {
            name: "MasterWalletScheme",
            doAvatarGenericCalls: true,
            maxSecondsForExecution: moment.duration(31, "days").asSeconds(),
            maxRepPercentageChange: 40,
            controllerPermissions: {
              canGenericCall: true,
              canUpgrade: false,
              canChangeConstraints: false,
              canRegisterSchemes: false,
            },
            permissions: [
              {
                asset: "0x0000000000000000000000000000000000000000",
                to: "DXDVotingMachine",
                functionSignature: "0xaaaaaaaa",
                value:
                  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                allowed: true,
              },
              {
                asset: "0x0000000000000000000000000000000000000000",
                to: "RegistrarWalletScheme",
                functionSignature: "0xaaaaaaaa",
                value:
                  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                allowed: true,
              },
              {
                asset: "0x0000000000000000000000000000000000000000",
                to: "ITSELF",
                functionSignature: "0xaaaaaaaa",
                value:
                  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                allowed: true,
              },
            ],
            queuedVoteRequiredPercentage: 50,
            boostedVoteRequiredPercentage: 2 * 100,
            queuedVotePeriodLimit: moment.duration(10, "minutes").asSeconds(),
            boostedVotePeriodLimit: moment.duration(3, "minutes").asSeconds(),
            preBoostedVotePeriodLimit: moment
              .duration(1, "minutes")
              .asSeconds(),
            thresholdConst: 1500,
            quietEndingPeriod: moment.duration(0.5, "minutes").asSeconds(),
            proposingRepReward: 0,
            votersReputationLossRatio: 5,
            minimumDaoBounty: web3.utils.toWei("1"),
            daoBountyConst: 10,
          },
          {
            name: "QuickWalletScheme",
            doAvatarGenericCalls: false,
            maxSecondsForExecution: moment.duration(31, "days").asSeconds(),
            maxRepPercentageChange: 1,
            controllerPermissions: {
              canGenericCall: false,
              canUpgrade: false,
              canChangeConstraints: false,
              canRegisterSchemes: false,
            },
            permissions: [
              {
                asset: "0x0000000000000000000000000000000000000000",
                to: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
                functionSignature: "0xaaaaaaaa",
                value:
                  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                allowed: true,
              },
              {
                asset: "DXD",
                to: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
                functionSignature: "0xaaaaaaaa",
                value:
                  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                allowed: true,
              },
            ],
            queuedVoteRequiredPercentage: 50,
            boostedVoteRequiredPercentage: 10 * 100,
            queuedVotePeriodLimit: moment.duration(5, "minutes").asSeconds(),
            boostedVotePeriodLimit: moment.duration(1, "minutes").asSeconds(),
            preBoostedVotePeriodLimit: moment
              .duration(0.5, "minutes")
              .asSeconds(),
            thresholdConst: 1300,
            quietEndingPeriod: moment.duration(0.5, "minutes").asSeconds(),
            proposingRepReward: 0,
            votersReputationLossRatio: 10,
            minimumDaoBounty: web3.utils.toWei("0.1"),
            daoBountyConst: 10,
          },
        ],
      },

      tokens: [
        {
          name: "DXDao on localhost",
          symbol: "DXD",
          type: "ERC20",
          decimals: 18,
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
          decimals: 18,
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

      actions: [
        {
          timestamp: moment().subtract(30, "minutes").unix(),
          type: "transfer",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            asset: NULL_ADDRESS,
            address: "Avatar",
            amount: web3.utils.toWei("50"),
          },
        },
        {
          type: "transfer",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            asset: "DXD",
            address: "Avatar",
            amount: web3.utils.toWei("20"),
          },
        },

        {
          type: "transfer",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            asset: NULL_ADDRESS,
            address: "DXDGuild",
            amount: web3.utils.toWei("10"),
          },
        },
        {
          type: "transfer",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            asset: "DXD",
            address: "DXDGuild",
            amount: web3.utils.toWei("100"),
          },
        },

        {
          type: "transfer",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            asset: NULL_ADDRESS,
            address: "REPGuild",
            amount: web3.utils.toWei("12"),
          },
        },

        {
          type: "proposal",
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            to: ["PermissionRegistry"],
            callData: [
              new web3.eth.Contract(PermissionRegistry.abi).methods
                .setPermission(
                  NULL_ADDRESS,
                  "0xE0FC07f3aC4F6AF1463De20eb60Cf1A764E259db",
                  "0x1A0370A6f5b6cE96B1386B208a8519552eb714D9",
                  ANY_FUNC_SIGNATURE,
                  web3.utils.toWei("10"),
                  true
                )
                .encodeABI(),
            ],
            value: ["0"],
            title: "Proposal Test #0",
            description: "Allow sending up to 10 ETH to QuickWalletScheme",
            tags: ["dxvote"],
            scheme: "MasterWalletScheme",
          },
        },
        {
          type: "approve",
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            asset: "DXD",
            address: "DXDVotingMachine",
            amount: web3.utils.toWei("100"),
          },
        },
        {
          type: "stake",
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            proposal: "0",
            decision: "1",
            amount: web3.utils.toWei("1.01"),
          },
        },
        {
          type: "vote",
          increaseTime: moment.duration(1, "minutes").asSeconds(),
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            proposal: "0",
            decision: "1",
            amount: "0",
          },
        },
        {
          type: "execute",
          increaseTime: moment.duration(3, "minutes").asSeconds(),
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            proposal: "0",
          },
        },
        {
          type: "redeem",
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            proposal: "0",
          },
        },

        {
          type: "proposal",
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            to: ["0xdE0A2DFE54721526Aa05BE76F825Ef94CD8F585a"],
            callData: ["0x0"],
            value: [web3.utils.toWei("10")],
            title: "Proposal Test #1",
            description: "Send 10 ETH to QuickWalletScheme",
            tags: ["dxvote"],
            scheme: "MasterWalletScheme",
          },
        },
        {
          type: "stake",
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            proposal: "1",
            decision: "1",
            amount: web3.utils.toWei("1.01"),
          },
        },
        {
          type: "vote",
          increaseTime: moment.duration(1, "minutes").asSeconds(),
          from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
          data: {
            proposal: "1",
            decision: "1",
            amount: "0",
          },
        },
        {
          type: "vote",
          from: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
          data: {
            proposal: "1",
            decision: "2",
            amount: "0",
          },
        },
        {
          type: "approve",
          from: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
          data: {
            asset: "DXD",
            address: "DXDGuild-vault",
            amount: web3.utils.toWei("101"),
          },
        },
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
          increaseTime: moment.duration(10, "minutes").asSeconds() + 1,
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
          increaseTime: moment.duration(10, "minutes").asSeconds(),
          type: "guild-endProposal",
          from: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
          data: {
            guildName: "DXDGuild",
            proposal: 0,
          },
        },
      ],
    };

    await hre.run("deploy-dxvote", {
      deployconfig: JSON.stringify(deployconfig),
    });
  }
);
