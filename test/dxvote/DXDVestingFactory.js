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

      const vestingFactory = await DXDVestingFactory.new(
        dxdTokenMock.address,
        dao
      );
      await dxdTokenMock.approve(vestingFactory.address, 10, {
        from: dao,
      });

      const timeNow = (await time.latest()).toNumber();
      
      const receipt = await vestingFactory.create(
        contributor,
        timeNow,
        600,
        1200,
        1,
        { from: dao }
      );

      const newVestingContract = await new web3.eth.Contract(
        TokenVesting.abi,
        receipt.logs[0].args.vestingContractAddress
      );

      const owner = await newVestingContract.methods.owner().call();
      expect(owner).to.be.equal(dao);
    });
  });
});
