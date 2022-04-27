require("@nomiclabs/hardhat-web3");

contract("DXvote develop deployment", function () {
  it("Deploy DXvote", async function () {
    hre.run("deploy-dxvote-develop");
  });
});
