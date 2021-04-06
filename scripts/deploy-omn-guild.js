const hre = require("hardhat");
const fs = require("fs");
const moment = require('moment');
const web3 = hre.web3;

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOKEN_ADDRESS = "0x0A08ECa47C56C305F4FeB4fa062AEcd5807BeBb8"
const PROXY_OWNER = "0x4F46d722d1699E9099e7597c80c78b7225E0100f";
const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

async function main() {
  const OMNGuild = await hre.ethers.getContractFactory("OMNGuild");
  const omnGuild = await hre.upgrades.deployProxy(OMNGuild, [
      TOKEN_ADDRESS, // address token,
      moment.duration(7, 'days').asSeconds(), // uint256 _proposalTime,
      moment.duration(1, 'days').asSeconds(), // uint256 _timeForExecution,
      "10000", //uint256 _votesForExecution, 10%
      web3.utils.toWei("100"), // uint256 _votesForCreation, 100 OMN tokens
      0, //uint256 _voteGas,
      0, // uint256 _maxGasPrice,
      moment.duration(2, 'months').asSeconds(), //uint256 _lockTime,
      MAX_INT, // uint256 _maxAmountVotes,
      NULL_ADDRESS, // address _realityIO
    ], {initializer: "initialize(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"}
  );
  
  const proxyAdmin = await hre.upgrades.admin.getInstance();
  await proxyAdmin.changeProxyAdmin(omnGuild.address, PROXY_OWNER, { gasLimit: 1000000 });
  await proxyAdmin.transferOwnership(PROXY_OWNER, { gasLimit: 1000000 });

  await omnGuild.deployed();
  console.log("OMNGuild Proxy deployed to:", omnGuild.address);
  console.log("You can get the implementation address to validate from https://NETWORK.etherscan.io/proxyContractChecker?a=PROXY_ADDRESS")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
