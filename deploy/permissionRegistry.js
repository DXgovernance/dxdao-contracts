module.exports = async ({ getNamedAccounts, deployments }) => {
  const { save } = deployments;
  const { deployer: deployerAddress } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;
  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");

  const Create2Deployer = await hre.artifacts.require("Create2Deployer");
  const deployerDeployed = await deployments.get("Create2Deployer");
  const deployer = await Create2Deployer.at(deployerDeployed.address);

  const tx = await deployer.deploy(PermissionRegistry.bytecode, deploySalt, {
    from: deployerAddress,
  });
  const permissionRegistryAddress = tx.logs[0].args[0];

  save("PermissionRegistry", {
    abi: PermissionRegistry.abi,
    address: permissionRegistryAddress,
    receipt: tx.receipt,
    bytecode: PermissionRegistry.bytecode,
    deployedBytecode: PermissionRegistry.deployedBytecode,
  });

  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryAddress
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
module.exports.dependencies = ["Create2Deployer"];
