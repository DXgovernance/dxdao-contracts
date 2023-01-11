// const { deployDAT } = require("../../scripts/DAT");

// const { constants } = require("../helpers");
// const { expectRevert } = require("@openzeppelin/test-helpers");

// contract("dat / initialize", () => {
//   let contracts;

//   it("shouldFail to init twice", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.initialize(
//         await contracts.dat.initReserve(),
//         await contracts.dat.currency(),
//         await contracts.dat.initGoal(),
//         await contracts.dat.buySlopeNum(),
//         await contracts.dat.buySlopeDen(),
//         await contracts.dat.investmentReserveBasisPoints(),
//         await contracts.dat.name(),
//         await contracts.dat.symbol(),
//         { from: await contracts.dat.control() }
//       ),
//       "ALREADY_INITIALIZED"
//     );
//   });

//   it("can deploy without any initReserve", async () => {
//     await deployDAT(hre, { initReserve: 0 }, true, false);
//   });

//   it("shouldFail with EXCESSIVE_GOAL", async () => {
//     await expectRevert(
//       deployDAT(hre, { initGoal: constants.MAX_UINT }, true, false),
//       "EXCESSIVE_GOAL"
//     );
//   });

//   it("shouldFail with INVALID_SLOPE_NUM", async () => {
//     await expectRevert(
//       deployDAT(hre, { buySlopeNum: "0" }, true, false),
//       "INVALID_SLOPE_NUM"
//     );
//   });

//   it("shouldFail with INVALID_SLOPE_DEN", async () => {
//     await expectRevert(
//       deployDAT(hre, { buySlopeDen: "0" }, true, false),
//       "INVALID_SLOPE_DEN"
//     );
//   });

//   it("shouldFail with EXCESSIVE_SLOPE_NUM", async () => {
//     await expectRevert(
//       deployDAT(hre, { buySlopeNum: constants.MAX_UINT }, true, false),
//       "EXCESSIVE_SLOPE_NUM"
//     );
//   });

//   it("shouldFail with EXCESSIVE_SLOPE_DEN", async () => {
//     await expectRevert(
//       deployDAT(hre, { buySlopeDen: constants.MAX_UINT }, true, false),
//       "EXCESSIVE_SLOPE_DEN"
//     );
//   });

//   it("shouldFail with INVALID_RESERVE", async () => {
//     await expectRevert(
//       deployDAT(hre, { investmentReserveBasisPoints: "100000" }, true, false),
//       "INVALID_RESERVE"
//     );
//   });
// });

