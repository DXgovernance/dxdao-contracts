require("@nomiclabs/hardhat-web3");
const moment = require("moment");

task("dxdGuildDeployer", "Deploy the DXD Guild")
  .addParam("dxdToken", "The address of the DXD token")
  .addParam("votingMachine", "The address of the voting machine")
  .setAction(async ({ dxdToken, votingMachine }) => {
    const DXDGuild = await hre.artifacts.require("DXDGuild");
    const PermissionRegistry = await hre.artifacts.require(
      "PermissionRegistry"
    );
    const web3 = hre.web3;
    const gasPrice = 1000000000 * 100;
    const gasAmount = 9000000;
    const sender = (await web3.eth.getAccounts())[0];
    const nanoUniverDeployerAddress =
      "0x094a76A420D99aD9d233b5E0A37e5ceA44DF2FBC";

    console.log(await web3.eth.getCode(nanoUniverDeployerAddress));

    if ((await web3.eth.getCode(nanoUniverDeployerAddress)) === "0x")
      await hre.run("nanoUniversalDeployerDeploy");

    const deployTx = await web3.eth.sendTransaction({
      to: nanoUniverDeployerAddress,
      data: DXDGuild.bytecode,
      gasPrice: gasPrice,
      gas: gasAmount,
      from: sender,
    });

    const dxdGuildAddress = web3.eth.abi.decodeLog(
      [{ type: "address", name: "_addr" }],
      deployTx.logs[0].data
    )[0];

    const permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    const dxdGuild = await DXDGuild.at(dxdGuildAddress);
    await dxdGuild.initialize(
      dxdToken,
      moment.duration(3, "days").asSeconds(),
      moment.duration(1, "days").asSeconds(),
      5000,
      100,
      0,
      0,
      5,
      moment.duration(7, "days").asSeconds(),
      permissionRegistry.address,
      votingMachine
    );

    await permissionRegistry.setETHPermissionDelay(dxdGuild.address, 1);
    await permissionRegistry.transferOwnership(dxdGuild.address);

    return;
  });
