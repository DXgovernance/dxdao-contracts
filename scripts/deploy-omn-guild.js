const hre = require("hardhat");
const fs = require("fs");
const moment = require('moment');
const web3 = hre.web3;

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOKEN_ADDRESS = "0xDcB2193aadCDfB9737C321011D991c35a77aaFad"

async function main() {
  const OMNGuild = await hre.ethers.getContractFactory("OMNGuild");
  const omnToken = await hre.upgrades.deployProxy(OMNGuild, [
      TOKEN_ADDRESS, // address token,
      moment.duration(7, 'days').asSeconds(), // uint256 _proposalTime,
      moment.duration(1, 'days').asSeconds(), // uint256 _timeForExecution,
      2500, //uint256 _votesForExecution,
      100, // uint256 _votesForCreation,
      0, //uint256 _voteGas,
      0, // uint256 _maxGasPrice,
      moment.duration(2, 'months').asSeconds(), //uint256 _lockTime,
      web3.utils.toWei("1000"), // uint256 _maxAmountVotes,
      NULL_ADDRESS, // address _realityIO
    ], {initializer: "initialize(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)"}
  );

  await omnToken.deployed();
  console.log("OMNGuild Proxy deployed to:", omnToken.address);
  console.log("You can get the implementation address to validate from https://NETWORK.etherscan.io/proxyContractChecker?a=PROXY_ADDRESS")

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
