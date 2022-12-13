import { ethers } from "hardhat";

module.exports = async () => {
  //   const { deploy } = deployments;
  //   const { deployer } = await getNamedAccounts();
  //   const deploySalt = process.env.DEPLOY_SALT;

  const Create2Deployer = await ethers.getContractFactory("Create2Deployer");

  //   const dxdTokenDeploy = await deploy("Create2Deployer", {
  //     name: "DXDToken",
  //     from: deployer,
  //     args: [],
  //     // deterministicDeployment: deploySalt,
  //   });

  const signers = await ethers.getSigners();
  const signer = signers[0];

  console.log({ signer })

  const transaction = signer.signTransaction(
    Create2Deployer.getDeployTransaction()
  );

  console.log(transaction);

  //   process.env.DXD_ADDRESS = dxdTokenDeploy.address;
  //   console.log(`DXDToken address ${dxdTokenDeploy.address}`);
};

module.exports.tags = ["Create2"];

