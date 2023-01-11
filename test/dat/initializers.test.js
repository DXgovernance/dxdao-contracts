const { deployDAT } = require("../../scripts/DAT");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { constants } = require("../helpers");

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
      contracts.dat.initialize(
        1,
        constants.ZERO_ADDRESS,
        1,
        1,
        1,
        1,
        "test",
        "test"
      ),
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

