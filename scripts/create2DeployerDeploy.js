require("@nomiclabs/hardhat-web3");

task("create2DeployerDeploy", "Deploy a Create2Deployer").setAction(
  async () => {
    const create2PrivateDeployer = await hre.artifacts.require(
      "Create2Deployer"
    );
    const web3 = hre.web3;
    const gasPrice = 1000000000 * 100;
    const gasAmount = 3000000;

    const deployResult = await hre.run("keylessDeploy", {
      bytecode: create2PrivateDeployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: false,
    });

    const sender = (await web3.eth.getAccounts())[0];

    if (hre.network.name === "hardhat")
      await web3.eth.sendTransaction({
        to: deployResult.deployerAddress,
        value: gasPrice * gasAmount,
        from: sender,
      });

    return await hre.run("keylessDeploy", {
      bytecode: create2PrivateDeployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: true,
    });
  }
);
