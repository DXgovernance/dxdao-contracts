const Avatar = artifacts.require("./Avatar.sol");
const Controller = artifacts.require("./Controller.sol");
const EthDecoder = require("@maticnetwork/eth-decoder");
const WalletScheme = artifacts.require("./WalletScheme.sol");

export function encodeGenericCallData(avatar, to, data, value) {
  return new web3.eth.Contract(Controller.abi).methods
    .genericCall(to, data, avatar, value).encodeABI();
}

export function getWalletSchemeExecutionEvent(tx) {
 const logDecoder = new EthDecoder.default.LogDecoder( [WalletScheme.abi] );
  const logs = logDecoder.decodeLogs(tx.receipt.rawLogs);
  return logs.map((event) => {
    if (event.name == 'ProposalExecuted' || event.name == 'ProposalRejected')
      return event;
  })[0]
}
