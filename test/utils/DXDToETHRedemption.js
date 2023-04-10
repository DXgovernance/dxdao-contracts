import { web3 } from "hardhat";

const {
  expectRevert,
  expectEvent,
  time,
} = require("@openzeppelin/test-helpers");

const DXDToETHRedemption = artifacts.require("./DXDToETHRedemption.sol");
const ERC20Token = artifacts.require("./ERC20Token.sol");

contract("DXDToETHRedemption", function (accounts) {
  it("Should allow redeem all eth from DXDtoETHRedemption", async function () {
    const dxdToken = await ERC20Token.new();
    await dxdToken.initialize(
      "DXdao",
      "DXD",
      accounts[1],
      web3.utils.toWei("1000")
    );

    const dxdToEthRedemption = await DXDToETHRedemption.new(
      (await time.latest()) + 300,
      500000, // 0.5 ETH per DXD
      dxdToken.address
    );

    await web3.eth.sendTransaction({
      from: accounts[1],
      to: dxdToEthRedemption.address,
      value: web3.utils.toWei("200"),
    });

    await dxdToken.approve(
      dxdToEthRedemption.address,
      web3.utils.toWei("1000"),
      { from: accounts[1] }
    );

    await dxdToEthRedemption.redeem(web3.utils.toWei("100"), {
      from: accounts[1],
    });

    assert.equal(
      await web3.eth.getBalance(dxdToEthRedemption.address),
      web3.utils.toWei("150")
    );

    await dxdToEthRedemption.redeem(web3.utils.toWei("300"), {
      from: accounts[1],
    });

    assert.equal(await web3.eth.getBalance(dxdToEthRedemption.address), 0);
  });

  it("Should allow redeem a part of all eth from DXDtoETHRedemption", async function () {
    const dxdToken = await ERC20Token.new();
    await dxdToken.initialize(
      "DXdao",
      "DXD",
      accounts[1],
      web3.utils.toWei("1000")
    );

    const redeemDeadline = (await time.latest()) + 300;

    const dxdToEthRedemption = await DXDToETHRedemption.new(
      redeemDeadline,
      500000, // 0.5 ETH per DXD
      dxdToken.address
    );

    await web3.eth.sendTransaction({
      from: accounts[1],
      to: dxdToEthRedemption.address,
      value: web3.utils.toWei("200"),
    });

    await dxdToken.approve(
      dxdToEthRedemption.address,
      web3.utils.toWei("1000"),
      { from: accounts[1] }
    );

    await expectRevert(
      dxdToEthRedemption.redeem(1000000, { from: accounts[1] }),
      "DXDToETHRedemption: Amount must be greater than 1000000"
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
      "DXDToETHRedemption: Redemption period has not ended yet"
    );

    assert.equal(
      await web3.eth.getBalance(dxdToEthRedemption.address),
      web3.utils.toWei("25")
    );

    await time.increaseTo(redeemDeadline);

    await expectRevert(
      dxdToEthRedemption.redeem(web3.utils.toWei("50"), { from: accounts[1] }),
      "DXDToETHRedemption: Redemption period has ended"
    );

    await dxdToEthRedemption.withdrawRemainingETH({ from: accounts[0] });

    assert.equal(await web3.eth.getBalance(dxdToEthRedemption.address), 0);
  });
});
