import { assert } from "chai";
import { artifacts, contract } from "hardhat";
const { expectRevert } = require("@openzeppelin/test-helpers");

const ERC20SnapshotRep = artifacts.require("ERC20SnapshotRep.sol");

contract("ERC20SnapshotRep", accounts => {
  let ERC20SnapshotRepToken;

  beforeEach(async () => {
    ERC20SnapshotRepToken = await ERC20SnapshotRep.new({
      from: accounts[0],
    });
    await ERC20SnapshotRepToken.initialize("DXdao", "DXD");
    await ERC20SnapshotRepToken.mint(accounts[1], 100, { from: accounts[0] });
  });

  it("should not be able to transfer tokens", async () => {
    assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[1]), "100");
    await expectRevert(
      ERC20SnapshotRepToken.transfer(accounts[2], 1, { from: accounts[1] }),
      "ERC20SnapshotRep__NoTransfer()"
    );
  });

  it("should not be able to transferFrom tokens", async () => {
    assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[1]), "100");
    await ERC20SnapshotRepToken.approve(accounts[2], 100, {
      from: accounts[1],
    });
    await expectRevert(
      ERC20SnapshotRepToken.transfer(accounts[3], 1, { from: accounts[2] }),
      "ERC20SnapshotRep__NoTransfer()"
    );
  });

  describe("snapshot balances", () => {
    it("should show right snapshot balances at any time", async () => {
      assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[1]), "100");
      assert.equal(await ERC20SnapshotRepToken.getCurrentSnapshotId(), "1");

      await ERC20SnapshotRepToken.mint(accounts[2], 50, { from: accounts[0] });
      assert.equal(await ERC20SnapshotRepToken.getCurrentSnapshotId(), "2");

      assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[1]), "100");
      assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[2]), "50");

      await ERC20SnapshotRepToken.mint(accounts[2], 25, { from: accounts[0] });
      await ERC20SnapshotRepToken.mint(accounts[3], 50, { from: accounts[0] });
      await ERC20SnapshotRepToken.burn(accounts[1], 90, { from: accounts[0] });
      assert.equal(await ERC20SnapshotRepToken.getCurrentSnapshotId(), "5");

      assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[1]), "10");
      assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[2]), "75");
      assert.equal(await ERC20SnapshotRepToken.balanceOf(accounts[3]), "50");

      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[1], 1),
        "100"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[1], 2),
        "100"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[1], 3),
        "100"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[1], 4),
        "100"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[1], 5),
        "10"
      );

      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[2], 1),
        "0"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[2], 2),
        "50"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[2], 3),
        "75"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[2], 4),
        "75"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[2], 5),
        "75"
      );

      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[3], 1),
        "0"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[3], 2),
        "0"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[3], 3),
        "0"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[3], 4),
        "50"
      );
      assert.equal(
        await ERC20SnapshotRepToken.balanceOfAt(accounts[3], 5),
        "50"
      );
    });
  });

  describe("Add and remove totalHolders", () => {
    it("should return one totalHolder", async () => {
      const totalHolders = await ERC20SnapshotRepToken.getTotalHolders();
      assert.equal(totalHolders, 1);
    });

    it("should add totalHolders", async () => {
      await ERC20SnapshotRepToken.mint(accounts[2], 100, { from: accounts[0] });
      const totalHolders = await ERC20SnapshotRepToken.getTotalHolders();
      assert.equal(totalHolders, 2);
    });
    it("should subtract totalHolders", async () => {
      await ERC20SnapshotRepToken.burn(accounts[1], 100, { from: accounts[0] });

      const totalHolders = await ERC20SnapshotRepToken.getTotalHolders();
      assert.equal(totalHolders, 0);
    });

    it("should not add totalHolders if address has balance", async () => {
      await ERC20SnapshotRepToken.mint(accounts[2], 100, { from: accounts[0] });
      await ERC20SnapshotRepToken.mint(accounts[3], 100, { from: accounts[0] });
      await ERC20SnapshotRepToken.burn(accounts[1], 100, { from: accounts[0] });
      const totalHolders = await ERC20SnapshotRepToken.getTotalHolders();
      assert.equal(totalHolders, 2);
    });
  });

  it("should not subtract totalHolders if address has balance", async () => {
    await ERC20SnapshotRepToken.mint(accounts[2], 1, { from: accounts[0] });
    await ERC20SnapshotRepToken.mint(accounts[3], 1, { from: accounts[0] });
    await ERC20SnapshotRepToken.burn(accounts[1], 99, { from: accounts[0] });
    const totalHolders = await ERC20SnapshotRepToken.getTotalHolders();
    assert.equal(totalHolders, 3);
  });
});
