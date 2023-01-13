const BigNumber = require("bignumber.js");
const { time } = require("@openzeppelin/test-helpers");

async function getRequest(tx, web3) {
  if (tx.request) return tx.request;

  const request = await web3.eth.getTransaction(
    tx.tx || tx.hash || tx.transactionHash || tx
  );
  return (tx.request = request);
}

async function getReceipt(tx, web3) {
  if (tx.receipt) return tx.receipt;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const receipt = await web3.eth.getTransactionReceipt(
      tx.tx || tx.hash || tx.transactionHash || tx
    );
    if (receipt) return (tx.receipt = receipt);
    await time.increase(2);
  }
}

export async function getGasCost(tx, web3) {
  await getRequest(tx, web3);
  await getReceipt(tx, web3);
  return new BigNumber(tx.request.gasPrice).times(tx.receipt.gasUsed);
}
