import { assert, expect } from "chai";

const { expectEvent, expectRevert } = require("@openzeppelin/test-helpers");

const DAOReputation = artifacts.require("./DAOReputation.sol");

contract("DAOReputation", async accounts => {
  let tokenName, tokenSymbol, daoReputation, addresses, amounts, owner;
  beforeEach(async () => {
    tokenName = "TESTREP";
    tokenSymbol = "TREP";
    owner = accounts[0];

    addresses = [accounts[0], accounts[1], accounts[2]];
    amounts = [100, 200, 300];

    daoReputation = await DAOReputation.new();
    await daoReputation.initialize(tokenName, tokenSymbol, {
      from: owner,
    });
  });

  it("Should fail if is already initialized", async () => {
    await expectRevert(
      daoReputation.initialize(tokenName, tokenSymbol),
      "Initializable: contract is already initialized"
    );
  });

  it("should not be able to transfer tokens", async () => {
    await expectRevert(
      daoReputation.transfer(accounts[1], 100),
      "ERC20SnapshotRep__NoTransfer()"
    );
  });

  it("should not be able to transferFrom tokens", async () => {
    await daoReputation.approve(accounts[1], 100, { from: accounts[0] });
    await expectRevert(
      daoReputation.transferFrom(accounts[0], accounts[2], 1, {
        from: accounts[1],
      }),
      "ERC20SnapshotRep__NoTransfer()"
    );
  });

  it("should mint rep tokens", async () => {
    const repHolder = accounts[0];
    const amount = 100;
    const mint = await daoReputation.mint(repHolder, amount);

    const reputationBalance = await daoReputation.balanceOf(repHolder);
    expect(mint, true);
    await expectEvent(mint.receipt, "Mint", {
      to: repHolder,
      amount: amount.toString(),
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
      from: repHolder,
      amount: amount.toString(),
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
    const burnMultiple = await daoReputation.burnMultiple(addresses, amounts);
    expect(burnMultiple, true);

    const reputationBalance0 = await daoReputation.balanceOf(addresses[0]);
    const reputationBalance1 = await daoReputation.balanceOf(addresses[1]);
    const reputationBalance2 = await daoReputation.balanceOf(addresses[2]);

    assert.equal(reputationBalance0.toNumber(), 0);
    assert.equal(reputationBalance1.toNumber(), 0);
    assert.equal(reputationBalance2.toNumber(), 0);
  });

  it("Should fail due to onlyOwner modifier", async () => {
    const notTheOwner = accounts[1];
    const ownableAccessError = "Ownable: caller is not the owner";
    await expectRevert(
      daoReputation.mint(accounts[0], 100, { from: notTheOwner }),
      ownableAccessError
    );
    await expectRevert(
      daoReputation.mintMultiple(addresses, [1, 2, 3], { from: notTheOwner }),
      ownableAccessError
    );
    await expectRevert(
      daoReputation.burn(accounts[0], 100, { from: notTheOwner }),
      ownableAccessError
    );
    await expectRevert(
      daoReputation.burnMultiple(addresses, [1, 2, 3], { from: notTheOwner }),
      ownableAccessError
    );
  });
});
