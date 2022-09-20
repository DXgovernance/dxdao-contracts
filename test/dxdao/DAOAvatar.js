import * as helpers from "../helpers";
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const DAOReputation = artifacts.require("./DAOReputation.sol");
const BigNumber = require("bignumber.js");

contract("DAOAvatar", function (accounts) {
  it("Should revert call", async function () {
    const owner = accounts[0];
    const reputation = await DAOReputation.new();
    await reputation.initialize("DXDaoReputation", "DXRep");

    const avatar = await DAOAvatar.new();
    await avatar.initialize(owner, reputation.address);

    const callData = helpers.testCallFrom(owner);
    const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

    await expectRevert(
      avatar.executeCall(ANY_ADDRESS, callData, new BigNumber(0), {
        from: accounts[1],
      }),
      "Ownable: caller is not the owner"
    );
  });

  it("Should transferOwnership on initialize and execute call", async function () {
    const owner = accounts[1];
    const reputation = await DAOReputation.new();
    await reputation.initialize("DXDaoReputation", "DXRep");

    const avatar = await DAOAvatar.new();
    const transferOwnershipTx = await avatar.initialize(
      owner,
      reputation.address
    );

    await expectEvent(transferOwnershipTx.receipt, "OwnershipTransferred", {
      previousOwner: accounts[0],
      newOwner: owner,
    });

    const callData = helpers.testCallFrom(owner);
    const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
    const value = new BigNumber(0);

    const tx = await avatar.executeCall(ANY_ADDRESS, callData, value, {
      from: owner,
    });

    await expectEvent(tx.receipt, "CallExecuted", {
      _to: ANY_ADDRESS,
      _data: callData,
      _value: value.toString(),
      _success: true,
    });
  });
});
