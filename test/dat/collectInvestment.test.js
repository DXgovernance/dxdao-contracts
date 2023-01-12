const { deployDAT } = require("../../scripts/DAT");

const { tokens } = require("hardlydifficult-eth");
const { MAX_UINT } = require("../helpers/constants");
const { expectRevert } = require("@openzeppelin/test-helpers");

contract("dat / collectInvestment", accounts => {
  it("shouldFail with DO_NOT_SEND_ETH", async () => {
    const token = await tokens.sai.deploy(hre.web3, accounts[0]);
    const contracts = await deployDAT(hre, { currency: token.address });
    await token.mint(accounts[1], MAX_UINT, {
      from: accounts[0],
    });
    await token.approve(contracts.dat.address, MAX_UINT, {
      from: accounts[1],
    });
    await expectRevert(
      contracts.dat.buy(accounts[1], "100000000000000000000", 1, {
        from: accounts[1],
        value: 1,
      }),
      "DO_NOT_SEND_ETH"
    );
  });
});
