import BigNumber from "bignumber.js";
import { tokens } from "hardlydifficult-eth";
import { deployDAT } from "../../scripts/DAT";
import { expectRevert } from "@openzeppelin/test-helpers";
import { DAT_STATES, ZERO_ADDRESS, MAX_UINT } from "../helpers/constants";

contract("dat / pay", accounts => {
  let contracts;
  const buyer = accounts[2];
  const investor = accounts[3];
  const payAmount = "42000000000000000000";

  beforeEach(async () => {
    contracts = await deployDAT(hre, {});

    await contracts.dat.buy(buyer, "100000000000000000000", 1, {
      value: "100000000000000000000",
      from: buyer,
      gas: 9000000,
    });
  });

  it("Sanity check: state is run", async () => {
    const state = await contracts.dat.state();
    assert.equal(state.toString(), DAT_STATES.RUN);
  });

  describe("on pay", () => {
    let investorBalanceBefore;

    beforeEach(async () => {
      investorBalanceBefore = new BigNumber(
        await contracts.dat.balanceOf(investor)
      );
      await contracts.dat.pay(ZERO_ADDRESS, payAmount, {
        from: investor,
        value: payAmount,
      });
    });

    it("The investor balance did not change", async () => {
      const balance = new BigNumber(await contracts.dat.balanceOf(investor));
      assert.equal(balance.toFixed(), investorBalanceBefore.toFixed());
    });
  });

  it("can make a tiny payment", async () => {
    await contracts.dat.pay(investor, "1", {
      from: investor,
      value: "1",
    });
  });

  it("shouldFail if currencyValue is missing", async () => {
    // Redeploy with an erc-20
    const token = await tokens.sai.deploy(web3, accounts[0]);
    await token.mint(accounts[0], MAX_UINT, { from: accounts[0] });
    const contracts = await deployDAT(
      hre,
      {
        initGoal: "0", // Start in the run state
        currency: token.address,
      },
      false
    );
    await token.approve(contracts.dat.address, MAX_UINT, {
      from: investor,
    });
    await expectRevert(
      contracts.dat.pay(investor, "0", {
        from: investor,
        gas: 9000000,
      }),
      "MISSING_CURRENCY"
    );
  });
});
