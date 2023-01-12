const BigNumber = require("bignumber.js");
const { deployDAT } = require("../../scripts/DAT");

const getGasCost = require("../helpers/getGasCost");

contract("dat / to", accounts => {
  let contracts;
  const currencyHolder = accounts[2];
  const dxdHolder = accounts[3];

  beforeEach(async () => {
    contracts = await deployDAT(hre);
  });

  describe("buy", () => {
    const amount = web3.utils.toWei("42", "ether");
    let dxdHolderBalanceBefore;
    let currencyHolderBalanceBefore;
    let tokensIssued;
    let gasPaid;

    beforeEach(async () => {
      dxdHolderBalanceBefore = new BigNumber(
        await contracts.dat.balanceOf(dxdHolder)
      );
      currencyHolderBalanceBefore = new BigNumber(
        await web3.eth.getBalance(currencyHolder)
      );
      tokensIssued = new BigNumber(
        await contracts.dat.estimateBuyValue(amount)
      );
      const tx = await contracts.dat.buy(dxdHolder, amount, 1, {
        from: currencyHolder,
        value: amount,
        gas: 9000000,
      });
      gasPaid = await getGasCost(tx, hre.web3);
    });

    it("sanity check, tokensIssued > 0", async () => {
      assert.notEqual(tokensIssued.toFixed(), 0);
    });

    it("currencyHolder's balance went down", async () => {
      const balance = new BigNumber(await web3.eth.getBalance(currencyHolder));
      assert.equal(
        balance.toFixed(),
        currencyHolderBalanceBefore.minus(amount).minus(gasPaid).toFixed()
      );
    });

    it("dxdHolder's balance went up", async () => {
      const balance = new BigNumber(await contracts.dat.balanceOf(dxdHolder));
      assert.equal(
        balance.toFixed(),
        dxdHolderBalanceBefore.plus(tokensIssued).toFixed()
      );
    });

    describe("sell", () => {
      const amount = "100000000000000000";
      let dxdHolderBalanceBefore;
      let currencyHolderBalanceBefore;
      let currencyReturned;

      beforeEach(async () => {
        dxdHolderBalanceBefore = new BigNumber(
          await contracts.dat.balanceOf(dxdHolder)
        );
        currencyHolderBalanceBefore = new BigNumber(
          await web3.eth.getBalance(currencyHolder)
        );
        currencyReturned = new BigNumber(
          await contracts.dat.estimateSellValue(amount)
        );
        await contracts.dat.sell(currencyHolder, amount, 1, {
          from: dxdHolder,
          gas: 9000000,
        });
      });

      it("sanity check, currencyReturned > 0", async () => {
        assert.notEqual(currencyReturned.toFixed(), 0);
      });

      it("currencyHolder's balance went up", async () => {
        const balance = new BigNumber(
          await web3.eth.getBalance(currencyHolder)
        );
        assert.equal(
          balance.toFixed(),
          currencyHolderBalanceBefore.plus(currencyReturned).toFixed()
        );
      });

      it("dxdHolder's balance went down", async () => {
        const balance = new BigNumber(await contracts.dat.balanceOf(dxdHolder));
        assert.equal(
          balance.toFixed(),
          dxdHolderBalanceBefore.minus(amount).toFixed()
        );
      });
    });
  });
});
