const { deployDAT } = require("../../scripts/DAT");

const { tokens } = require("hardlydifficult-eth");
const { MAX_UINT } = require("../helpers/constants");
const { expectRevert } = require("@openzeppelin/test-helpers");

contract("dat / capSupply", accounts => {
  let contracts;
  let token;
  const buyer = accounts[2];

  before(async () => {
    token = await tokens.sai.deploy(hre.web3, accounts[0]);
    contracts = await deployDAT(hre, { currency: token.address });
    await token.mint(buyer, MAX_UINT, {
      from: accounts[0],
    });
    await token.approve(contracts.dat.address, MAX_UINT, {
      from: buyer,
    });
    await contracts.dat.buy(
      buyer,
      "30000000000000000000000000000000000000000000000000000000",
      1,
      {
        from: buyer,
        gas: 9000000,
      }
    );
  });

  it("supply is near cap", async () => {
    const reserve = await contracts.dat.totalSupply();
    assert.equal(reserve.toString(), "77459666924148337745585307995647992216");
  });

  it("buying over cap shouldFail", async () => {
    await expectRevert(
      contracts.dat.buy(
        buyer,
        "30000000000000000000000000000000000000000000000000000000",
        1,
        {
          from: buyer,
          gas: 9000000,
        }
      ),
      "EXCESSIVE_SUPPLY"
    );
  });
});
