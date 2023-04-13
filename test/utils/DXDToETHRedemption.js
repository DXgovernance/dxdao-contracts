import { web3 } from "hardhat";

const { expectRevert, time } = require("@openzeppelin/test-helpers");

const DXDToETHRedemption = artifacts.require("./DXDToETHRedemption.sol");
const ERC20Token = artifacts.require("./ERC20Token.sol");
const yearInSeconds = 365 * 24 * 60 * 60;

contract("DXDToETHRedemption", function (accounts) {
  let dxdToken, redeemDeadline, dxdToEthRedemption;

  beforeEach(async function () {
    dxdToken = await ERC20Token.new();
    await dxdToken.initialize(
      "DXdao",
      "DXD",
      accounts[1],
      web3.utils.toWei("400")
    );

    redeemDeadline = Number(await time.latest()) + yearInSeconds + 1;

    dxdToEthRedemption = await DXDToETHRedemption.new(
      redeemDeadline,
      500000, // 0.5 ETH per DXD
      dxdToken.address
    );
  });

  it("Should allow redeem all eth from DXDtoETHRedemption", async function () {
    await web3.eth.sendTransaction({
      from: accounts[1],
      to: dxdToEthRedemption.address,
      value: web3.utils.toWei("200"),
    });

    await dxdToken.approve(
      dxdToEthRedemption.address,
      web3.utils.toWei("400"),
      { from: accounts[1] }
    );

    await dxdToEthRedemption.redeem(web3.utils.toWei("100"), {
      from: accounts[1],
    });

    assert.equal(
      await web3.eth.getBalance(dxdToEthRedemption.address),
      web3.utils.toWei("150")
    );

    await dxdToEthRedemption.redeem(0, { from: accounts[1] });

    assert.equal(await web3.eth.getBalance(dxdToEthRedemption.address), 0);
  });

  it("Should allow redeem a part of all eth from DXDtoETHRedemption", async function () {
    await web3.eth.sendTransaction({
      from: accounts[1],
      to: dxdToEthRedemption.address,
      value: web3.utils.toWei("200"),
    });

    await dxdToken.approve(
      dxdToEthRedemption.address,
      web3.utils.toWei("400"),
      { from: accounts[1] }
    );

    await expectRevert(
      dxdToEthRedemption.redeem(999999, { from: accounts[1] }),
      "AmountTooSmall"
    );

    await dxdToEthRedemption.redeem(web3.utils.toWei("100"), {
      from: accounts[1],
    });

    assert.equal(
      await web3.eth.getBalance(dxdToEthRedemption.address),
      web3.utils.toWei("150")
    );

    await dxdToEthRedemption.redeem(web3.utils.toWei("250"), {
      from: accounts[1],
    });

    assert.equal(
      await web3.eth.getBalance(dxdToEthRedemption.address),
      web3.utils.toWei("25")
    );

    await expectRevert(
      dxdToEthRedemption.withdrawRemainingETH({ from: accounts[0] }),
      "RedemptionPeriodNotEnded"
    );

    assert.equal(
      await web3.eth.getBalance(dxdToEthRedemption.address),
      web3.utils.toWei("25")
    );

    await time.increaseTo(redeemDeadline + 1);

    await expectRevert(
      dxdToEthRedemption.redeem(web3.utils.toWei("50"), { from: accounts[1] }),
      "RedemptionPeriodEnded"
    );

    await dxdToEthRedemption.withdrawRemainingETH({ from: accounts[0] });

    assert.equal(await web3.eth.getBalance(dxdToEthRedemption.address), 0);
  });
});
