require("@nomiclabs/hardhat-web3");

contract("DXvote develop deployment", function () {
  it("Deploy DXvote", async function () {
    await hre.run("deploy-dxvote-develop");
  });
});
