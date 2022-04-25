import { assert } from "chai";
import { artifacts, contract } from "hardhat";
import { SOME_ADDRESS } from "../../helpers/constants";

const ERC20SnapshotRepMock = artifacts.require(
  "./test/ERC20SnapshotRepMock.sol"
);

contract("ERC20SnapshotRep", accounts => {
  let ERC20SnapshotRep;

  beforeEach(async () => {
    ERC20SnapshotRep = await ERC20SnapshotRepMock.new({
      from: accounts[0],
    });
    await ERC20SnapshotRep.initialize("DXdao", "DXD");
    await ERC20SnapshotRep._addHolder(SOME_ADDRESS, { from: accounts[0] });
  });

  describe("Add and remove totalHolders", () => {
    it("should return one totalHolder", async () => {
      const totalHolders = await ERC20SnapshotRep.getTotalHolders();
      assert.equal(totalHolders, 1);
    });

    it("should add totalHolders", async () => {
      await ERC20SnapshotRep._addHolder(SOME_ADDRESS, { from: accounts[0] });
      const totalHolders = await ERC20SnapshotRep.getTotalHolders();
      assert.equal(totalHolders, 2);
    });
    it("should subtract totalHolders", async () => {
      await ERC20SnapshotRep._removeHolder(SOME_ADDRESS, {
        from: accounts[0],
      });
      const totalHolders = await ERC20SnapshotRep.getTotalHolders();
      assert.equal(totalHolders, 0);
    });

    it("should not add totalHolders if address has balance", async () => {
      await ERC20SnapshotRep.mint(SOME_ADDRESS, 100, {
        from: accounts[0],
      });
      await ERC20SnapshotRep.mint(SOME_ADDRESS, 100, { from: accounts[0] });
      const totalHolders = await ERC20SnapshotRep.getTotalHolders();
      assert.equal(totalHolders, 2);
    });
  });

  it("should not subtract totalHolders if address has balance", async () => {
    await ERC20SnapshotRep.mint(SOME_ADDRESS, 100, {
      from: accounts[0],
    });
    await ERC20SnapshotRep.burn(SOME_ADDRESS, 50, { from: accounts[0] });
    const totalHolders = await ERC20SnapshotRep.getTotalHolders();
    assert.equal(totalHolders, 2);
  });
});
