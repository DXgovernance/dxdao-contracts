import { expectRevert } from "@openzeppelin/test-helpers";
import { SOME_OTHER_ADDRESS, SOME_ADDRESS } from "../helpers/constants";
const DAOController = artifacts.require("./DAOController.sol");

contract("DAOController", function (accounts) {
  it("Should revert call", async function () {
    const scheme = SOME_ADDRESS;
    const reputationToken = SOME_OTHER_ADDRESS;

    const controller = await DAOController.new();
    await controller.initialize(scheme, reputationToken);
  });
});
