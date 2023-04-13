require("@nomiclabs/hardhat-web3");

const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const Web3 = require("web3");

task(
  "testMerkleTree",
  "Generate the merkle tree to be used for testing"
).setAction(async () => {
  const accounts = await hre.web3.eth.getAccounts();

  // Set the WETH amount to be distributed
  const tokenAmount = 100;

  const receivers = [
    accounts[0],
    accounts[1],
    accounts[2],
    accounts[3],
    accounts[4],
  ];

  const percentages = [40, 20, 20, 10, 10];

  // We get the sum of all percentages that is around 100
  const sumOfAllPercentages = percentages.reduce((a, b) => a + b, 0);

  const generateLeaf = function (address, value) {
    return Buffer.from(
      // Hash in appropriate Merkle format
      web3.utils.soliditySha3(address, value.toString()).slice(2),
      "hex"
    );
  };

  const leaves = [];

  // Generate merkle tree
  const merkleTree = new MerkleTree(
    receivers.map((receiver, i) => {
      const amountToSend = Web3.utils.toWei(
        ((tokenAmount / sumOfAllPercentages) * percentages[i]).toString()
      );
      const leaf = generateLeaf(receiver, amountToSend);
      leaves.push({
        address: receiver,
        amount: amountToSend,
        hex: leaf.toString("hex"),
        proof: [],
      });
      return leaf;
    }),
    keccak256,
    { sortPairs: true }
  );

  // Get the Merkle Root
  const merkleRoot = merkleTree.getHexRoot();

  // Now that the MerkleTree is generated we calculate the proof of each leaf
  console.log("Receiver, AmountToSend, Leaf Hex, Leaf Proof");
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const proof = merkleTree.getHexProof(Buffer.from(leaf.hex, "hex"));
    leaf.proof = proof;
    console.log(leaf.address, leaf.amount, leaf.hex, leaf.proof);
  }

  return {
    merkleRoot,
    leaves,
  };
});
