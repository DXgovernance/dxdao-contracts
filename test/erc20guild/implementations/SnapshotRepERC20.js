import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { expect } from "chai";
import * as helpers from "../../helpers";
const { fixSignature } = require("../../helpers/sign");
const { createProposal } = require("../../helpers/guild");

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

const balances = [50000, 50000, 50000, 100000, 100000, 200000];
const proposalTime = 30;
const votingPowerForProposalExecution = 5000;
const votingPowerForProposalCreation = 100;

contract("SnapshotRepERC20Guild", function (accounts) {
  const constants = helpers.constants;

  let guildToken,
    snapshotRepErc20Guild,
    permissionRegistry,
    createGenericProposal;

  beforeEach(async function () {
    const repHolders = accounts.slice(0, 6);
    guildToken = await ERC20SnapshotRep.new();
    guildToken.initialize("Test ERC20SnapshotRep Token", "TESRT", {
      from: accounts[0],
    });

    const [, ...restOfHoldersAccounts] = repHolders;
    await Promise.all(
      restOfHoldersAccounts.map((account, idx) => {
        guildToken.mint(account, balances[Number(idx) + 1]);
      })
    );

    snapshotRepErc20Guild = await SnapshotRepERC20Guild.new();
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    await snapshotRepErc20Guild.initialize(
      guildToken.address,
      proposalTime,
      30, // _timeForExecution,
      votingPowerForProposalExecution,
      votingPowerForProposalCreation,
      "SnapshotRep Guild",
      10, //  _voteGas,
      0, //  _maxGasPrice,
      10, //  _maxActiveProposals,
      60, //  _lockTime,
      permissionRegistry.address
    );

    createGenericProposal = (config = {}) =>
      Object.assign(
        {
          guild: snapshotRepErc20Guild,
          actions: [
            {
              to: [constants.ANY_ADDRESS, constants.ANY_ADDRESS],
              data: ["0x00", "0x00"],
              value: [new BN("0"), new BN("1")],
            },
          ],
          account: accounts[1],
        },
        config
      );
  });

  describe("setVote", () => {
    let proposalId, snapshotId;
    beforeEach(async () => {
      proposalId = await createProposal(createGenericProposal());
      snapshotId = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId)
      );
    });
    it("Should Vote", async () => {
      const account = accounts[2];
      const action = new BN(0);
      const votingPower = new BN(500);

      const proposalData1 = await snapshotRepErc20Guild.getProposal(proposalId);
      const totalVotes1 = new BN(proposalData1.totalVotes);
      expect(parseInt(totalVotes1.toString())).to.be.equal(0);

      await snapshotRepErc20Guild.setVote(proposalId, action, votingPower, {
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
      const action = new BN(0);
      const votingPower = new BN(500);
      const tx = await snapshotRepErc20Guild.setVote(
        proposalId,
        action,
        votingPower,
        {
          from: account,
        }
      );

      expectEvent(tx, "VoteAdded", {
        proposalId,
        action,
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
        "SnapshotERC20Guild: Proposal ended, cant be voted"
      );
    });

    it("Should fail if votingPower provided is larger than real user voting power ", async () => {
      const account = accounts[2];
      const action = 0;

      const invalidVotingPower = new BN(
        await snapshotRepErc20Guild.votingPowerOfAt(account, snapshotId)
      ).add(new BN(100));

      const voteTrigger = snapshotRepErc20Guild.setVote(
        proposalId,
        action,
        invalidVotingPower
      );
      await expectRevert(
        voteTrigger,
        "SnapshotERC20Guild: Invalid votingPower amount"
      );
    });

    it("Should fail if user has voted before with larger amount of votingPower and try to decrease it on new vote", async () => {
      const account = accounts[2];
      const action = 0;
      const votingPower = new BN(1000);
      const decreasedVotingPower = votingPower.sub(new BN(10));
      await snapshotRepErc20Guild.setVote(proposalId, action, votingPower, {
        from: account,
      });

      await expectRevert(
        snapshotRepErc20Guild.setVote(
          proposalId,
          action,
          decreasedVotingPower,
          {
            from: account,
          }
        ),
        "SnapshotERC20Guild: Cant decrease votingPower in vote"
      );
    });

    it("Should fail if user has voted and try to change voted action", async () => {
      const account = accounts[2];
      const action1 = new BN("1");
      const action2 = new BN("0");
      const votingPower = new BN("500");
      const increasedVotingPower = new BN("10000");

      await snapshotRepErc20Guild.setVote(proposalId, action1, votingPower, {
        from: account,
      });

      await expectRevert(
        snapshotRepErc20Guild.setVote(
          proposalId,
          action2,
          increasedVotingPower,
          {
            from: account,
          }
        ),
        "SnapshotERC20Guild: Cant change action voted, only increase votingPower"
      );
    });
  });

  describe("setSignedVote", () => {
    let proposalId, snapshotId;
    beforeEach(async () => {
      proposalId = await createProposal(createGenericProposal());
      snapshotId = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId)
      );
    });

    it("Should fail if user has voted", async () => {
      const account = accounts[2];
      const action = new BN("0");
      const votingPower = new BN("500");
      const hashedVote = await snapshotRepErc20Guild.hashVote(
        account,
        proposalId,
        action,
        votingPower
      );
      const votesignature = fixSignature(
        await web3.eth.sign(hashedVote, account)
      );

      await snapshotRepErc20Guild.setSignedVote(
        proposalId,
        action,
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
          action,
          votingPower,
          account,
          votesignature,
          {
            from: account,
          }
        ),
        "SnapshotERC20Guild: Already voted"
      );
    });

    it("Should fail with wrong signer msg", async () => {
      const account = accounts[2];
      const wrongSignerAccount = accounts[3];
      const action = new BN("0");
      const votingPower = new BN("500");

      const hashedVote = await snapshotRepErc20Guild.hashVote(
        account,
        proposalId,
        action,
        votingPower
      );
      const votesignature = fixSignature(
        await web3.eth.sign(hashedVote, wrongSignerAccount)
      );

      await expectRevert(
        snapshotRepErc20Guild.setSignedVote(
          proposalId,
          action,
          votingPower,
          account,
          votesignature,
          {
            from: account,
          }
        ),
        "SnapshotERC20Guild: Wrong signer"
      );
    });
  });
  describe("lockTokens", () => {
    it("Should revert action", async () => {
      await expectRevert(
        snapshotRepErc20Guild.lockTokens(new BN("100")),
        "SnapshotERC20Guild: token vault disabled"
      );
    });
  });

  describe("withdrawTokens", () => {
    it("Should revert action", async () => {
      await expectRevert(
        snapshotRepErc20Guild.withdrawTokens(new BN("100")),
        "SnapshotERC20Guild: token vault disabled"
      );
    });
  });

  describe("votingPowerOfMultipleAt", () => {
    it("Should return correct voting power", async () => {
      const account2 = accounts[2];
      const account4 = accounts[4];
      const proposalId = await createProposal(createGenericProposal());

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
    it("Should return correct voting power", async () => {
      const account = accounts[2];
      const initialVotingPowerAcc = new BN(balances[2]);

      const proposalId1 = await createProposal(createGenericProposal());
      const snapshotId1 = new BN(
        await snapshotRepErc20Guild.getProposalSnapshotId(proposalId1)
      );
      // voting power at snapshotId1
      const votingPower1 = await snapshotRepErc20Guild.votingPowerOfAt(
        account,
        snapshotId1
      );
      expect(votingPower1).to.be.bignumber.equal(initialVotingPowerAcc);

      // burn tokens
      await guildToken.burn(account, initialVotingPowerAcc);

      const proposalId2 = await createProposal(createGenericProposal());
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
    });
  });
});
