module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const {
    deployer: deployerAddress,
    tokenHolder,
    tokenHolder2,
    tokenHolder3,
  } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const DAOReputation = await hre.artifacts.require("DAOReputation");

  const tx = await deployer.deploy(DAOReputation.bytecode, deploySalt, {
    from: deployerAddress,
  });
  const daoRepAddress = tx.logs[0].args[0];

  save("DAOReputation", {
    abi: DAOReputation.abi,
    address: daoRepAddress,
    receipt: tx.receipt,
    bytecode: DAOReputation.bytecode,
    deployedBytecode: DAOReputation.deployedBytecode,
  });

  const daoReputation = await DAOReputation.at(daoRepAddress);

  await daoReputation.initialize("DXDaoReputation", "DXRep");

  await daoReputation.mint(tokenHolder, 6000);
  await daoReputation.mint(tokenHolder2, 4000);
  await daoReputation.mint(tokenHolder3, 1000);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: daoReputation.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`Reputation address ${daoReputation.address}`);
};

module.exports.tags = ["DAOReputation"];
module.exports.dependencies = ["Create2"];

