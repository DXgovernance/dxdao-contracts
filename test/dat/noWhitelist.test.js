// const { deployDAT } = require("../../scripts/DAT");

// const { constants } = require("../helpers");

// contract("dat / noWhitelist", accounts => {
//   let contracts;
//   const buyer = accounts[2];
//   const investor = accounts[7];

//   before(async () => {
//     contracts = await deployDAT(hre, {
//       initGoal: 0,
//       whitelistAddress: constants.ZERO_ADDRESS,
//     });
//     await contracts.dat.buy(buyer, "100000000000000000000", 1, {
//       value: "100000000000000000000",
//       from: buyer,
//       gas: 9000000,
//     });

//     await contracts.dat.pay(constants.ZERO_ADDRESS, "100000000000000000000", {
//       value: "100000000000000000000",
//       from: investor,
//       gas: 9000000,
//     });
//   });

//   it("DXD balanceOf should not have changed on pay", async () => {
//     const balance = await contracts.dat.balanceOf(investor);
//     assert.equal(balance.toString(), "0");
//   });
// });

