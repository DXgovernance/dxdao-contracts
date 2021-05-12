const fs = require('fs');
const hre = require("hardhat");
const web3 = hre.web3;
require('dotenv').config();
const BN = web3.utils.BN;

// Get network to use from arguments
const repTokenAddress = {
  mainnet: "0x7a927a93f221976aae26d5d077477307170f0b7c"
};
const fromBlock = process.env.REP_FROM_BLOCK;
const toBlock = process.env.REP_TO_BLOCK;

const DXRepABI = [{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_user","type":"address"},{"name":"_amount","type":"uint256"}],"name":"mint","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_blockNumber","type":"uint256"}],"name":"balanceOfAt","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"renounceOwnership","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"isOwner","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"_blockNumber","type":"uint256"}],"name":"totalSupplyAt","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_user","type":"address"},{"name":"_amount","type":"uint256"}],"name":"burn","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_to","type":"address"},{"indexed":false,"name":"_amount","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"_from","type":"address"},{"indexed":false,"name":"_amount","type":"uint256"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"previousOwner","type":"address"},{"indexed":true,"name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"}];

const DXRep = new web3.eth.Contract(DXRepABI, repTokenAddress[hre.network.name]);

console.log('Getting rep holders from', repTokenAddress[hre.network.name], hre.network.name);

async function main() {
  const allEvents = await DXRep.getPastEvents("allEvents", {fromBlock, toBlock});
  let addresses = {};
  for (var i = 0; i < allEvents.length; i++) {
    if (allEvents[i].event == 'Mint') {
      const mintedRep = new BN(allEvents[i].returnValues._amount.toString());
      const toAddress = allEvents[i].returnValues._to;
      if (addresses[toAddress]) {
        addresses[toAddress] = addresses[toAddress].add(mintedRep);
      } else {
        addresses[toAddress] = mintedRep;
      }
    }
  }
  for (var i = 0; i < allEvents.length; i++) {
    if (allEvents[i].event == 'Burn') {
      const burnedRep = new BN(allEvents[i].returnValues._amount.toString());
      const fromAddress = allEvents[i].returnValues._from;
      addresses[fromAddress] = addresses[fromAddress].sub(burnedRep)
    }
  }
  let totalRep = new BN(0);
  for (var address in addresses) {
    totalRep = totalRep.add(addresses[address])
    addresses[address] = addresses[address].toString();
  }
  const repHolders = {
    addresses: addresses,
    network: hre.network.name,
    repToken: repTokenAddress[hre.network.name],
    fromBlock: fromBlock,
    toBlock: toBlock,
    totalRep: totalRep.toString()
  }
  console.log('REP Holders:', repHolders)
  fs.writeFileSync('.repHolders.json', JSON.stringify(repHolders, null, 2));
} 

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
