import { deployDAT } from "../../scripts/DAT";

/*
Testing the following scenario, which was a bug in version <= 2:
  state == RUN
  reserve == 15672691058
  totalSupply == 317046271116763072800229
  burnedSupply == 0
  quantityToSell == 1
  estimatedSellValue == 0 (was MAX_UINT)
 */
contract("dat / sellSmallValue", accounts => {
  let contracts;

  before(async () => {
    contracts = await deployDAT(hre, {
      initReserve: "317046271116763072800229",
      buySlopeNum: "1",
      buySlopeDen: "100000000000000000000000",
    });

    // Transfer ETH to set the correct buybackReserve
    await hre.web3.eth.sendTransaction({
      to: contracts.dat.address,
      value: "15672691058",
      from: accounts[2],
    });
  });

  it("is in the correct state", async () => {
    const actual = await contracts.dat.state();
    assert.equal(actual.toString(), "1");
  });

  it("has correct reserve", async () => {
    const actual = await contracts.dat.buybackReserve();
    assert.equal(actual.toString(), "15672691058");
  });

  it("has correct totalSupply", async () => {
    const actual = await contracts.dat.totalSupply();
    assert.equal(actual.toString(), "317046271116763072800229");
  });

  it("has correct burnedSupply", async () => {
    const actual = await contracts.dat.burnedSupply();
    assert.equal(actual.toString(), "0");
  });

  it.skip("estimateSellValue is correct", async () => {
    const actual = await contracts.dat.estimateSellValue("1");
    assert.equal(actual.toString(), "0");
  });
});
