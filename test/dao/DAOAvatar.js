import * as helpers from "../helpers";
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const BigNumber = require("bignumber.js");

contract("DAOAvatar", function (accounts) {
  it("Should fail with 'Initializable: contract is already initialized'", async () => {
    const owner = accounts[0];
    const avatar = await DAOAvatar.new();
    await avatar.initialize(owner);
    await expectRevert(
      avatar.initialize(owner),
      "Initializable: contract is already initialized"
    );
  });

  it("Should revert call", async function () {
    const owner = accounts[0];

    const avatar = await DAOAvatar.new();
    await avatar.initialize(owner);

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

    const avatar = await DAOAvatar.new();
    const transferOwnershipTx = await avatar.initialize(owner);

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
      to: ANY_ADDRESS,
      data: callData,
      value: value.toString(),
      callSuccess: true,
    });
  });
});
