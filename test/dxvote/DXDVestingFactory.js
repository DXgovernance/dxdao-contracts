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
      const dxdTokenMock = await ERC20Mock.new(accounts[0], 1000);
      console.log({ dxdTokenMock });
      console.log("token mock");
      const vestingFactory = await new DXDVestingFactory(
        dxdTokenMock.address,
        accounts[0]
      );
      console.log("vesting factory");
      // Approve breaks
      await dxdTokenMock.approve(vestingFactory.address, 10, {
        from: accounts[0],
      });
      console.log("approve");

      const receipt = await vestingFactory.create(
        accounts[1],
        new BN("0"),
        new BN("60"),
        new BN("120"),
        new BN("1")
      );

      console.log("create");
      const owner = await new web3.eth.Contract(
        TokenVesting.abi,
        receipt.vestingContractAddress
      ).methods
        .owner()
        .call();
      expect(owner).to.be.equal(accounts[0].address);
    });
  });
});
