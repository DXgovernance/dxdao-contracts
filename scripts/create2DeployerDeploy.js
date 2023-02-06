require("@nomiclabs/hardhat-web3");

task("create2DeployerDeploy", "Deploy a Create2Deployer").setAction(
  async () => {
    const Create2Deployer = await hre.artifacts.require("Create2Deployer");
    const web3 = hre.web3;
    const gasPrice = 1000000000 * 100;
    const gasAmount = 3000000;

    const deployResult = await hre.run("keylessDeploy", {
      bytecode: Create2Deployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: false,
    });

    // Gast cost: 0.3 ETH
    // keyless deployer account: 0x669082Ee2F478e0cb06a532ea859Bd81AC032cAA

    const sender = (await web3.eth.getAccounts())[0];

    if (hre.network.name === "hardhat")
      await web3.eth.sendTransaction({
        to: deployResult.deployerAddress,
        value: gasPrice * gasAmount,
        from: sender,
      });

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
