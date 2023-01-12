const { deployDAT } = require("../../scripts/DAT");

const getDomainSeparator = require("../helpers/getDomainSeparator");

contract("dat / domainSeparator", () => {
  let contracts;

  beforeEach(async () => {
    contracts = await deployDAT(hre);
  });

  it("has the correct domain separator", async () => {
    const actual = await contracts.dat.DOMAIN_SEPARATOR();

    const expected = await getDomainSeparator(
      await contracts.dat.name(),
      await contracts.dat.version(),
      await contracts.dat.address
    );
    assert.equal(actual, expected);
  });
});
