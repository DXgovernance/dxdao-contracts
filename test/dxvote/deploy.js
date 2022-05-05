require("@nomiclabs/hardhat-web3");

contract("DXvote develop deployment", function () {
  it("Deploy DXvote", async function () {
    // TODO: See how this tests can be run in github CI, the use the setTimeout breaks the tests

    if (!process.env.CI) await hre.run("deploy-dxvote-develop");
    else return;
  });
});
