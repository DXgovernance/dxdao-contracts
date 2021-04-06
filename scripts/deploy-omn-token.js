const hre = require("hardhat");
const fs = require("fs");
const web3 = hre.web3;

const PROXY_OWNER = "0x4F46d722d1699E9099e7597c80c78b7225E0100f";

async function main() {
  const OMNToken = await hre.ethers.getContractFactory("OMNToken");
  const omnToken = await hre.upgrades.deployProxy(OMNToken, []);
  await omnToken.deployed();
  
  const proxyAdmin = await hre.upgrades.admin.getInstance();
  await proxyAdmin.changeProxyAdmin(omnToken.address, PROXY_OWNER, { gasLimit: 1000000 });
  await proxyAdmin.transferOwnership(PROXY_OWNER, { gasLimit: 1000000 });

  console.log("Proxy Admin:", proxyAdmin.address);
  console.log("OMNToken Proxy deployed to:", omnToken.address);
  console.log("You can get the implementation address to validate from https://NETWORK.etherscan.io/proxyContractChecker?a=PROXY_ADDRESS")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
