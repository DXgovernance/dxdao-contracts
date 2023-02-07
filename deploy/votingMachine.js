module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const VotingMachine = await hre.artifacts.require("VotingMachine");

  const dxdTokenDeployed = await deployments.get("ERC20Mock");

  const votingMachineDeploy = await deploy("VotingMachine", {
    name: "VotingMachine",
    from: deployer,
    args: [dxdTokenDeployed.address],
    deterministicDeployment: deploySalt,
  });

  const votingMachine = await VotingMachine.at(votingMachineDeploy.address);

  if (process.env.ETHERSCAN_API_KEY && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: votingMachine.address,
        constructorArguments: [],
      });
    } catch (error) {
      console.error("Error verifying contract", error);
    }
  }

  console.log(`VotingMachine address ${votingMachine.address}`);
};

module.exports.tags = ["VotingMachine"];
module.exports.dependencies = ["DXDToken"];

