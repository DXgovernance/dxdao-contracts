require("@nomiclabs/hardhat-web3");

task("dxdaoFinanceGuildDeployer", "Deploy the DXdao Finance Guild").setAction(
  async () => {
    const DXdaoFinanceGuildDeployer = await hre.artifacts.require(
      "DXdaoFinanceGuildDeployer"
    );
    const web3 = hre.web3;
    const gasPrice = 1000000000 * 100;
    const gasAmount = 9000000;

    const deployResult = await hre.run("keylessDeploy", {
      bytecode: DXdaoFinanceGuildDeployer.bytecode,
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

    await hre.run("keylessDeploy", {
      bytecode: DXdaoFinanceGuildDeployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: true,
    });

    return;
  }
);
