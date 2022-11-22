require("@nomiclabs/hardhat-web3");

// Executes the deployment specified here https://gist.github.com/Agusx1211/de05dabf918d448d315aa018e2572031

task("nanoUniversalDeployerDeploy", "Deploy a NanoUniversalDeployer").setAction(
  async () => {
    const nanoUniversalDeployer = await hre.artifacts.require(
      "NanoUniversalDeployer"
    );
    const web3 = hre.web3;
    const gasPrice = 1000000000 * 100;
    const gasAmount = 140000;

    const deployResult = await hre.run("keylessDeploy", {
      bytecode: nanoUniversalDeployer.bytecode,
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

    console.log(
      await hre.run("keylessDeploy", {
        bytecode: nanoUniversalDeployer.bytecode,
        signaturevalue:
          "1820182018201820182018201820182018201820182018201820182018201820",
        gas: gasAmount,
        gasprice: gasPrice,
        execute: true,
      })
    );

    return;
  }
);
