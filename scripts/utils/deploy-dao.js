/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

const { waitBlocks } = require("../utils/wait");

const deployDao = async function (daoConfig, networkContracts) {
  // Import contracts
  const DAOAvatar = await hre.artifacts.require("DAOAvatar");
  const DAOReputation = await hre.artifacts.require("DAOReputation");
  const DAOController = await hre.artifacts.require("DAOController");
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
  console.log("Deploying DAOReputation...");
  reputation = await DAOReputation.new();
  await reputation.initialize("DxDAO Reputation", "REP");
  console.log("DX Reputation deployed to:", reputation.address);
  networkContracts.reputation = reputation.address;
  networkContracts.addresses["Reputation"] = reputation.address;
  await waitBlocks(1);

  // Mint DXvote REP
  await reputation.mintMultiple(founders, initialRep);
  await waitBlocks(1);

  // Deploy Avatar
  let avatar;
  console.log(
    "Deploying DAOAvatar...",
    networkContracts.addresses["DXD"],
    reputation.address
  );
  avatar = await DAOAvatar.new();
  await avatar.initialize(
    networkContracts.addresses["DXD"],
    reputation.address
  );
  console.log("DXdao Avatar deployed to:", avatar.address);
  networkContracts.avatar = avatar.address;
  networkContracts.token = networkContracts.addresses["DXD"];
  networkContracts.addresses["Avatar"] = avatar.address;
  await waitBlocks(1);

  // Deploy Controller and transfer avatar to controller
  let controller;
  console.log("Deploying DAOController...");
  controller = await DAOController.new(avatar.address);
  await controller.initialize(avatar.address);
  console.log("DXdao Controller deployed to:", controller.address);
  await avatar.transferOwnership(controller.address);
  await reputation.transferOwnership(controller.address);
  networkContracts.controller = controller.address;
  networkContracts.addresses["Controller"] = controller.address;
  await waitBlocks(1);

  // Deploy DXDVotingMachine
  let votingMachine;
  console.log("Deploying DXDVotingMachine...");
  votingMachine = await DXDVotingMachine.new(networkContracts.addresses["DXD"]);
  console.log("DXDVotingMachine deployed to:", votingMachine.address);
  networkContracts.votingMachines[votingMachine.address] = {
    type: "DXDVotingMachine",
    token: networkContracts.addresses["DXD"],
  };
  await waitBlocks(1);
  networkContracts.addresses["DXDVotingMachine"] = votingMachine.address;

  // Deploy PermissionRegistry to be used by WalletSchemes
  let permissionRegistry;
  console.log("Deploying PermissionRegistry...");
  permissionRegistry = await PermissionRegistry.new();
  await permissionRegistry.initialize();
  networkContracts.addresses["PermissionRegistry"] = permissionRegistry.address;

  // Only allow the functions mintReputation, burnReputation, genericCall, registerScheme and unregisterScheme to be
  // called to in the controller contract from a scheme that calls the controller.
  // This permissions makes the other functions inaccessible

  const notAllowedControllerFunctionSignatures = [
    "mintTokens",
    "unregisterSelf",
    "addGlobalConstraint",
    "removeGlobalConstraint",
    "upgradeController",
    "sendEther",
    "externalTokenTransfer",
    "externalTokenTransferFrom",
    "externalTokenApproval",
    "metaData",
  ].map(
    fnName =>
      controller.contract._jsonInterface.find(method => method.name === fnName)
        .signature
  );

  for (let notAllowedFunctionSignature of notAllowedControllerFunctionSignatures) {
    await permissionRegistry.setETHPermission(
      avatar.address,
      controller.address,
      notAllowedFunctionSignature,
      MAX_UINT_256,
      false
    );
  }

  await permissionRegistry.setETHPermission(
    avatar.address,
    controller.address,
    ANY_FUNC_SIGNATURE,
    0,
    true
  );

  console.log("Permission Registry deployed to:", permissionRegistry.address);
  networkContracts.permissionRegistry = permissionRegistry.address;
  networkContracts.addresses["PermissionRegistry"] = permissionRegistry.address;
  await waitBlocks(1);

  // Deploy Wallet Schemes
  for (var s = 0; s < daoConfig.walletSchemes.length; s++) {
    const schemeConfiguration = daoConfig.walletSchemes[s];

    console.log(`Deploying ${schemeConfiguration.name}...`);
    const newScheme = await WalletScheme.new();
    console.log(
      `${schemeConfiguration.name} deployed to: ${newScheme.address}`
    );

    /* Register the params in the VotingMachine and use that ones for the schem registration */
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
      else if (networkContracts.addresses[permission.to])
        permission.to = networkContracts.addresses[permission.to];

      if (permission.asset === NULL_ADDRESS)
        await permissionRegistry.setETHPermission(
          newScheme.address,
          networkContracts.addresses[permission.to] || permission.to,
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
      "0x0",
      avatar.address
    );

    networkContracts.schemes[schemeConfiguration.name] = newScheme.address;
    networkContracts.addresses[schemeConfiguration.name] = newScheme.address;
  }

  // Deploy dxDaoNFT
  let dxDaoNFT;
  console.log("Deploying ERC721Factory...");
  dxDaoNFT = await ERC721Factory.new("DX DAO NFT", "DXDNFT");
  networkContracts.utils.dxDaoNFT = dxDaoNFT.address;
  networkContracts.addresses["ERC721Factory"] = dxDaoNFT.address;

  // Deploy ERC20VestingFactory
  let dxdVestingFactory;
  console.log("Deploying ERC20VestingFactory...");
  dxdVestingFactory = await ERC20VestingFactory.new(
    networkContracts.votingMachines[votingMachine.address].token,
    avatar.address
  );
  networkContracts.utils.dxdVestingFactory = dxdVestingFactory.address;
  networkContracts.addresses["ERC20VestingFactory"] = dxdVestingFactory.address;

  // Transfer all ownership and power to the dao
  console.log("Transfering ownership...");
  // Set the in the permission registry
  await permissionRegistry.transferOwnership(avatar.address);
  await dxDaoNFT.transferOwnership(avatar.address);
  await controller.unregisterScheme(accounts[0], avatar.address);

  return networkContracts;
};

module.exports = {
  deployDao,
};
