/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

const { encodePermission } = require("../../test/helpers/permissions");

const { waitBlocks } = require("../utils/wait");

export async function deployDao(daoConfig, addresses) {
  // Import contracts
  const DxAvatar = await hre.artifacts.require("DxAvatar");
  const DxReputation = await hre.artifacts.require("DxReputation");
  const DxController = await hre.artifacts.require("DxController");
  const ContributionReward = await hre.artifacts.require("ContributionReward");
  const Redeemer = await hre.artifacts.require("Redeemer");
  const WalletScheme = await hre.artifacts.require("WalletScheme");
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");
  const DXDVotingMachine = await hre.artifacts.require("DXDVotingMachine");
  const Multicall = await hre.artifacts.require("Multicall");
  const ERC721Factory = await hre.artifacts.require("ERC721Factory");
  const ERC20VestingFactory = await hre.artifacts.require(
    "ERC20VestingFactory"
  );

  // Get ETH accounts to be used
  const accounts = await web3.eth.getAccounts();

  // Get fromBlock for network contracts
  const fromBlock = (await web3.eth.getBlock("latest")).number;

  // Set networkContracts object that will store the contracts deployed
  let networkContracts = {
    fromBlock: fromBlock,
    avatar: null,
    reputation: null,
    token: null,
    controller: null,
    permissionRegistry: null,
    schemes: {},
    utils: {},
    votingMachines: {},
  };

  // Get initial REP holders
  let founders = [],
    initialRep = [];
  daoConfig.reputation.map(initialRepHolder => {
    founders.push(initialRepHolder.address);
    initialRep.push(initialRepHolder.amount.toString());
  });

  // Deploy Multicall
  let multicall;
  console.log("Deploying Multicall...");
  multicall = await Multicall.new();
  console.log("Multicall deployed to:", multicall.address);
  await waitBlocks(1);
  networkContracts.utils.multicall = multicall.address;

  // Deploy Reputation
  let reputation;
  console.log("Deploying DxReputation...");
  reputation = await DxReputation.new();
  console.log("DX Reputation deployed to:", reputation.address);
  networkContracts.reputation = reputation.address;
  addresses["Reputation"] = reputation.address;
  await waitBlocks(1);

  // Mint DXvote REP
  await reputation.mintMultiple(founders, initialRep);
  await waitBlocks(1);

  // Deploy Avatar
  let avatar;
  console.log("Deploying DxAvatar...", addresses["DXD"], reputation.address);
  avatar = await DxAvatar.new("DXdao", addresses["DXD"], reputation.address);
  console.log("DXdao Avatar deployed to:", avatar.address);
  networkContracts.avatar = avatar.address;
  networkContracts.token = addresses["DXD"];
  addresses["Avatar"] = avatar.address;
  await waitBlocks(1);

  // Deploy Controller and transfer avatar to controller
  let controller;
  console.log("Deploying DxController...");
  controller = await DxController.new(avatar.address);
  console.log("DXdao Controller deployed to:", controller.address);
  await avatar.transferOwnership(controller.address);
  await reputation.transferOwnership(controller.address);
  networkContracts.controller = controller.address;
  addresses["Controller"] = controller.address;
  await waitBlocks(1);

  // Deploy DXDVotingMachine
  let votingMachine;
  console.log("Deploying DXDVotingMachine...");
  votingMachine = await DXDVotingMachine.new(addresses["DXD"]);
  console.log("DXDVotingMachine deployed to:", votingMachine.address);
  networkContracts.votingMachines[votingMachine.address] = {
    type: "DXDVotingMachine",
    token: addresses["DXD"],
  };
  await waitBlocks(1);
  addresses["DXDVotingMachine"] = votingMachine.address;

  // Deploy PermissionRegistry to be used by WalletSchemes
  let permissionRegistry;
  console.log("Deploying PermissionRegistry...");
  permissionRegistry = await PermissionRegistry.new();
  await permissionRegistry.initialize();
  addresses["PermissionRegistry"] = permissionRegistry.address;

  // Only allow the functions mintReputation, burnReputation, genericCall, registerScheme and unregisterScheme to be
  // called to in the controller contract from a scheme that calls the controller.
  // This permissions makes the other functions inaccessible
  const notAllowedControllerFunctions = [
    controller.contract._jsonInterface.find(
      method => method.name === "mintTokens"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "unregisterSelf"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "addGlobalConstraint"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "removeGlobalConstraint"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "upgradeController"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "sendEther"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "externalTokenTransfer"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "externalTokenTransferFrom"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "externalTokenApproval"
    ).signature,
    controller.contract._jsonInterface.find(
      method => method.name === "metaData"
    ).signature,
  ];
  for (var i = 0; i < notAllowedControllerFunctions.length; i++) {
    await permissionRegistry.setPermission(
      NULL_ADDRESS,
      avatar.address,
      controller.address,
      notAllowedControllerFunctions[i],
      MAX_UINT_256,
      false
    );
  }

  await permissionRegistry.setPermission(
    NULL_ADDRESS,
    avatar.address,
    controller.address,
    ANY_FUNC_SIGNATURE,
    0,
    true
  );

  console.log("Permission Registry deployed to:", permissionRegistry.address);
  networkContracts.permissionRegistry = permissionRegistry.address;
  addresses["PermissionRegstry"] = permissionRegistry.address;
  await waitBlocks(1);

  // Deploy ContributionReward Scheme
  console.log("Deploying ContributionReward scheme");
  const contributionReward = await ContributionReward.new();
  const redeemer = await Redeemer.new();

  // The ContributionReward scheme was designed by DAOstack to be used as an universal scheme,
  // which means that index the voting params used in the voting machine hash by voting machine
  // So the voting parameters are set in the voting machine, and that voting parameters hash is registered in the ContributionReward
  // And then other voting parameter hash is calculated for that voting machine and contribution reward, and that is the one used in the controller
  const contributionRewardParamsHash = await votingMachine.getParametersHash(
    [
      daoConfig.contributionReward.queuedVoteRequiredPercentage.toString(),
      daoConfig.contributionReward.queuedVotePeriodLimit.toString(),
      daoConfig.contributionReward.boostedVotePeriodLimit.toString(),
      daoConfig.contributionReward.preBoostedVotePeriodLimit.toString(),
      daoConfig.contributionReward.thresholdConst.toString(),
      daoConfig.contributionReward.quietEndingPeriod.toString(),
      daoConfig.contributionReward.proposingRepReward.toString(),
      daoConfig.contributionReward.votersReputationLossRatio.toString(),
      daoConfig.contributionReward.minimumDaoBounty.toString(),
      daoConfig.contributionReward.daoBountyConst.toString(),
      0,
    ],
    NULL_ADDRESS,
    { from: accounts[0], gasPrice: 0 }
  );
  await votingMachine.setParameters(
    [
      daoConfig.contributionReward.queuedVoteRequiredPercentage.toString(),
      daoConfig.contributionReward.queuedVotePeriodLimit.toString(),
      daoConfig.contributionReward.boostedVotePeriodLimit.toString(),
      daoConfig.contributionReward.preBoostedVotePeriodLimit.toString(),
      daoConfig.contributionReward.thresholdConst.toString(),
      daoConfig.contributionReward.quietEndingPeriod.toString(),
      daoConfig.contributionReward.proposingRepReward.toString(),
      daoConfig.contributionReward.votersReputationLossRatio.toString(),
      daoConfig.contributionReward.minimumDaoBounty.toString(),
      daoConfig.contributionReward.daoBountyConst.toString(),
      0,
    ],
    NULL_ADDRESS
  );
  await contributionReward.setParameters(
    contributionRewardParamsHash,
    votingMachine.address
  );
  const contributionRewardVotingmachineParamsHash =
    await contributionReward.getParametersHash(
      contributionRewardParamsHash,
      votingMachine.address
    );
  await controller.registerScheme(
    contributionReward.address,
    contributionRewardVotingmachineParamsHash,
    encodePermission({
      canGenericCall: true,
      canUpgrade: false,
      canRegisterSchemes: false,
    }),
    avatar.address
  );

  networkContracts.daostack = {
    [contributionReward.address]: {
      contractToCall: controller.address,
      creationLogEncoding: [
        [
          {
            name: "_descriptionHash",
            type: "string",
          },
          {
            name: "_reputationChange",
            type: "int256",
          },
          {
            name: "_rewards",
            type: "uint256[5]",
          },
          {
            name: "_externalToken",
            type: "address",
          },
          {
            name: "_beneficiary",
            type: "address",
          },
        ],
      ],
      name: "ContributionReward",
      newProposalTopics: [
        [
          "0xcbdcbf9aaeb1e9eff0f75d74e1c1e044bc87110164baec7d18d825b0450d97df",
          "0x000000000000000000000000519b70055af55a007110b4ff99b0ea33071c720a",
        ],
      ],
      redeemer: redeemer.address,
      supported: true,
      type: "ContributionReward",
      voteParams: contributionRewardVotingmachineParamsHash,
      votingMachine: votingMachine.address,
    },
  };
  addresses["ContributionReward"] = contributionReward.address;

  // Deploy Wallet Schemes
  for (var s = 0; s < daoConfig.walletSchemes.length; s++) {
    const schemeConfiguration = daoConfig.walletSchemes[s];

    console.log(`Deploying ${schemeConfiguration.name}...`);
    const newScheme = await WalletScheme.new();
    console.log(
      `${schemeConfiguration.name} deployed to: ${newScheme.address}`
    );

    // This is simpler than the ContributionReward, just register the params in the VotingMachine and use that ones for the schem registration
    let schemeParamsHash = await votingMachine.getParametersHash(
      [
        schemeConfiguration.queuedVoteRequiredPercentage.toString(),
        schemeConfiguration.queuedVotePeriodLimit.toString(),
        schemeConfiguration.boostedVotePeriodLimit.toString(),
        schemeConfiguration.preBoostedVotePeriodLimit.toString(),
        schemeConfiguration.thresholdConst.toString(),
        schemeConfiguration.quietEndingPeriod.toString(),
        schemeConfiguration.proposingRepReward.toString(),
        schemeConfiguration.votersReputationLossRatio.toString(),
        schemeConfiguration.minimumDaoBounty.toString(),
        schemeConfiguration.daoBountyConst.toString(),
        0,
      ],
      NULL_ADDRESS,
      { from: accounts[0], gasPrice: 0 }
    );

    await votingMachine.setParameters(
      [
        schemeConfiguration.queuedVoteRequiredPercentage.toString(),
        schemeConfiguration.queuedVotePeriodLimit.toString(),
        schemeConfiguration.boostedVotePeriodLimit.toString(),
        schemeConfiguration.preBoostedVotePeriodLimit.toString(),
        schemeConfiguration.thresholdConst.toString(),
        schemeConfiguration.quietEndingPeriod.toString(),
        schemeConfiguration.proposingRepReward.toString(),
        schemeConfiguration.votersReputationLossRatio.toString(),
        schemeConfiguration.minimumDaoBounty.toString(),
        schemeConfiguration.daoBountyConst.toString(),
        0,
      ],
      NULL_ADDRESS
    );

    // The Wallet scheme has to be initialized right after being created
    console.log("Initializing scheme...");
    await newScheme.initialize(
      avatar.address,
      votingMachine.address,
      schemeConfiguration.doAvatarGenericCalls,
      controller.address,
      permissionRegistry.address,
      schemeConfiguration.name,
      schemeConfiguration.maxSecondsForExecution,
      schemeConfiguration.maxRepPercentageChange
    );

    // Set the initial permissions in the WalletScheme
    console.log("Setting scheme permissions...");
    for (var p = 0; p < schemeConfiguration.permissions.length; p++) {
      const permission = schemeConfiguration.permissions[p];
      if (permission.to === "ITSELF") permission.to = newScheme.address;
      else if (addresses[permission.to])
        permission.to = addresses[permission.to];

      await permissionRegistry.setPermission(
        addresses[permission.asset] || permission.asset,
        schemeConfiguration.doAvatarGenericCalls
          ? avatar.address
          : newScheme.address,
        addresses[permission.to] || permission.to,
        permission.functionSignature,
        permission.value.toString(),
        permission.allowed
      );
    }

    // Set the boostedVoteRequiredPercentage
    if (schemeConfiguration.boostedVoteRequiredPercentage > 0) {
      console.log(
        "Setting boosted vote required percentage in voting machine..."
      );
      await controller.genericCall(
        votingMachine.address,
        web3.eth.abi.encodeFunctionCall(
          {
            name: "setBoostedVoteRequiredPercentage",
            type: "function",
            inputs: [
              {
                type: "address",
                name: "_scheme",
              },
              {
                type: "bytes32",
                name: "_paramsHash",
              },
              {
                type: "uint256",
                name: "_boostedVotePeriodLimit",
              },
            ],
          },
          [
            newScheme.address,
            schemeParamsHash,
            schemeConfiguration.boostedVoteRequiredPercentage,
          ]
        ),
        avatar.address,
        0
      );
    }

    // Finally the scheme is configured and ready to be registered
    console.log("Registering scheme in controller...");
    await controller.registerScheme(
      newScheme.address,
      schemeParamsHash,
      encodePermission(schemeConfiguration.controllerPermissions),
      avatar.address
    );

    networkContracts.schemes[schemeConfiguration.name] = newScheme.address;
    addresses[schemeConfiguration.name] = newScheme.address;
  }

  // Deploy dxDaoNFT
  let dxDaoNFT;
  console.log("Deploying ERC721Factory...");
  dxDaoNFT = await ERC721Factory.new("DX DAO NFT", "DXDNFT");
  networkContracts.utils.dxDaoNFT = dxDaoNFT.address;
  addresses["ERC721Factory"] = dxDaoNFT.address;

  // Deploy ERC20VestingFactory
  let dxdVestingFactory;
  console.log("Deploying ERC20VestingFactory...");
  dxdVestingFactory = await ERC20VestingFactory.new(
    networkContracts.votingMachines[votingMachine.address].token,
    avatar.address
  );
  networkContracts.utils.dxdVestingFactory = dxdVestingFactory.address;
  addresses["ERC20VestingFactory"] = dxdVestingFactory.address;

  // Transfer all ownership and power to the dao
  console.log("Transfering ownership...");
  // Set the in the permission registry
  await permissionRegistry.transferOwnership(avatar.address);
  await dxDaoNFT.transferOwnership(avatar.address);
  await controller.unregisterScheme(accounts[0], avatar.address);

  return { networkContracts, addresses };
}
