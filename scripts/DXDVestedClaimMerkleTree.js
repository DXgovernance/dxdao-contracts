require("@nomiclabs/hardhat-web3");

const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const Web3 = require("web3");

task(
  "DXDVestedClaimMerkleTree",
  "Generate the merkle tree to be used for the DXD vested claim"
).setAction(async () => {
  // TODO: Replace names with addresses
  const receivers = [
    { address: "-", amount: 222.2763 },
    { address: "-", amount: 85.9072 },
    { address: "-", amount: 178.0655 },
    { address: "-", amount: 54.18 },
    { address: "-", amount: 55.9854 },
    { address: "-", amount: 19.8886 },
    { address: "-", amount: 307.8232 },
    { address: "-", amount: 85.4479 },
    { address: "-", amount: 130.5309 },
    { address: "-", amount: 114.3433 },
    { address: "-", amount: 328.615 },
    { address: "-", amount: 17.4036 },
    { address: "-", amount: 53.7656 },
    { address: "-", amount: 82.681 },
    { address: "-", amount: 169.1532 },
    { address: "-", amount: 171.4226 },
    { address: "-", amount: 186.2943 },
    { address: "-", amount: 107.6139 },
    { address: "-", amount: 95.6163 },
    { address: "-", amount: 60.0465 },
    { address: "-", amount: 43.5015 },
    { address: "-", amount: 15.8469 },
    { address: "-", amount: 49.1221 },
    { address: "-", amount: 343.7465 },
    { address: "-", amount: 213.4159 },
    { address: "-", amount: 90.9209 },
    { address: "-", amount: 57.0817 },
    { address: "-", amount: 40.11 },
    { address: "-", amount: 9.7774 },
    { address: "-", amount: 55.1107 },
    { address: "-", amount: 27.3945 },
    { address: "-", amount: 30.2452 },
    { address: "-", amount: 4.5656 },
    { address: "-", amount: 116.217 },
    { address: "-", amount: 6.0228 },
    { address: "-", amount: 135.316 },
    { address: "-", amount: 60.2809 },
    { address: "-", amount: 10.8983 },
    { address: "-", amount: 0.4664 },
    { address: "-", amount: 4.3 },
    { address: "-", amount: 58.5 },
    { address: "-", amount: 13.186 },
    { address: "-", amount: 6.596 },
    { address: "-", amount: 7.529 },
    { address: "-", amount: 17.19975 },
    { address: "-", amount: 72.64 },
    { address: "-", amount: 0 },
    { address: "-", amount: 46.48 },
    { address: "-", amount: 40.841 },
    { address: "-", amount: 57.088 },
    { address: "-", amount: 2.61 },
    { address: "-", amount: 74.576 },
  ];

  // We get the sum of all amounts
  const totalDXD = receivers.reduce(
    (acc, receiver) => acc + receiver.amount,
    0
  );
  console.log(
    "Total DXD to be claimed: ",
    totalDXD,
    Web3.utils.toWei(totalDXD.toString())
  );

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
    receivers.map(receiver => {
      const amountToSend = Web3.utils.toWei(receiver.amount.toString());
      const leaf = generateLeaf(receiver.address, amountToSend);
      leaves.push({
        address: receiver.address,
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
