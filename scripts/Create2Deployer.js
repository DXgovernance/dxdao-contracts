require("@nomiclabs/hardhat-web3");

// Executes the deployment specified here https://gist.github.com/Agusx1211/de05dabf918d448d315aa018e2572031

task("Create2Deployer", "Deploy a Create2Deployer").setAction(async () => {
  const create2Deployer = await hre.artifacts.require("Create2Deployer");
  const gasPrice = 1000000000 * 100;
  const gasAmount = 140000;



  const signedTx = signTransaction(
    {
      data: create2Deployer.bytecode,
      nonce: "0x00",
      value: "0x00",
      gas: web3.utils.toHex(gas),
      gasPrice: web3.utils.toHex(gasprice),
    },
    privateKey
  );

  console.log({ signedTx });
});

const signTransaction = function (transaction, privateKey) {
  transaction.to = transaction.to || "0x";
  transaction.data = transaction.data || "0x";
  transaction.value = transaction.value
    ? "0x" + Number(transaction.value).toString(16)
    : "0x";
  transaction.gasLimit = transaction.gas;
  transaction.v = 27;

  var ethTx = new Transaction(transaction);

  privateKey = privateKey.replace("0x", "");
  ethTx.sign(Buffer.from(privateKey, "hex"));

  if (ethTx.validate(true) !== "") {
    throw new Error("Signer Error: " + ethTx.validate(true));
  }
  // console.log(bytecode);

  var rawTransaction = "0x" + ethTx.serialize().toString("hex");
  var transactionHash = web3.utils.keccak256(rawTransaction);

  var result = {
    messageHash: "0x" + Buffer.from(ethTx.hash(false)).toString("hex"),
    v: "0x1c",
    r: "0x" + Buffer.from(ethTx.r).toString("hex"),
    s: "0x" + Buffer.from(ethTx.s).toString("hex"),
    rawTransaction: rawTransaction,
    transactionHash: transactionHash,
  };

  return result;
};
