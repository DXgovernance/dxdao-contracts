module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");

  const permissionRegistryDeploy = await deploy("PermissionRegistry", {
    name: "PermissionRegistry",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });
  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryDeploy.address
  );

  try {
    await permissionRegistry.initialize();
  } catch (e) {
    console.warn("Permission registry is already deployed.");
  }

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: permissionRegistry.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`PermissionRegistry address ${permissionRegistry.address}`);
};

module.exports.tags = ["PermissionRegistry"];
