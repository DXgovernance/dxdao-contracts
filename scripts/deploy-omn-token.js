const hre = require("hardhat");
const fs = require("fs");
const web3 = hre.web3;

async function main() {
    const OMNToken = await hre.ethers.getContractFactory("OMNToken");
    const omnToken = await hre.upgrades.deployProxy(OMNToken, []);
    await omnToken.deployed();
    console.log("OMNToken Proxy deployed to:", omnToken.address);
    console.log("You can get the implementation address to validate from https://NETWORK.etherscan.io/proxyContractChecker?a=PROXY_ADDRESS")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
