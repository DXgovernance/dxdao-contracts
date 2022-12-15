module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const WalletScheme = await hre.artifacts.require("WalletScheme");

  const tx = await deployer.deploy(WalletScheme.bytecode, deploySalt, {
    from: deployerAddress,
  });
  const masterWalletSchemeAddress = tx.logs[0].args[0];

  save("MasterWalletScheme", {
    abi: WalletScheme.abi,
    address: masterWalletSchemeAddress,
    receipt: tx.receipt,
    bytecode: WalletScheme.bytecode,
    deployedBytecode: WalletScheme.deployedBytecode,
  });

  const tx2 = await deployer.deploy(WalletScheme.bytecode, `${deploySalt}01`, {
    from: deployerAddress,
  });
  const quickWalletSchemeAddress = tx2.logs[0].args[0];

  save("QuickWalletScheme", {
    abi: WalletScheme.abi,
    address: quickWalletSchemeAddress,
    receipt: tx2.receipt,
    bytecode: WalletScheme.bytecode,
    deployedBytecode: WalletScheme.deployedBytecode,
  });

  const masterWalletScheme = await WalletScheme.at(masterWalletSchemeAddress);

  const quickWalletScheme = await WalletScheme.at(quickWalletSchemeAddress);

  const avatarDeployed = await deployments.get("DAOAvatar");
  const dxdVotingMachineDeployed = await deployments.get("DXDVotingMachine");
  const controllerDeployed = await deployments.get("DAOController");
  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );

  try {
    await masterWalletScheme.initialize(
      avatarDeployed.address,
      dxdVotingMachineDeployed.address,
      controllerDeployed.address,
      permissionRegistryDeployed.address,
      "Master Wallet",
      5
    );

    await quickWalletScheme.initialize(
      avatarDeployed.address,
      dxdVotingMachineDeployed.address,
      controllerDeployed.address,
      permissionRegistryDeployed.address,
      "Quick Wallet",
      1
    );
  } catch (e) {
    console.warn("Wallet scheme is already deployed.");
  }

  const Controller = await hre.artifacts.require("DAOController");
  const controller = await Controller.at(controllerDeployed.address);
  const DXDVotingMachine = await hre.artifacts.require("DXDVotingMachine");
  const dxdVotingMachine = await DXDVotingMachine.at(
    dxdVotingMachineDeployed.address
  );

  const defaultParameters = {
    queuedVoteRequiredPercentage: 5000,
    queuedVotePeriodLimit: 60,
    boostedVotePeriodLimit: 60,
    preBoostedVotePeriodLimit: 10,
    thresholdConst: 2000,
    quietEndingPeriod: 10,
    proposingRepReward: 0,
    minimumDaoBounty: 100,
    daoBountyConst: 10,
    boostedVoteRequiredPercentage: 100,
  };

  const defaultParametersArray = [
    defaultParameters.queuedVoteRequiredPercentage,
    defaultParameters.queuedVotePeriodLimit,
    defaultParameters.boostedVotePeriodLimit,
    defaultParameters.preBoostedVotePeriodLimit,
    defaultParameters.thresholdConst,
    defaultParameters.quietEndingPeriod,
    defaultParameters.proposingRepReward,
    defaultParameters.minimumDaoBounty,
    defaultParameters.daoBountyConst,
    defaultParameters.boostedVoteRequiredPercentage,
  ];

  await dxdVotingMachine.setParameters(defaultParametersArray);
  const defaultParamsHash = await dxdVotingMachine.getParametersHash(
    defaultParametersArray
  );

  await controller.registerScheme(
    masterWalletScheme.address,
    defaultParamsHash,
    false,
    false,
    true
  );

  await controller.registerScheme(
    quickWalletScheme.address,
    defaultParamsHash,
    false,
    false,
    true
  );

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: masterWalletScheme.address,
        constructorArguments: [],
      });

      await hre.run("verify:verify", {
        address: quickWalletScheme.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`Master Wallet Scheme address ${masterWalletScheme.address}`);
  console.log(`Quick Wallet Scheme address  ${quickWalletScheme.address}`);
};

module.exports.tags = ["WalletScheme"];
module.exports.dependencies = [
  "Create2",
  "DAOAvatar",
  "DXDVotingMachine",
  "Controller",
  "PermissionRegistry",
];

