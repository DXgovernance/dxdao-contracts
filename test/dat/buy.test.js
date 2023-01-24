/**
 * Tests the ability to buy dat tokens
 */
import { deployDAT } from "../../scripts/DAT";
import { expectRevert } from "@openzeppelin/test-helpers";

contract("dat / buy", accounts => {
  let contracts;
  const buyer = accounts[4];

  before(async () => {
    contracts = await deployDAT(hre);
  });

  it("balanceOf should be 0 by default", async () => {
    const balance = await contracts.dat.balanceOf(buyer);
    assert.equal(balance, 0);
  });

  it("shouldFail with INCORRECT_MSG_VALUE", async () => {
    await expectRevert(
      contracts.dat.buy(buyer, "100000000000000000001", 1, {
        value: "100000000000000000000",
        from: buyer,
      }),
      "INCORRECT_MSG_VALUE"
    );
  });

  describe("can buy tokens", () => {
    before(async () => {
      await contracts.dat.buy(buyer, "100000000000000000000", "1", {
        value: "100000000000000000000",
        from: buyer,
        gas: 9000000,
      });
    });

    it("balanceOf should have increased", async () => {
      const balance = await contracts.dat.balanceOf(buyer);
      assert.equal(balance.toString(), "141421356237309504880");
    });
  });
});
