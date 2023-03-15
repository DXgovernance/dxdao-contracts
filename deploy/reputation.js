module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer, tokenHolder, tokenHolder2, tokenHolder3 } =
    await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const DAOReputation = await hre.artifacts.require("DAOReputation");

  const daoReputationDeploy = await deploy("DAOReputation", {
    name: "DAOReputation",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });

  const daoReputation = await DAOReputation.at(daoReputationDeploy.address);

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
