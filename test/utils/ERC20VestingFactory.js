import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { expect } from "chai";

const { expectRevert, time } = require("@openzeppelin/test-helpers");

const ERC20VestingFactory = artifacts.require("ERC20VestingFactory.sol");
const TokenVesting = artifacts.require("TokenVesting.sol");
const ERC20Mock = artifacts.require("ERC20Mock.sol");

require("chai").should();

contract("ERC20VestingFactory", function (accounts) {
  const dao = accounts[0];
  const contributor = accounts[1];
  let dxdTokenMock, vestingFactory;

  describe("Create Vesting Contracts", function () {
    beforeEach(async function () {
      dxdTokenMock = await ERC20Mock.new("", "", 1000, dao);
      vestingFactory = await ERC20VestingFactory.new(dxdTokenMock.address, dao);
    });

    it("Can transfer ownership", async function () {
      await dxdTokenMock.approve(vestingFactory.address, 1, {
        from: dao,
      });

      const timeNow = (await time.latest()).toNumber();
      const receipt = await vestingFactory.create(
        contributor,
        timeNow,
        60000,
        1200000,
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

    it("Can be redeemed by contributor after cliff", async function () {
      await dxdTokenMock.approve(vestingFactory.address, 10, {
        from: dao,
      });

      const timeNow = (await time.latest()).toNumber();
      const receipt = await vestingFactory.create(
        contributor,
        timeNow,
        60,
        120,
        10,
        { from: dao }
      );

      const newVestingContract = await new web3.eth.Contract(
        TokenVesting.abi,
        receipt.logs[0].args.vestingContractAddress
      );

      await time.increase(time.duration.seconds(60));
      await newVestingContract.methods.release(dxdTokenMock.address).send({
        from: contributor,
      });

      const balance = await dxdTokenMock.balanceOf(contributor);
      expect(balance.toNumber()).to.be.equal(5);
    });

    it("Can be redeemed by contributor end", async function () {
      await dxdTokenMock.approve(vestingFactory.address, 10, {
        from: dao,
      });

      const timeNow = (await time.latest()).toNumber();
      const receipt = await vestingFactory.create(
        contributor,
        timeNow,
        60,
        120,
        10,
        { from: dao }
      );

      const newVestingContract = await new web3.eth.Contract(
        TokenVesting.abi,
        receipt.logs[0].args.vestingContractAddress
      );

      await time.increase(time.duration.seconds(120));

      await newVestingContract.methods.release(dxdTokenMock.address).send({
        from: contributor,
      });
      const balance = await dxdTokenMock.balanceOf(contributor);
      expect(balance.toNumber()).to.be.equal(10);
    });

    it("Can be revoked by the dao", async function () {
      await dxdTokenMock.approve(vestingFactory.address, 10, {
        from: dao,
      });

      const timeNow = (await time.latest()).toNumber();
      const receipt = await vestingFactory.create(
        contributor,
        timeNow,
        60,
        120,
        10,
        { from: dao }
      );

      const newVestingContract = await new web3.eth.Contract(
        TokenVesting.abi,
        receipt.logs[0].args.vestingContractAddress
      );

      await time.increase(time.duration.seconds(60));
      await newVestingContract.methods.revoke(dxdTokenMock.address).send({
        from: dao,
      });

      await time.increase(time.duration.seconds(60));
      await newVestingContract.methods.release(dxdTokenMock.address).send({
        from: contributor,
      });

      await expectRevert(
        newVestingContract.methods
          .release(dxdTokenMock.address)
          .send({ from: contributor }),
        "TokenVesting: no tokens are due"
      );
    });
  });
});
