const Avatar = artifacts.require("./Avatar.sol");
const Controller = artifacts.require("./Controller.sol");
const EthDecoder = require("@maticnetwork/eth-decoder");
const WalletScheme = artifacts.require("./WalletScheme.sol");

export function encodeGenericCallData(avatar, to, data, value) {
  return new web3.eth.Contract(Controller.abi).methods
    .genericCall(to, data, avatar, value).encodeABI();
}

export function getWalletSchemeEvent(tx, eventName) {
 const logDecoder = new EthDecoder.default.LogDecoder( [WalletScheme.abi] );
  const logs = logDecoder.decodeLogs(tx.receipt.rawLogs);
  return logs.find((event) => event.name == eventName);
}
