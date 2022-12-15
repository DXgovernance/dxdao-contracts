module.exports = async () => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const create2Deploy = await deploy("Create2Deployer", {
    name: "Create2Deployer",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: create2Deploy.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`Create2Deployer address ${create2Deploy.address}`);
};

module.exports.tags = ["Create2Deployer"];

