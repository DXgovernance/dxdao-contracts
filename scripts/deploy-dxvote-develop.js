require("@nomiclabs/hardhat-web3");
const moment = require("moment");

task(
  "deploy-dxvote-develop",
  "Deploy a smart contract using create2"
).setAction(async () => {
  const deployconfig = {
    permissionRegistryDelay: moment.duration(10, "minutes").asSeconds(),
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
        preBoostedVotePeriodLimit: moment.duration(2, "minutes").asSeconds(),
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
            to: "0x37311D0D80c9dF1fc0d37F66dB74230f8a6D4100",
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
        preBoostedVotePeriodLimit: moment.duration(1, "minutes").asSeconds(),
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
        preBoostedVotePeriodLimit: moment.duration(0.5, "minutes").asSeconds(),
        thresholdConst: 1300,
        quietEndingPeriod: moment.duration(0.5, "minutes").asSeconds(),
        proposingRepReward: 0,
        votersReputationLossRatio: 10,
        minimumDaoBounty: web3.utils.toWei("0.1"),
        daoBountyConst: 10,
      },
    ],

    // Avatar = 0xf89f66329e7298246de22D210Ac246DCddff4621

    votingMachineToken: [
      {
        address: "0xf89f66329e7298246de22D210Ac246DCddff4621",
        amount: web3.utils.toWei("100"),
      },
      {
        address: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
        amount: web3.utils.toWei("100"),
      },
      {
        address: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
        amount: web3.utils.toWei("20"),
      },
      {
        address: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
        amount: web3.utils.toWei("2.5"),
      },
    ],

    ethTransfers: [
      {
        address: "0xf89f66329e7298246de22D210Ac246DCddff4621",
        amount: web3.utils.toWei("50"),
      },
    ],

    reputation: [
      {
        address: "0x79706c8e413cdaee9e63f282507287b9ea9c0928",
        amount: 5100,
      },
      {
        address: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
        amount: 4800,
      },
      {
        address: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
        amount: 1000,
      },
    ],

    actions: [
      {
        type: "proposal",
        from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
        data: {
          to: ["0x37311D0D80c9dF1fc0d37F66dB74230f8a6D4100"],
          callData: ["0x0"],
          value: [web3.utils.toWei("51")],
          title: "Proposal Test #0",
          description:
            "Send 51 ETH to QuickWalletScheme, (it will fail), should be in pending finish execution",
          tags: ["dxvote"],
          scheme: "MasterWalletScheme",
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
        time: moment.duration(1, "minutes").asSeconds(),
        from: "0xc73480525e9d1198d448ece4a01daea851f72a9d",
        data: {
          proposal: "0",
          decision: "1",
          amount: "0",
        },
      },
      {
        type: "execute",
        time: moment.duration(3, "minutes").asSeconds(),
        from: "0x3f943f38b2fbe1ee5daf0516cecfe4e0f8734351",
        data: {
          proposal: "0",
        },
      },
    ],
  };

  await hre.run("deploy-dxvote", {
    deployconfig: JSON.stringify(deployconfig),
  });
});
