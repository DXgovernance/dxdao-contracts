module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const WalletScheme = await hre.artifacts.require("WalletScheme");

  const masterWalletSchemeDeploy = await deploy("WalletScheme", {
    name: "MasterWalletScheme",
    from: deployer,
    args: [],
    deterministicDeployment: `${deploySalt}`,
  });

  const quickWalletSchemeDeploy = await deploy("WalletScheme", {
    name: "QuickWalletScheme",
    from: deployer,
    args: [],
    deterministicDeployment: `${deploySalt}01`,
  });

  const masterWalletScheme = await WalletScheme.at(
    masterWalletSchemeDeploy.address
  );

  const quickWalletScheme = await WalletScheme.at(
    quickWalletSchemeDeploy.address
  );

  const avatarDeployed = await deployments.get("DAOAvatar");
  const dxdVotingMachineDeployed = await deployments.get("VotingMachine");
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
  const DXDVotingMachine = await hre.artifacts.require("VotingMachine");
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
    daoBounty: web3.utils.toWei("0.1"),
    boostedVoteRequiredPercentage: 100,
  };

  const defaultParametersArray = [
    defaultParameters.queuedVoteRequiredPercentage,
    defaultParameters.queuedVotePeriodLimit,
    defaultParameters.boostedVotePeriodLimit,
    defaultParameters.preBoostedVotePeriodLimit,
    defaultParameters.thresholdConst,
    defaultParameters.quietEndingPeriod,
    defaultParameters.daoBounty,
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
  "DAOAvatar",
  "VotingMachine",
  "Controller",
  "PermissionRegistry",
];
