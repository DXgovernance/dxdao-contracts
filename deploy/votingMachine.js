module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const DXDVotingMachine = await hre.artifacts.require("DXDVotingMachine");

  const dxdTokenDeployed = await deployments.get("ERC20Mock");

  const dxdVotingMachineDeploy = await deploy("DXDVotingMachine", {
    name: "DXDVotingMachine",
    from: deployer,
    args: [dxdTokenDeployed.address],
    deterministicDeployment: deploySalt,
  });

  const dxdVotingMachine = await DXDVotingMachine.at(
    dxdVotingMachineDeploy.address
  );

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: dxdVotingMachine.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`DXDVotingMachine address ${dxdVotingMachine.address}`);
};

module.exports.tags = ["DXDVotingMachine"];
module.exports.dependencies = ["DXDToken"];

