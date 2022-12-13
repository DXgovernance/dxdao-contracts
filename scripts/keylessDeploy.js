require("@nomiclabs/hardhat-web3");

const Transaction = require("ethereumjs-tx").Transaction;
const { types } = require("hardhat/config");

task("keylessDeploy", "Deploy a smart contract without a private key")
  .addParam("bytecode", "The bytecode to be deployed")
  .addParam(
    "signaturevalue",
    "The values to replace the r and s signature values",
    "1234123412341234123412341234123412341234123412341234123412341234",
    types.string
  )
  .addParam(
    "gas",
    "The amount of gas to be used, default 1000000",
    1000000,
    types.int
  )
  .addParam(
    "gasprice",
    "The gas price to be used, default 100 gwei",
    100000000000,
    types.int
  )
  .addOptionalParam(
    "execute",
    "If the deployment should be executed at the end of the task",
    false,
    types.boolean
  )
  .setAction(async ({ bytecode, signaturevalue, gas, gasprice, execute }) => {
    const rlp = hre.ethers.utils.RLP;

    const genRanHex = size =>
      [...Array(size)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");

    const calcContractAddress = function (sender) {
      return web3.utils.toChecksumAddress(
        "0x" +
          web3.utils
            .keccak256(rlp.encode([sender, "0x"]))
            .slice(12)
            .substring(14)
      );
    };

    const bytesFromNumber = num => {
      let hex = num.toString(16);
      return hex.length % 2 === 0 ? "0x" + hex : "0x0" + hex;
    };

    const bytesToNumber = hex => parseInt(hex.slice(2), 16);

    const flatten = a => "0x" + a.reduce((r, s) => r + s.slice(2), "");

    const encodeSignature = ([v, r, s]) => flatten([r, s, v]);

    const recoverTransaction = function (rawTx) {
      var values = rlp.decode(rawTx);
      var signature = encodeSignature(values.slice(6, 9));
      var recovery = bytesToNumber(values[6]);
      var extraData =
        recovery < 35
          ? []
          : [bytesFromNumber((recovery - 35) >> 1), "0x", "0x"];
      var signingData = values.slice(0, 6).concat(extraData);
      var signingDataHex = rlp.encode(signingData);
      return hre.ethers.utils.recoverAddress(
        web3.utils.keccak256(signingDataHex),
        signature
      );
    };

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

    const replaceablePrivateKey = "0x" + genRanHex(64);

    // Build and sign the deployment transaction with a fake signature
    let signedTx = signTransaction(
      {
        data: bytecode,
        nonce: "0x00",
        value: "0x00",
        gas: web3.utils.toHex(gas),
        gasPrice: web3.utils.toHex(gasprice),
      },
      replaceablePrivateKey
    );

    // Change the raw signature r,s and v values to hardcoded values
    let r = "a0" + signedTx.r.replace("0x", "");
    let s = "a0" + signedTx.s.replace("0x", "");
    let v = signedTx.v.replace("0x", "");

    let rawTx = signedTx.rawTransaction.replace(r, "").replace(s, "");
    rawTx = rawTx.substr(0, rawTx.length - v.length) + "1c";
    rawTx = rawTx + "a0" + signaturevalue + "a0" + signaturevalue;

    // Get the signer of the transaction we just built
    const deployerAddress = recoverTransaction(rawTx);

    let receipt;
    if (execute) {
      // Send the raw transaction and execute the deployment of the contract
      receipt = await web3.eth.sendSignedTransaction(rawTx);
    }

    return {
      deployerAddress,
      rawTransaction: signedTx.rawTransaction,
      contractAddress: calcContractAddress(deployerAddress),
      deployReceipt: receipt,
    };
  });
