import { assert, expect } from "chai";

const { expectEvent, expectRevert } = require("@openzeppelin/test-helpers");

const DAOReputation = artifacts.require("./DAOReputation.sol");

contract("DAOReputation", async accounts => {
  let tokenName, tokenSymbol, daoReputation, addresses, amounts;
  beforeEach(async () => {
    tokenName = "TESTREP";
    tokenSymbol = "TREP";

    addresses = [accounts[0], accounts[1], accounts[2]];
    amounts = [100, 200, 300];

    daoReputation = await DAOReputation.new();
    await daoReputation.initialize(tokenName, tokenSymbol, {
      from: accounts[0],
    });
  });

  it("should not be able to transfer tokens", async () => {
    await expectRevert(
      daoReputation.transfer(accounts[1], 100),
      "DAOReputation__NoTransfer()"
    );
  });

  it("should mint rep tokens", async () => {
    const repHolder = accounts[0];
    const amount = 100;
    const mint = await daoReputation.mint(repHolder, amount);

    const reputationBalance = await daoReputation.balanceOf(repHolder);
    expect(mint, true);
    await expectEvent(mint.receipt, "Mint", {
      _to: repHolder,
      _amount: amount.toString(),
    });
    expect(reputationBalance.toNumber(), amount);
  });

  it("should burn rep tokens", async () => {
    // Mint some tokens to burn first
    const repHolder = accounts[0];
    const amount = 100;
    await daoReputation.mint(repHolder, amount);

    // Burn the tokens
    const burn = await daoReputation.burn(repHolder, amount);
    const reputationBalance = await daoReputation.balanceOf(repHolder);

    expect(burn, true);
    await expectEvent(burn.receipt, "Burn", {
      _from: repHolder,
      _amount: amount.toString(),
    });
    expect(reputationBalance.toNumber(), 0);
  });

  it("should mint rep tokens to multiple addresses", async () => {
    const mintMultiple = await daoReputation.mintMultiple(addresses, amounts);
    expect(mintMultiple, true);

    const reputationBalance0 = await daoReputation.balanceOf(addresses[0]);
    const reputationBalance1 = await daoReputation.balanceOf(addresses[1]);
    const reputationBalance2 = await daoReputation.balanceOf(addresses[2]);
    assert.equal(reputationBalance0.toNumber(), amounts[0]);
    assert.equal(reputationBalance1.toNumber(), amounts[1]);
    assert.equal(reputationBalance2.toNumber(), amounts[2]);
  });

  it("should burn rep tokens to multiple addresses", async () => {
    // Mint tokens to addresses first
    await daoReputation.mintMultiple(addresses, amounts);
    // Burn the tokens to addresses
    const amountToBurn = 100;
    const burnMultiple = await daoReputation.burnMultiple(
      addresses,
      amountToBurn
    );
    expect(burnMultiple, true);

    const reputationBalance0 = await daoReputation.balanceOf(addresses[0]);
    const reputationBalance1 = await daoReputation.balanceOf(addresses[1]);
    const reputationBalance2 = await daoReputation.balanceOf(addresses[2]);

    assert.equal(reputationBalance0.toNumber(), 0);
    assert.equal(reputationBalance1.toNumber(), 100);
    assert.equal(reputationBalance2.toNumber(), 200);
  });
});
