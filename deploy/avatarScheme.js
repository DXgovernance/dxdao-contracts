module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const AvatarScheme = await hre.artifacts.require("AvatarScheme");
  const tx = await deployer.deploy(AvatarScheme.bytecode, deploySalt, {
    from: deployerAddress,
  });
  const avatarSchemeAddress = tx.logs[0].args[0];

  save("AvatarScheme", {
    abi: AvatarScheme.abi,
    address: avatarSchemeAddress,
    receipt: tx.receipt,
    bytecode: AvatarScheme.bytecode,
    deployedBytecode: AvatarScheme.deployedBytecode,
  });

  const avatarScheme = await AvatarScheme.at(avatarSchemeAddress);

  const avatarDeployed = await deployments.get("DAOAvatar");
  const dxdVotingMachineDeployed = await deployments.get("DXDVotingMachine");
  const controllerDeployed = await deployments.get("DAOController");
  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );

  try {
    await avatarScheme.initialize(
      avatarDeployed.address,
      dxdVotingMachineDeployed.address,
      controllerDeployed.address,
      permissionRegistryDeployed.address,
      "Master Wallet",
      5
    );
  } catch (e) {
    console.warn("Avatar scheme is already deployed.");
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
    avatarScheme.address,
    defaultParamsHash,
    false,
    true,
    true
  );

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: avatarScheme.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`AvatarScheme address ${avatarScheme.address}`);
};

module.exports.tags = ["AvatarScheme"];
module.exports.dependencies = [
  "Create2",
  "DAOAvatar",
  "DXDVotingMachine",
  "Controller",
  "PermissionRegistry",
];

