require("@nomiclabs/hardhat-web3");

task("dxdaoDevopsGuildDeployer", "Deploy the DXdao Devops Guild").setAction(
  async () => {
    const DXdaoDevopsGuildDeployer = await hre.artifacts.require(
      "DXdaoDevopsGuildDeployer"
    );
    const web3 = hre.web3;
    const gasPrice = 1000000000 * 100;
    const gasAmount = 9000000;

    const deployResult = await hre.run("keylessDeploy", {
      bytecode: DXdaoDevopsGuildDeployer.bytecode,
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
      bytecode: DXdaoDevopsGuildDeployer.bytecode,
      signaturevalue:
        "1820182018201820182018201820182018201820182018201820182018201820",
      gas: gasAmount,
      gasprice: gasPrice,
      execute: true,
    });

    return;
  }
);
