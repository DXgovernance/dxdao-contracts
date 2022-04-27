require("@nomiclabs/hardhat-web3");

contract("DXvote develop deployment", function () {
  it("Deploy DXvote", async function () {
    this.timeout(300000);
    await hre.run("deploy-dxvote-develop");
  });
});
