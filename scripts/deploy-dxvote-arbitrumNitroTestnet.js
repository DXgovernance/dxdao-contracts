require("@nomiclabs/hardhat-web3");
const moment = require("moment");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";
const MAX_UINT =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

task(
  "deploy-dxvote-arbitrumNitroTestnet",
  "Deploy dxvote with test config"
).setAction(async () => {
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");

  const deployconfig = {
    reputation: [
      {
        address: "0x9578e973bba0cc33bdbc93c7f77bb3fe6d47d68a",
        amount: 6000,
      },
      {
        address: "0xc5b20ade9c9cd5e0cc087c62b26b815a4bc1881f",
        amount: 4000,
      },
      {
        address: "0xaf8eb8c3a5d9d900aa0b98e3df0bcc17d3c5f698",
        amount: 1000,
      },
    ],

    tokens: [
      {
        name: "DXDao on Arb Nitro Testnet",
        symbol: "DXD",
        type: "ERC20",
        distribution: [
          {
            address: "0x9578e973bba0cc33bdbc93c7f77bb3fe6d47d68a",
            amount: web3.utils.toWei("220"),
          },
          {
            address: "0xc5b20ade9c9cd5e0cc087c62b26b815a4bc1881f",
            amount: web3.utils.toWei("50"),
          },
          {
            address: "0xaf8eb8c3a5d9d900aa0b98e3df0bcc17d3c5f698",
            amount: web3.utils.toWei("10"),
          },
        ],
      },
    ],

    permissionRegistryDelay: moment.duration(10, "seconds").asSeconds(),

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
            functionSignature: ANY_FUNC_SIGNATURE,
            value: MAX_UINT,
            allowed: true,
          },
          {
            asset: "0x0000000000000000000000000000000000000000",
            to: "RegistrarWalletScheme",
            functionSignature: ANY_FUNC_SIGNATURE,
            value: MAX_UINT,
            allowed: true,
          },
          {
            asset: "0x0000000000000000000000000000000000000000",
            to: "ITSELF",
            functionSignature: ANY_FUNC_SIGNATURE,
            value: MAX_UINT,
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
    ],

    guilds: [],

    actions: [
      {
        type: "transfer",
        from: "0x9578e973bba0cc33bdbc93c7f77bb3fe6d47d68a",
        data: {
          asset: NULL_ADDRESS,
          address: "Avatar",
          amount: web3.utils.toWei("0.01"),
        },
      },
      {
        type: "transfer",
        from: "0x9578e973bba0cc33bdbc93c7f77bb3fe6d47d68a",
        data: {
          asset: "DXD",
          address: "Avatar",
          amount: web3.utils.toWei("0.01"),
        },
      },
    ],
  };

  await hre.run("deploy-dxvote", {
    deployconfig: JSON.stringify(deployconfig),
  });
});
