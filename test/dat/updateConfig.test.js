// const { deployDAT } = require("../../scripts/DAT");

// const { constants } = require("../helpers");
// const { expectRevert } = require("@openzeppelin/test-helpers");

// contract("dat / updateConfig", accounts => {
//   let contracts;

//   it("shouldFail with CONTROL_ONLY", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: accounts[6] }
//       ),
//       "CONTROL_ONLY"
//     );
//   });

//   it("can remove the whitelist", async () => {
//     contracts = await deployDAT(hre);
//     await contracts.dat.updateConfig(
//       constants.ZERO_ADDRESS,
//       await contracts.dat.beneficiary(),
//       await contracts.dat.control(),
//       await contracts.dat.feeCollector(),
//       await contracts.dat.feeBasisPoints(),
//       await contracts.dat.autoBurn(),
//       await contracts.dat.revenueCommitmentBasisPoints(),
//       await contracts.dat.minInvestment(),
//       await contracts.dat.openUntilAtLeast(),
//       { from: await contracts.dat.control() }
//     );
//   });

//   it("can update the minInvestment to MAX_UINT", async () => {
//     contracts = await deployDAT(hre);
//     await contracts.dat.buy(accounts[4], web3.utils.toWei("10"), "1", {
//       value: web3.utils.toWei("10"),
//       from: accounts[4],
//       gas: 9000000,
//     });

//     await contracts.dat.updateConfig(
//       await contracts.dat.whitelist(),
//       await contracts.dat.beneficiary(),
//       await contracts.dat.control(),
//       await contracts.dat.feeCollector(),
//       await contracts.dat.feeBasisPoints(),
//       await contracts.dat.autoBurn(),
//       await contracts.dat.revenueCommitmentBasisPoints(),
//       constants.MAX_UINT,
//       await contracts.dat.openUntilAtLeast(),
//       { from: await contracts.dat.control() }
//     );

//     // reverts when trying to buy more than 10 or 10000 ETH worth of tokens
//     await expectRevert(
//       contracts.dat.buy(accounts[4], web3.utils.toWei("10"), "1", {
//         value: web3.utils.toWei("10"),
//         from: accounts[4],
//         gas: 9000000,
//       })
//     );
//     await expectRevert(
//       contracts.dat.buy(accounts[4], web3.utils.toWei("10000"), "1", {
//         value: web3.utils.toWei("10000"),
//         from: accounts[4],
//         gas: 9000000,
//       })
//     );
//   });

//   it("shouldFail with INVALID_ADDRESS if control is missing", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         constants.ZERO_ADDRESS,
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "INVALID_ADDRESS"
//     );
//   });

//   it("shouldFail with INVALID_ADDRESS if feeCollector is missing", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         constants.ZERO_ADDRESS,
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "INVALID_ADDRESS"
//     );
//   });

//   it("shouldFail with INVALID_COMMITMENT", async () => {
//     contracts = await deployDAT(web3, {
//       revenueCommitmentBasisPoints: 0,
//     });
//     contracts.dat.updateConfig(
//       await contracts.dat.whitelist(),
//       await contracts.dat.beneficiary(),
//       await contracts.dat.control(),
//       await contracts.dat.feeCollector(),
//       await contracts.dat.feeBasisPoints(),
//       await contracts.dat.autoBurn(),
//       "11",
//       await contracts.dat.minInvestment(),
//       await contracts.dat.openUntilAtLeast(),
//       { from: await contracts.dat.control() }
//     );
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         "10",
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "COMMITMENT_MAY_NOT_BE_REDUCED"
//     );
//   });

//   it("shouldFail with INVALID_COMMITMENT", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         "100000",
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "INVALID_COMMITMENT"
//     );
//   });

//   it("shouldFail with INVALID_FEE", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         "100000",
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "INVALID_FEE"
//     );
//   });

//   it("shouldFail with INVALID_MIN_INVESTMENT", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         "0",
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "INVALID_MIN_INVESTMENT"
//     );
//   });

//   it("shouldFail with INVALID_ADDRESS when missing the beneficiary", async () => {
//     contracts = await deployDAT(hre);
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         constants.ZERO_ADDRESS,
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         await contracts.dat.minInvestment(),
//         await contracts.dat.openUntilAtLeast(),
//         { from: await contracts.dat.control() }
//       ),
//       "INVALID_ADDRESS"
//     );
//   });

//   it("shouldFail with OPEN_UNTIL_MAY_NOT_BE_REDUCED", async () => {
//     contracts = await deployDAT(hre);
//     await contracts.dat.updateConfig(
//       await contracts.dat.whitelist(),
//       await contracts.dat.beneficiary(),
//       await contracts.dat.control(),
//       await contracts.dat.feeCollector(),
//       await contracts.dat.feeBasisPoints(),
//       await contracts.dat.autoBurn(),
//       await contracts.dat.revenueCommitmentBasisPoints(),
//       await contracts.dat.minInvestment(),
//       "100",
//       { from: await contracts.dat.control() }
//     );
//     await expectRevert(
//       contracts.dat.updateConfig(
//         await contracts.dat.whitelist(),
//         await contracts.dat.beneficiary(),
//         await contracts.dat.control(),
//         await contracts.dat.feeCollector(),
//         await contracts.dat.feeBasisPoints(),
//         await contracts.dat.autoBurn(),
//         await contracts.dat.revenueCommitmentBasisPoints(),
//         await contracts.dat.minInvestment(),
//         "99",
//         { from: await contracts.dat.control() }
//       ),
//       "OPEN_UNTIL_MAY_NOT_BE_REDUCED"
//     );
//   });
// });

