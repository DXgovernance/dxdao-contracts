function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const waitBlocks = async function (blocks) {
  const toBlock = (await web3.eth.getBlock("latest")).number + blocks;
  while ((await web3.eth.getBlock("latest")).number < toBlock) {
    await sleep(500);
  }
  return;
};

module.exports = {
  waitBlocks,
};
