import { web3 } from "hardhat";

const {
  expectRevert,
  expectEvent,
  time,
} = require("@openzeppelin/test-helpers");

const MerkleClaim = artifacts.require("./MerkleClaim.sol");
const WETH9 = artifacts.require("./WETH9.sol");
const yearInSeconds = 365 * 24 * 60 * 60;
const BN = web3.utils.BN;

contract("MerkleClaim", function (accounts) {
  let merkleTreeData, weth, claimDeadline, merkleClaim;

  beforeEach(async function () {
    merkleTreeData = await hre.run("testMerkleTree");
    weth = await WETH9.new();
    claimDeadline = Number(await time.latest()) + yearInSeconds + 1;
    merkleClaim = await MerkleClaim.new(
      accounts[9],
      weth.address,
      merkleTreeData.merkleRoot,
      claimDeadline
    );

    await weth.deposit({ value: web3.utils.toWei("100"), from: accounts[9] });
    await weth.transfer(merkleClaim.address, web3.utils.toWei("100"), {
      from: accounts[9],
    });
  });

  it("Should allow almost all addresses to claim tokens and end claim", async function () {
    await merkleClaim.claim(
      merkleTreeData.leaves[0].address,
      merkleTreeData.leaves[0].amount,
      merkleTreeData.leaves[0].proof,
      { from: merkleTreeData.leaves[0].address }
    );
    await merkleClaim.claim(
      merkleTreeData.leaves[1].address,
      merkleTreeData.leaves[1].amount,
      merkleTreeData.leaves[1].proof,
      { from: merkleTreeData.leaves[1].address }
    );

    //Cant claim twice
    await expectRevert(
      merkleClaim.claim(
        merkleTreeData.leaves[1].address,
        merkleTreeData.leaves[1].amount,
        merkleTreeData.leaves[1].proof,
        { from: merkleTreeData.leaves[1].address }
      ),
      "AlreadyClaimed"
    );

    //Should claim and emit Claim event
    const claimTx = await merkleClaim.claim(
      merkleTreeData.leaves[2].address,
      merkleTreeData.leaves[2].amount,
      merkleTreeData.leaves[2].proof,
      { from: merkleTreeData.leaves[2].address }
    );
    await expectEvent(claimTx, "Claim", {
      to: merkleTreeData.leaves[2].address,
      amount: merkleTreeData.leaves[2].amount,
    });
    await merkleClaim.claim(
      merkleTreeData.leaves[3].address,
      merkleTreeData.leaves[3].amount,
      merkleTreeData.leaves[3].proof,
      { from: merkleTreeData.leaves[3].address }
    );

    //Not in merkle tree
    await expectRevert(
      merkleClaim.claim(
        accounts[5],
        merkleTreeData.leaves[4].amount,
        merkleTreeData.leaves[4].proof,
        { from: merkleTreeData.leaves[4].address }
      ),
      "NotInMerkle"
    );

    assert.equal(
      (await weth.balanceOf(merkleClaim.address)).toString(),
      web3.utils.toWei("10")
    );

    await expectRevert(
      merkleClaim.endClaim({ from: accounts[9] }),
      "ClaimDeadlineNotReached"
    );

    await time.increaseTo(claimDeadline + 1);

    // The claim contract is finished and remaining tokens are sent to the owner
    await merkleClaim.endClaim({ from: accounts[9] });

    // Cant claim once its ended
    await expectRevert(
      merkleClaim.claim(
        merkleTreeData.leaves[4].address,
        merkleTreeData.leaves[3].amount,
        merkleTreeData.leaves[4].proof,
        { from: merkleTreeData.leaves[4].address }
      ),
      "ClaimDeadlineReached"
    );

    assert.equal(await weth.balanceOf(merkleClaim.address), 0);
  });

  it("Should allow all addresses to claim tokens and end claim", async function () {
    await merkleClaim.claim(
      merkleTreeData.leaves[0].address,
      merkleTreeData.leaves[0].amount,
      merkleTreeData.leaves[0].proof,
      { from: merkleTreeData.leaves[0].address }
    );
    await merkleClaim.claim(
      merkleTreeData.leaves[1].address,
      merkleTreeData.leaves[1].amount,
      merkleTreeData.leaves[1].proof,
      { from: merkleTreeData.leaves[1].address }
    );
    await merkleClaim.claim(
      merkleTreeData.leaves[2].address,
      merkleTreeData.leaves[2].amount,
      merkleTreeData.leaves[2].proof,
      { from: merkleTreeData.leaves[2].address }
    );
    await merkleClaim.claim(
      merkleTreeData.leaves[3].address,
      merkleTreeData.leaves[3].amount,
      merkleTreeData.leaves[3].proof,
      { from: merkleTreeData.leaves[3].address }
    );
    await merkleClaim.claim(
      merkleTreeData.leaves[4].address,
      merkleTreeData.leaves[4].amount,
      merkleTreeData.leaves[4].proof,
      { from: merkleTreeData.leaves[4].address }
    );

    assert.equal(await weth.balanceOf(merkleClaim.address), 0);
    await time.increaseTo(claimDeadline + 1);
    await merkleClaim.endClaim({ from: accounts[9] });
  });
});
