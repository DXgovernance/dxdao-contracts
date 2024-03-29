module.exports = async ({ getNamedAccounts, deployments }) => {
  if (hre.network.name !== "mainnet" && hre.network.name !== "xdai") {
    const { deploy } = deployments;
    const { deployer, tokenHolder } = await getNamedAccounts();
    const deploySalt = process.env.DEPLOY_SALT;

    const dxdTokenDeploy = await deploy("ERC20Mock", {
      name: "DXDToken",
      from: deployer,
      args: ["DXD token", "DXD", hre.web3.utils.toWei("1000"), tokenHolder],
      deterministicDeployment: deploySalt,
    });

    process.env.DXD_ADDRESS = dxdTokenDeploy.address;
    console.log(`DXDToken address ${dxdTokenDeploy.address}`);
  }
};

module.exports.tags = ["DXDToken"];
