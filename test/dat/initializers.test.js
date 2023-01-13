import { deployDAT } from "../../scripts/DAT";
import { expectRevert } from "@openzeppelin/test-helpers";
import { MAX_UINT, ZERO_ADDRESS } from "../helpers/constants";

contract("initializers", () => {
  let contracts;

  before(async () => {
    contracts = await deployDAT(hre);
  });

  it("There are 2 public initializers", async () => {
    const count = contracts.dat.abi.filter(
      x => (x.name || "").toLowerCase() === "initialize"
    ).length;
    assert.equal(count, 2);
  });

  it("initialize may not be called again", async () => {
    await expectRevert(
      contracts.dat.initialize(1, ZERO_ADDRESS, 1, 1, 1, 1, "test", "test"),
      "ALREADY_INITIALIZED"
    );
  });

  it("initialize(string, string, uint) may not be called", async () => {
    await expectRevert(
      contracts.dat.initialize("test", "test", 1),
      "Contract instance has already been initialized"
    );
  });
});
