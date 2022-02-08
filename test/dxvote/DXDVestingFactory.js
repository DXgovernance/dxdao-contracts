import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";

const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time,
} = require("@openzeppelin/test-helpers");

const DXDVestingFactory = artifacts.require("DXDVestingFactory.sol");
const TokenVesting = artifacts.require("TokenVesting.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");

require("chai").should();

contract("DXDVestingFactory", function (accounts) {
  describe("Create", function () {
    it("Can create vesting and transfer ownership", async function () {
      const dao = accounts[0];
      const contributor = accounts[1];

      const dxdTokenMock = await ERC20Mock.new(dao, 1000);
      console.log({ dxdTokenMock });
      console.log("token mock");
      const vestingFactory = await DXDVestingFactory.new(
        dxdTokenMock.address,
        dao
      );
      console.log("vesting factory");
      await dxdTokenMock.approve(vestingFactory.address, 10, {
        from: dao,
      });
      console.log("approve");
      console.log({ vestingFactory });
      const receipt = await vestingFactory.create(
        contributor.address,
        (await time.latest()).toNumber(),
        600,
        1200,
        1,
        { from: dao.address }
      );

      console.log({ receipt });
      const owner = await new web3.eth.Contract(
        TokenVesting.abi,
        receipt.vestingContractAddress
      ).methods
        .owner()
        .call();
      expect(owner).to.be.equal(dao.address);
    });
  });
});
