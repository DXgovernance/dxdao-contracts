import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";
import * as helpers from "../../helpers";
const { fixSignature } = require("../../helpers/sign");
const { createProposal, setVotesOnProposal } = require("../../helpers/guild");

const {
  BN,
  expectEvent,
  expectRevert,
  time,
} = require("@openzeppelin/test-helpers");

const SnapshotRepERC20Guild = artifacts.require("SnapshotRepERC20Guild.sol");
const ERC20SnapshotRep = artifacts.require("ERC20SnapshotRep.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");

require("chai").should();

const constants = helpers.constants;
const balances = [25000, 25000, 50000, 100000, 100000, 200000];
const proposalTime = 30;
const votingPowerPercentageForProposalExecution = 5000; // 50%
const votingPowerPercentageForProposalCreation = 1000; // 10%

contract("SnapshotRepERC20Guild", function (accounts) {
  let guildToken, snapshotRepErc20Guild, permissionRegistry, genericProposal;

  beforeEach(async function () {
    const repHolders = accounts.slice(0, 6);
    guildToken = await ERC20SnapshotRep.new();
    guildToken.initialize("Test ERC20SnapshotRep Token", "TESRT", {
      from: accounts[0],
    });

    await Promise.all(
      repHolders.map((account, i) => {
        guildToken.mint(account, balances[i]);
      })
    );

    snapshotRepErc20Guild = await SnapshotRepERC20Guild.new();
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    await snapshotRepErc20Guild.initialize(
      guildToken.address,
      proposalTime,
      30, // _timeForExecution,
      votingPowerPercentageForProposalExecution,
      votingPowerPercentageForProposalCreation,
      "SnapshotRep Guild",
      10, //  _voteGas,
      0, //  _maxGasPrice,
      10, //  _maxActiveProposals,
      60, //  _lockTime,
      permissionRegistry.address
    );

    const setGlobaLPermissionProposal = await createProposal({
      guild: snapshotRepErc20Guild,
      options: [
        {
          to: [permissionRegistry.address, permissionRegistry.address],
          data: [
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                snapshotRepErc20Guild.address,
                constants.ZERO_ADDRESS,
                constants.NULL_SIGNATURE,
                100,
                true
              )
              .encodeABI(),
            await new web3.eth.Contract(PermissionRegistry.abi).methods
              .setETHPermission(
                snapshotRepErc20Guild.address,
                accounts[1],
                constants.NULL_SIGNATURE,
                100,
                true
              )
              .encodeABI(),
          ],
          value: [0, 0],
        },
      ],
      account: accounts[3],
    });
    await setVotesOnProposal({
      guild: snapshotRepErc20Guild,
      proposalId: setGlobaLPermissionProposal,
      option: 1,
      account: accounts[4],
    });
    await setVotesOnProposal({
      guild: snapshotRepErc20Guild,
      proposalId: setGlobaLPermissionProposal,
      option: 1,
      account: accounts[5],
    });
    await time.increase(proposalTime); // wait for proposal to end
    await snapshotRepErc20Guild.endProposal(setGlobaLPermissionProposal);

    genericProposal = {
      guild: snapshotRepErc20Guild,
      options: [
        {
          to: [accounts[1]],
          data: ["0x00"],
          value: [new BN("1")],
        },
      ],
      account: accounts[3],
    };
  });

  it("check create and execute proposal votingPower limits", async () => {
    let proposalId;

    await web3.eth.sendTransaction({
      to: snapshotRepErc20Guild.address,
      value: 100,
      from: accounts[0],
    });

    assert.equal(
      await snapshotRepErc20Guild.getVotingPowerForProposalCreation(),
      "50000"
    );
    assert.equal(
      await snapshotRepErc20Guild.getVotingPowerForProposalExecution(),
      "250000"
    );

    await expectRevert(
      snapshotRepErc20Guild.createProposal(
        [accounts[1]],
        ["0x0"],
        ["100"],
        1,
        "Test",
        constants.SOME_HASH,
        { from: accounts[1] }
      ),
      "ERC20Guild: Not enough votingPower to create proposal"
    );

    proposalId = await createProposal(genericProposal);

    await setVotesOnProposal({
      guild: snapshotRepErc20Guild,
      proposalId: proposalId,
      option: 1,
      account: accounts[1],
    });
    await time.increase(proposalTime);
    await snapshotRepErc20Guild.endProposal(proposalId);

    // Failed cause it had less than 250000 positive votes
    assert.equal(
      (await snapshotRepErc20Guild.getProposal(proposalId)).state,
      "2"
    );

    proposalId = await createProposal(genericProposal);
    await setVotesOnProposal({
      guild: snapshotRepErc20Guild,
      proposalId: proposalId,
      option: 1,
      account: accounts[4],
    });
    await setVotesOnProposal({
      guild: snapshotRepErc20Guild,
      proposalId: proposalId,
      option: 1,
      account: accounts[5],
    });
    // eslint-disable-next-line max-len
    // It preserves the voting power needed for proposal execution using the totalSupply at the moment of the proposal creation
    assert.equal(
      await snapshotRepErc20Guild.getSnapshotVotingPowerForProposalExecution(
        proposalId
      ),
      "250000"
    );
    await guildToken.mint(accounts[1], 250000);
    assert.equal(
      await snapshotRepErc20Guild.getSnapshotVotingPowerForProposalExecution(
        proposalId
      ),
      "250000"
    );
    assert.equal(
      await snapshotRepErc20Guild.getVotingPowerForProposalExecution(),
      "375000"
    );

    await time.increase(proposalTime);
    await snapshotRepErc20Guild.endProposal(proposalId);

    // Executed cause it had more than 250000 positive votes
    assert.equal(
      (await snapshotRepErc20Guild.getProposal(proposalId)).state,
      "3"
    );
  });

  describe("setVote", () => {
    let proposalId, snapshotId;

    beforeEach(async () => {
      proposalId = await createProposal(genericProposal);
      snapshotId = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId)
      );
    });

    it("Should Vote", async () => {
      const account = accounts[2];
      const option = new BN(0);
      const votingPower = new BN(500);

      const proposalData1 = await snapshotRepErc20Guild.getProposal(proposalId);
      const totalVotes1 = new BN(proposalData1.totalVotes);
      expect(parseInt(totalVotes1.toString())).to.be.equal(0);

      await snapshotRepErc20Guild.setVote(proposalId, option, votingPower, {
        from: account,
      });
      const proposalData2 = await snapshotRepErc20Guild.getProposal(proposalId);
      const totalVotes2 = proposalData2.totalVotes;
      expect(parseInt(totalVotes2.toString())).to.be.equal(
        votingPower.toNumber()
      );
    });

    it("Should emmit VoteAdded Event", async () => {
      const account = accounts[2];
      const option = new BN(0);
      const votingPower = new BN(500);
      const tx = await snapshotRepErc20Guild.setVote(
        proposalId,
        option,
        votingPower,
        {
          from: account,
        }
      );

      expectEvent(tx, "VoteAdded", {
        proposalId,
        option,
        voter: account,
        votingPower,
      });
    });

    it("Should fail if proposal ended", async () => {
      const account = accounts[2];
      await time.increase(proposalTime + 1);
      const voteTrigger = snapshotRepErc20Guild.setVote(proposalId, 0, 1, {
        from: account,
      });
      await expectRevert(
        voteTrigger,
        "SnapshotRepERC20Guild: Proposal ended, cannot be voted"
      );
    });

    it("Should fail if votingPower provided is larger than real user voting power ", async () => {
      const account = accounts[2];
      const option = 0;

      const invalidVotingPower = new BN(
        await snapshotRepErc20Guild.votingPowerOfAt(account, snapshotId)
      ).add(new BN(100));

      const voteTrigger = snapshotRepErc20Guild.setVote(
        proposalId,
        option,
        invalidVotingPower
      );
      await expectRevert(
        voteTrigger,
        "SnapshotRepERC20Guild: Invalid votingPower amount"
      );
    });

    it("Should fail if user voted before and vote again with less votingPower", async () => {
      const account = accounts[2];
      const option = 0;
      const votingPower = new BN(1000);
      const decreasedVotingPower = votingPower.sub(new BN(10));
      await snapshotRepErc20Guild.setVote(proposalId, option, votingPower, {
        from: account,
      });

      await expectRevert(
        snapshotRepErc20Guild.setVote(
          proposalId,
          option,
          decreasedVotingPower,
          {
            from: account,
          }
        ),
        "SnapshotRepERC20Guild: Cannot change option voted, only increase votingPower"
      );
    });

    it("Should fail if user has voted and try to change voted option", async () => {
      const account = accounts[2];
      const option1 = new BN("1");
      const option2 = new BN("0");
      const votingPower = new BN("500");
      const increasedVotingPower = new BN("10000");

      await snapshotRepErc20Guild.setVote(proposalId, option1, votingPower, {
        from: account,
      });

      await expectRevert(
        snapshotRepErc20Guild.setVote(
          proposalId,
          option2,
          increasedVotingPower,
          {
            from: account,
          }
        ),
        "SnapshotRepERC20Guild: Cannot change option voted, only increase votingPower"
      );
    });
  });

  describe("setSignedVote", () => {
    let proposalId;
    beforeEach(async () => {
      proposalId = await createProposal(genericProposal);
    });

    it("Should fail if user has voted", async () => {
      const account = accounts[2];
      const option = new BN("0");
      const votingPower = new BN("500");
      const hashedVote = await snapshotRepErc20Guild.hashVote(
        account,
        proposalId,
        option,
        votingPower
      );
      const votesignature = fixSignature(
        await web3.eth.sign(hashedVote, account)
      );

      await snapshotRepErc20Guild.setSignedVote(
        proposalId,
        option,
        votingPower,
        account,
        votesignature,
        {
          from: account,
        }
      );

      await expectRevert(
        snapshotRepErc20Guild.setSignedVote(
          proposalId,
          option,
          votingPower,
          account,
          votesignature,
          {
            from: account,
          }
        ),
        "SnapshotRepERC20Guild: Already voted"
      );
    });

    it("Should fail with wrong signer msg", async () => {
      const account = accounts[2];
      const wrongSignerAccount = accounts[3];
      const option = new BN("0");
      const votingPower = new BN("500");

      const hashedVote = await snapshotRepErc20Guild.hashVote(
        account,
        proposalId,
        option,
        votingPower
      );
      const votesignature = fixSignature(
        await web3.eth.sign(hashedVote, wrongSignerAccount)
      );

      await expectRevert(
        snapshotRepErc20Guild.setSignedVote(
          proposalId,
          option,
          votingPower,
          account,
          votesignature,
          {
            from: account,
          }
        ),
        "SnapshotRepERC20Guild: Wrong signer"
      );
    });
  });
  describe("lockTokens", () => {
    it("Should revert option", async () => {
      await expectRevert(
        snapshotRepErc20Guild.lockTokens(new BN("100")),
        "SnapshotRepERC20Guild: token vault disabled"
      );
    });
  });

  describe("withdrawTokens", () => {
    it("Should revert option", async () => {
      await expectRevert(
        snapshotRepErc20Guild.withdrawTokens(new BN("100")),
        "SnapshotRepERC20Guild: token vault disabled"
      );
    });
  });

  describe("votingPowerOfMultipleAt", () => {
    it("Should return correct voting power", async () => {
      const account2 = accounts[2];
      const account4 = accounts[4];
      const proposalId = await createProposal(genericProposal);

      const snapshotId1 = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId)
      );

      const initialVotingPowerAcc2 = new BN(balances[2]);
      const initialVotingPowerAcc4 = new BN(balances[4]);

      const [votingPower1, votingPower2] =
        await snapshotRepErc20Guild.votingPowerOfMultipleAt(
          [account2, account4],
          [snapshotId1, snapshotId1]
        );
      expect(votingPower1).to.be.bignumber.equal(initialVotingPowerAcc2);
      expect(votingPower2).to.be.bignumber.equal(initialVotingPowerAcc4);
    });
  });

  describe("votingPowerOfAt", () => {
    it("Should return correct voting power for account", async () => {
      await guildToken.transferOwnership(snapshotRepErc20Guild.address);

      const account = accounts[2];
      const initialVotingPowerAcc = new BN(balances[2]);

      const proposalId1 = await createProposal(genericProposal);
      const snapshotId1 = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId1)
      );
      // voting power at snapshotId1
      const votingPower1 = await snapshotRepErc20Guild.votingPowerOfAt(
        account,
        snapshotId1
      );
      expect(votingPower1).to.be.bignumber.equal(initialVotingPowerAcc);

      // burn tokensEncodedCall
      const burnCallData = await new web3.eth.Contract(guildToken.abi).methods
        .burn(account, initialVotingPowerAcc)
        .encodeABI();

      // create proposal to burn tokens
      const burnProposalId = await createProposal({
        guild: snapshotRepErc20Guild,
        options: [
          {
            to: [guildToken.address],
            data: [burnCallData],
            value: [0],
          },
        ],
        account: accounts[3],
      });

      await setVotesOnProposal({
        guild: snapshotRepErc20Guild,
        proposalId: burnProposalId,
        option: 1,
        account: accounts[4],
      });
      await setVotesOnProposal({
        guild: snapshotRepErc20Guild,
        proposalId: burnProposalId,
        option: 1,
        account: accounts[5],
      });

      await time.increase(proposalTime);

      // execute burn proposal
      await snapshotRepErc20Guild.endProposal(burnProposalId);

      const proposalId2 = await createProposal(genericProposal);
      const snapshotId2 = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId2)
      );

      // voting power at snapshotId2 after burn
      const votingPower2 = await snapshotRepErc20Guild.votingPowerOfAt(
        account,
        snapshotId2
      );

      expect(votingPower2).to.be.bignumber.equal(
        initialVotingPowerAcc.sub(initialVotingPowerAcc)
      );

      assert.equal(
        await snapshotRepErc20Guild.getVotingPowerForProposalCreation(),
        "45000"
      );
      assert.equal(
        await snapshotRepErc20Guild.getVotingPowerForProposalExecution(),
        "225000"
      );
    });
  });
});
