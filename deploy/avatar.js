module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const DAOAvatar = await hre.artifacts.require("DAOAvatar");
  const tx = await deployer.deploy(DAOAvatar.bytecode, deploySalt, {
    from: deployerAddress,
  });
  const daoAvatarAddress = tx.logs[0].args[0];

  save("DAOAvatar", {
    abi: DAOAvatar.abi,
    address: daoAvatarAddress,
    receipt: tx.receipt,
    bytecode: DAOAvatar.bytecode,
    deployedBytecode: DAOAvatar.deployedBytecode,
  });

  const daoAvatar = await DAOAvatar.at(daoAvatarAddress);

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
module.exports.dependencies = ["Create2", "Controller"];

