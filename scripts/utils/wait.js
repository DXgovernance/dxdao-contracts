export async function waitBlocks(blocks) {
  const toBlock = (await web3.eth.getBlock("latest")).number + blocks;
  while ((await web3.eth.getBlock("latest")).number < toBlock) {
    await sleep(500);
  }
  return;
}
