require("@nomiclabs/hardhat-web3");

const { deploy } = require("../../scripts/deploy-dxvote-develop");

contract("DXvote develop deployment", function () {
  it.only("Deploy DXvote", function (done) {
    this.timeout(300000);
    deploy()
      .then(function () {
        done();
      })
      .catch(function (error) {
        throw error;
      });
  });
});
