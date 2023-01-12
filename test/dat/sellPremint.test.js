const BigNumber = require("bignumber.js");
const { deployDAT } = require("../../scripts/DAT");

contract("dat / sellPremint", accounts => {
  const [beneficiary, buyer, other] = accounts;
  const initReserve = web3.utils.toWei("10000", "ether");
  let buyAmount;
  const sellAmount = web3.utils.toWei("500", "ether");
  let contracts;

  before(async () => {
    contracts = await deployDAT(hre, { beneficiary, initReserve });
    await contracts.dat.transfer(other, initReserve, {
      from: beneficiary,
      gas: 9000000,
    });

    const value = web3.utils.toWei("100", "ether");
    buyAmount = await contracts.dat.estimateBuyValue(value);
    await contracts.dat.buy(buyer, value, 1, {
      from: buyer,
      value,
      gas: 9000000,
    });
    await contracts.dat.sell(other, sellAmount, 1, {
      from: other,
      gas: 9000000,
    });
  });

  it("initReserve has been reduced by sellAmount", async () => {
    const actual = await contracts.dat.initReserve();
    const expected = new BigNumber(initReserve)
      .plus(buyAmount)
      .minus(sellAmount);
    assert.equal(actual.toString(), expected.toFixed());
  });
});
