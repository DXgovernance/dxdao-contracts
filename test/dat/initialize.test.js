import { deployDAT } from "../../scripts/DAT";
import { MAX_UINT } from "../helpers/constants";
import { expectRevert } from "@openzeppelin/test-helpers";

const DATContract = artifacts.require("DecentralizedAutonomousTrust");

contract("dat / initialize", () => {
  let contracts;

  it("shouldFail to init twice", async () => {
    contracts = await deployDAT(hre);

    const initializeCall = new hre.web3.eth.Contract(DATContract.abi).methods
      .initialize(
        await contracts.dat.initReserve(),
        await contracts.dat.currency(),
        await contracts.dat.initGoal(),
        await contracts.dat.buySlopeNum(),
        await contracts.dat.buySlopeDen(),
        await contracts.dat.investmentReserveBasisPoints(),
        await contracts.dat.name(),
        await contracts.dat.symbol()
      )
      .encodeABI();

    const controller = await contracts.dat.control();

    await expectRevert(
      web3.eth.sendTransaction({
        to: contracts.dat.address,
        data: initializeCall,
        from: controller,
      }),
      "ALREADY_INITIALIZED"
    );
  });

  it("can deploy without any initReserve", async () => {
    await deployDAT(hre, { initReserve: 0 }, true, false);
  });

  it("shouldFail with EXCESSIVE_GOAL", async () => {
    await expectRevert(
      deployDAT(hre, { initGoal: MAX_UINT }, true, false),
      "EXCESSIVE_GOAL"
    );
  });

  it("shouldFail with INVALID_SLOPE_NUM", async () => {
    await expectRevert(
      deployDAT(hre, { buySlopeNum: "0" }, true, false),
      "INVALID_SLOPE_NUM"
    );
  });

  it("shouldFail with INVALID_SLOPE_DEN", async () => {
    await expectRevert(
      deployDAT(hre, { buySlopeDen: "0" }, true, false),
      "INVALID_SLOPE_DEN"
    );
  });

  it("shouldFail with EXCESSIVE_SLOPE_NUM", async () => {
    await expectRevert(
      deployDAT(hre, { buySlopeNum: MAX_UINT }, true, false),
      "EXCESSIVE_SLOPE_NUM"
    );
  });

  it("shouldFail with EXCESSIVE_SLOPE_DEN", async () => {
    await expectRevert(
      deployDAT(hre, { buySlopeDen: MAX_UINT }, true, false),
      "EXCESSIVE_SLOPE_DEN"
    );
  });

  it("shouldFail with INVALID_RESERVE", async () => {
    await expectRevert(
      deployDAT(hre, { investmentReserveBasisPoints: "100000" }, true, false),
      "INVALID_RESERVE"
    );
  });
});
