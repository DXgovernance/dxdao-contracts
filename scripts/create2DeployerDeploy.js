require("@nomiclabs/hardhat-web3");

task("create2DeployerDeploy", "Deploy a Create2Deployer").setAction(
  async () => {
    const Create2Deployer = await hre.artifacts.require("Create2Deployer");
    const web3 = hre.web3;
    const gasPrice = 100000000000;
    const gasAmount = 1714048;
    const totalGasCost = gasPrice * gasAmount;

    const deployResult = await hre.run("keylessDeploy", {
      bytecode: Create2Deployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: false,
    });

    // Gas cost: 0.1714048 ETH
    // Deployer account: 0x798B8a5EbC8317d6e9718821575e298A29F626fA
    // Contract address: 0x77ea3E69657D9686d0F5a984bE2Cb03424f66F80

    const sender = (await web3.eth.getAccounts())[0];
    const deployerBalance = await web3.eth.getBalance(
      deployResult.deployerAddress
    );

    if (hre.network.name === "hardhat")
      await web3.eth.sendTransaction({
        to: deployResult.deployerAddress,
        value: gasPrice * gasAmount,
        from: sender,
      });
    else if (deployerBalance < totalGasCost) {
      console.log(
        "Deployer account does not have enough funds to pay for gas cost.",
        "Send 0.1714048 ETH to",
        deployResult.deployerAddress
      );
      return;
    }

    return await hre.run("keylessDeploy", {
      bytecode: Create2Deployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: true,
    });
  }
);
