const { deployDAT } = require("../../scripts/DAT");

const { tokens } = require("hardlydifficult-eth");
const { MAX_UINT } = require("../helpers/constants");

contract("dat / buybackReserve", accounts => {
  let contracts;
  let token;

  before(async () => {
    token = await tokens.sai.deploy(hre.web3, accounts[0]);
    contracts = await deployDAT(hre, { currency: token.address });
  });

  it("buybackReserve should be 0 by default", async () => {
    const reserve = await contracts.dat.buybackReserve();
    assert.equal(reserve, 0);
  });

  describe("once excessive reserve", () => {
    before(async () => {
      await token.mint(contracts.dat.address, MAX_UINT, {
        from: accounts[0],
      });
    });

    it("buybackReserve should report as <= sqrt(MAX_UINT)", async () => {
      const reserve = await contracts.dat.buybackReserve();
      assert.equal(reserve, "340282366920938463463374607431768211455");
    });
  });
});
