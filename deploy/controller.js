module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Controller = await hre.artifacts.require("DAOController");
  const DAOReputation = await hre.artifacts.require("DAOReputation");

  const controllerDeploy = await deploy("DAOController", {
    name: "Controller",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });

  const controller = await Controller.at(controllerDeploy.address);

  const dxdVotingMachineDeployed = await deployments.get("DXDVotingMachine");
  const daoReputationDeployed = await deployments.get("DAOReputation");
  const daoReputation = await DAOReputation.at(daoReputationDeployed.address);
  await daoReputation.transferOwnership(controller.address);

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

  await controller.initialize(
    deployer,
    daoReputationDeployed.address,
    defaultParamsHash
  );

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: controller.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`Controller address ${controller.address}`);
};

module.exports.tags = ["Controller"];
module.exports.dependencies = ["DAOReputation", "DXDVotingMachine"];

