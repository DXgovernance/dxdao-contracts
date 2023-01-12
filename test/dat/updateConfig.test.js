const { deployDAT, updateDAT } = require("../../scripts/DAT");

const { ZERO_ADDRESS, MAX_UINT } = require("../helpers/constants");
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { assert } = require("chai");

const DATContract = artifacts.require("DecentralizedAutonomousTrust");

contract("dat / updateConfig", accounts => {
  let contracts;

  it("shouldFail with CONTROL_ONLY", async () => {
    contracts = await deployDAT(hre);
    await expectRevert(
      updateDAT(contracts, hre.web3, { from: accounts[6] }),
      "CONTROL_ONLY"
    );
  });

  it("can remove the whitelist", async () => {
    contracts = await deployDAT(hre);

    const controller = await contracts.dat.control();
    await updateDAT(contracts, hre.web3, {
      whitelist: ZERO_ADDRESS,
      from: controller,
    });
    assert.equal(await contracts.dat.whitelist(), ZERO_ADDRESS);
  });

  it.skip("can update the minInvestment to MAX_UINT", async () => {
    contracts = await deployDAT(hre);

    await contracts.dat.buy(accounts[4], web3.utils.toWei("10"), "1"),
      {
        value: web3.utils.toWei("10"),
        from: accounts[4],
        gas: 9000000,
      };

    const updateCall = new web3.eth.Contract(DATContract.abi)
      .updateConfig(
        await contracts.dat.whitelist(),
        await contracts.dat.beneficiary(),
        await contracts.dat.control(),
        await contracts.dat.feeCollector(),
        await contracts.dat.feeBasisPoints(),
        await contracts.dat.autoBurn(),
        await contracts.dat.revenueCommitmentBasisPoints(),
        constants.MAX_UINT,
        await contracts.dat.openUntilAtLeast()
      )
      .encodeABI();

    const controller = await contracts.dat.control();
    await web3.eth.sendTransaction({
      to: contracts.dat.address,
      data: updateCall,
      from: controller,
    });

    // reverts when trying to buy more than 10 or 10000 ETH worth of tokens
    await expectRevert(
      contracts.dat.buy(accounts[4], web3.utils.toWei("10"), "1", {
        value: web3.utils.toWei("10"),
        from: accounts[4],
        gas: 9000000,
      }),
      "INCORRECT_MSG_VALUE"
    );
    await expectRevert(
      contracts.dat.buy(accounts[4], web3.utils.toWei("10000"), "1", {
        value: web3.utils.toWei("10000"),
        from: accounts[4],
        gas: 9000000,
      }),
      "INCORRECT_MSG_VALUE"
    );
  });

  it("shouldFail with INVALID_ADDRESS if control is missing", async () => {
    contracts = await deployDAT(hre);
    const controller = await contracts.dat.control();
    await expectRevert(
      updateDAT(contracts, hre.web3, {
        control: ZERO_ADDRESS,
        from: controller,
      }),
      "INVALID_ADDRESS"
    );
  });

  it("shouldFail with INVALID_ADDRESS if feeCollector is missing", async () => {
    contracts = await deployDAT(hre);
    const controller = await contracts.dat.control();
    await expectRevert(
      updateDAT(contracts, hre.web3, {
        feeCollector: ZERO_ADDRESS,
        from: controller,
      }),
      "INVALID_ADDRESS"
    );
  });

  it("shouldFail with INVALID_COMMITMENT", async () => {
    contracts = await deployDAT(hre, {
      revenueCommitmentBasisPoints: 0,
    });

    await updateDAT(contracts, hre.web3, {
      revenueCommitmentBasisPoints: "11",
    });

    await expectRevert(
      updateDAT(contracts, hre.web3, { revenueCommitmentBasisPoints: "10" }),
      "COMMITMENT_MAY_NOT_BE_REDUCED"
    );
  });

  it("shouldFail with INVALID_COMMITMENT", async () => {
    contracts = await deployDAT(hre);
    await expectRevert(
      updateDAT(contracts, hre.web3, {
        revenueCommitmentBasisPoints: "100000",
      }),
      "INVALID_COMMITMENT"
    );
  });

  it("shouldFail with INVALID_FEE", async () => {
    contracts = await deployDAT(hre);
    await expectRevert(
      updateDAT(contracts, hre.web3, { feeBasisPoints: "100000" }),
      "INVALID_FEE"
    );
  });

  it("shouldFail with INVALID_MIN_INVESTMENT", async () => {
    contracts = await deployDAT(hre);
    await expectRevert(
      updateDAT(contracts, hre.web3, { minInvestment: "0" }),
      "INVALID_MIN_INVESTMENT"
    );
  });

  it("shouldFail with INVALID_ADDRESS when missing the beneficiary", async () => {
    contracts = await deployDAT(hre);
    await expectRevert(
      updateDAT(contracts, hre.web3, { beneficiary: ZERO_ADDRESS }),
      "INVALID_ADDRESS"
    );
  });

  it("shouldFail with OPEN_UNTIL_MAY_NOT_BE_REDUCED", async () => {
    contracts = await deployDAT(hre);

    await updateDAT(contracts, hre.web3, { openUntilAtLeast: "100" });
    await expectRevert(
      updateDAT(contracts, hre.web3, { openUntilAtLeast: "99" }),
      "OPEN_UNTIL_MAY_NOT_BE_REDUCED"
    );
  });
});
