module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const DAOAvatar = await hre.artifacts.require("DAOAvatar");

  const daoAvatarDeploy = await deploy("DAOAvatar", {
    name: "DAOAvatar",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });

  const daoAvatar = await DAOAvatar.at(daoAvatarDeploy.address);

  const controllerDeployed = await deployments.get("DAOController");

  await daoAvatar.initialize(controllerDeployed.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: daoAvatar.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DAOAvatar address ${daoAvatar.address}`);
};

module.exports.tags = ["DAOAvatar"];
module.exports.dependencies = ["Controller"];

