import { ZERO_ADDRESS } from "@openzeppelin/test-helpers/src/constants";
import { web3 } from "@openzeppelin/test-helpers/src/setup";
import * as helpers from "../../helpers";
const { fixSignature } = require("../../helpers/sign");

const {
  BN,
  time,
  expectEvent,
  expectRevert,
  balance,
} = require("@openzeppelin/test-helpers");

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");

contract("DXDVotingMachine", function (accounts) {
  let permissionRegistry,
    masterAvatarScheme,
    registrarScheme,
    org,
    actionMock,
    dxdVotingMachine,
    proposalId;

  const constants = helpers.constants;
  const VOTE_GAS = 360000;
  const TOTAL_GAS_REFUND = VOTE_GAS * constants.GAS_PRICE;

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    const standardTokenMock = await ERC20Mock.new(
      "",
      "",
      constants.MAX_UINT_256,
      accounts[1]
    );
    await standardTokenMock.transfer(accounts[0], 2000, { from: accounts[1] });

    org = await helpers.deployDao({
      owner: accounts[0],
      votingMachineToken: standardTokenMock.address,
      repHolders: [
        { address: accounts[0], amount: 10000 },
        { address: accounts[1], amount: 10000 },
        { address: accounts[2], amount: 10000 },
        { address: accounts[3], amount: 70000 },
      ],
    });

    dxdVotingMachine = org.votingMachine;

    await standardTokenMock.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[1],
      }
    );

    await standardTokenMock.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[0],
      }
    );

    await standardTokenMock.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[2],
      }
    );
    permissionRegistry = await PermissionRegistry.new(accounts[0], 10);
    await permissionRegistry.initialize();

    await time.increase(10);

    masterAvatarScheme = await AvatarScheme.new();
    await masterAvatarScheme.initialize(
      org.avatar.address,
      dxdVotingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Cheap Scheme",
      172800,
      5
    );

    registrarScheme = await WalletScheme.new();
    await registrarScheme.initialize(
      org.avatar.address,
      dxdVotingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Registrar Scheme",
      172800,
      5
    );

    const defaultParamsHash = await helpers.setDefaultParameters(
      org.votingMachine
    );

    await org.controller.registerScheme(
      masterAvatarScheme.address,
      defaultParamsHash,
      false,
      true
    );
    await org.controller.registerScheme(
      registrarScheme.address,
      defaultParamsHash,
      true,
      false
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.NULL_ADDRESS,
      constants.NULL_SIGNATURE,
      constants.TEST_VALUE,
      true
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      dxdVotingMachine.address,
      constants.NULL_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );
    await permissionRegistry.setETHPermission(
      registrarScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature(
        "registerScheme(address,bytes32,bool,bool)"
      ),
      0,
      true
    );
    await permissionRegistry.setETHPermission(
      registrarScheme.address,
      org.controller.address,
      web3.eth.abi.encodeFunctionSignature("unregisterScheme(address)"),
      0,
      true
    );
  });

  describe("Voting", function () {
    describe("Payable Votes", function () {
      let setRefundConfProposalId;
      beforeEach(async function () {
        await web3.eth.sendTransaction({
          from: accounts[0],
          to: org.avatar.address,
          value: web3.utils.toWei("1"),
        });

        const setRefundConfData = web3.eth.abi.encodeFunctionCall(
          DXDVotingMachine.abi.find(x => x.name === "setOrganizationRefund"),
          [VOTE_GAS, constants.GAS_PRICE]
        );

        await permissionRegistry.setETHPermission(
          org.avatar.address,
          dxdVotingMachine.address,
          setRefundConfData.substring(0, 10),
          0,
          true
        );
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          dxdVotingMachine.address,
          constants.NULL_SIGNATURE,
          web3.utils.toWei("1"),
          true
        );
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          constants.NULL_ADDRESS,
          constants.NULL_SIGNATURE,
          web3.utils.toWei("1"),
          true
        );
        const setRefundConfTx = await masterAvatarScheme.proposeCalls(
          [dxdVotingMachine.address],
          [setRefundConfData],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );

        setRefundConfProposalId = await helpers.getValueFromLogs(
          setRefundConfTx,
          "_proposalId"
        );

        const organizationId = (
          await dxdVotingMachine.proposals(setRefundConfProposalId)
        ).organizationId;

        assert.equal(
          await dxdVotingMachine.organizations(organizationId),
          org.avatar.address
        );

        await dxdVotingMachine.vote(
          setRefundConfProposalId,
          1,
          0,
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        );

        const organizationRefundConf =
          await dxdVotingMachine.organizationRefunds(org.avatar.address);
        assert.equal(0, organizationRefundConf.balance);
        assert.equal(VOTE_GAS, organizationRefundConf.voteGas);
        assert.equal(constants.GAS_PRICE, organizationRefundConf.maxGasPrice);

        await permissionRegistry.setETHPermission(
          org.avatar.address,
          actionMock.address,
          helpers.testCallFrom(org.avatar.address).substring(0, 10),
          0,
          true
        );
      });

      it("pay for gasRefund from voting machine only when gasRefund balance is enough", async function () {
        // Send enough eth just for two votes
        const votesRefund = TOTAL_GAS_REFUND * 3;

        const fundVotingMachineTx = await masterAvatarScheme.proposeCalls(
          [dxdVotingMachine.address],
          ["0x0"],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        const fundVotingMachineProposalId = await helpers.getValueFromLogs(
          fundVotingMachineTx,
          "_proposalId"
        );

        await dxdVotingMachine.vote(
          fundVotingMachineProposalId,
          1,
          0,
          constants.NULL_ADDRESS,
          { from: accounts[3], gasLimit: constants.GAS_LIMIT }
        );
        // Vote three times and pay only the first two
        let tx = await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        let proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
        assert.equal(
          TOTAL_GAS_REFUND * 2,
          Number(
            (await dxdVotingMachine.organizationRefunds(org.avatar.address))
              .balance
          )
        );
        // Vote with higher gas than maxGasPrice and dont spend more than one vote refund
        await dxdVotingMachine.vote(proposalId, 2, 0, constants.NULL_ADDRESS, {
          from: accounts[1],
          gasPrice: constants.GAS_PRICE * 2,
        });

        assert.equal(
          TOTAL_GAS_REFUND,
          Number(
            (await dxdVotingMachine.organizationRefunds(org.avatar.address))
              .balance
          )
        );
        await dxdVotingMachine.vote(proposalId, 2, 0, constants.NULL_ADDRESS, {
          from: accounts[2],
          gasPrice: constants.GAS_PRICE,
        });

        assert.equal(
          0,
          Number(
            (await dxdVotingMachine.organizationRefunds(org.avatar.address))
              .balance
          )
        );
        const balanceBeforeVote = new BN(
          await web3.eth.getBalance(accounts[3])
        );
        tx = await dxdVotingMachine.vote(
          proposalId,
          1,
          0,
          constants.NULL_ADDRESS,
          { from: accounts[3], gasPrice: constants.GAS_PRICE }
        );
        const balanceAfterVote = new BN(await web3.eth.getBalance(accounts[3]));

        // There wasnt enough gas balance in the voting machine to pay the gas refund of the last vote
        const gastVoteWithoutRefund = parseInt(
          balanceBeforeVote
            .sub(balanceAfterVote)
            .div(new BN(constants.GAS_PRICE))
            .toString()
        );
        expect(tx.receipt.gasUsed).to.be.closeTo(gastVoteWithoutRefund, 1);

        const organizationProposal =
          await masterAvatarScheme.getOrganizationProposal(proposalId);
        assert.equal(
          organizationProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
        );
        assert.equal(
          organizationProposal.callData[0],
          helpers.testCallFrom(org.avatar.address)
        );
        assert.equal(organizationProposal.to[0], actionMock.address);
        assert.equal(organizationProposal.value[0], 0);
      });

      it("Can view rep of votes and amount staked on proposal", async function () {
        const statusInfo = await dxdVotingMachine.proposalStatusWithVotes(
          setRefundConfProposalId
        );

        expect(statusInfo["0"].toNumber()).to.equal(70000);
        expect(statusInfo["1"].toNumber()).to.equal(0);
        expect(statusInfo["2"].toNumber()).to.equal(70000);
        expect(statusInfo["3"].toNumber()).to.equal(0);
        expect(statusInfo["4"].toNumber()).to.equal(0);
        expect(statusInfo["5"].toNumber()).to.equal(100);
      });

      it("Should fail if voter has already voted", async function () {
        const proposalId = await helpers.getValueFromLogs(
          await masterAvatarScheme.proposeCalls(
            [actionMock.address],
            [helpers.testCallFrom(org.avatar.address)],
            [0],
            2,
            constants.TEST_TITLE,
            constants.SOME_HASH
          ),
          "_proposalId"
        );

        const vote = await dxdVotingMachine.vote(
          proposalId,
          1,
          0,
          constants.NULL_ADDRESS,
          {
            from: accounts[1],
          }
        );

        await expectEvent(vote.receipt, "VoteProposal", {
          _proposalId: proposalId,
          _organization: org.avatar.address,
          _voter: accounts[1],
          _vote: "1",
          _reputation: "10000",
        });

        const secondVote = await dxdVotingMachine.vote(
          proposalId,
          2,
          0,
          constants.NULL_ADDRESS,
          {
            from: accounts[1],
          }
        );

        expectEvent.notEmitted(secondVote.receipt, "VoteProposal");
      });

      describe("VoteOnBehalf", function () {
        let genericProposalId;
        beforeEach(async function () {
          const parameterHash = await dxdVotingMachine.getParametersHash(
            helpers.defaultParametersArray,
            accounts[3]
          );

          const tempAvatarScheme = await AvatarScheme.new();
          await tempAvatarScheme.initialize(
            org.avatar.address,
            dxdVotingMachine.address,
            org.controller.address,
            permissionRegistry.address,
            "Temp Scheme",
            172800,
            5
          );

          const registerSchemeData = web3.eth.abi.encodeFunctionCall(
            org.controller.abi.find(x => x.name === "registerScheme"),
            [tempAvatarScheme.address, parameterHash, true, true]
          );

          const registerProposalId = await helpers.getValueFromLogs(
            await registrarScheme.proposeCalls(
              [org.controller.address],
              [registerSchemeData],
              [0],
              2,
              constants.TEST_TITLE,
              constants.SOME_HASH
            ),
            "_proposalId"
          );

          assert.equal(
            (await registrarScheme.getOrganizationProposal(registerProposalId))
              .state,
            constants.WALLET_SCHEME_PROPOSAL_STATES.submitted
          );

          await dxdVotingMachine.vote(
            registerProposalId,
            1,
            0,
            constants.NULL_ADDRESS,
            { from: accounts[3] }
          );

          assert.equal(
            (await registrarScheme.getOrganizationProposal(registerProposalId))
              .state,
            constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
          );

          assert.equal(
            await org.controller.getSchemeParameters(
              tempAvatarScheme.address,
              org.avatar.address
            ),
            parameterHash
          );

          genericProposalId = await helpers.getValueFromLogs(
            await tempAvatarScheme.proposeCalls(
              [accounts[1]],
              ["0x0"],
              [10],
              2,
              constants.TEST_TITLE,
              constants.SOME_HASH
            ),
            "_proposalId"
          );
        });

        it("Fails if address is not allowed to vote on behalf", async function () {
          const proposalParamsHash = (
            await dxdVotingMachine.proposals(genericProposalId)
          ).defaultParamsHash;

          const params = await dxdVotingMachine.parameters(proposalParamsHash);

          assert.equal(params.voteOnBehalf, accounts[3]);

          await expectRevert(
            dxdVotingMachine.vote(genericProposalId, 1, 0, accounts[2], {
              from: accounts[1],
            }),
            "address not allowed to vote on behalf"
          );
        });

        it("Succeeds if allowed address is able to vote on behalf", async function () {
          const tx = await dxdVotingMachine.vote(
            genericProposalId,
            1,
            0,
            accounts[2],
            {
              from: accounts[3],
            }
          );

          await expectEvent(tx, "VoteProposal", {
            _proposalId: genericProposalId,
            _organization: org.avatar.address,
            _voter: accounts[2],
            _vote: "1",
            _reputation: "10000",
          });
        });

        it("should emit event StateChange to QuietVotingPeriod", async function () {
          const upStake = await dxdVotingMachine.stake(
            genericProposalId,
            1,
            2000,
            {
              from: accounts[1],
            }
          );

          const totalStaked = (
            await dxdVotingMachine.proposals(genericProposalId)
          ).totalStakes;

          assert.equal(totalStaked, 2000);

          // check preBoosted
          expectEvent(upStake.receipt, "StateChange", {
            _proposalId: genericProposalId,
            _proposalState: "4",
          });

          await time.increase(3600 + 1);

          const finalVote = await dxdVotingMachine.vote(
            genericProposalId,
            1,
            0,
            accounts[1],
            { from: accounts[3], gasPrice: constants.GAS_PRICE }
          );

          expectEvent(finalVote.receipt, "StateChange", {
            _proposalId: genericProposalId,
            _proposalState: "6",
          });

          // check QuietEndingPeriod
          assert.equal(
            (await dxdVotingMachine.proposals(genericProposalId)).state,
            "6"
          );
        });
      });
    });

    describe("Signed Votes", function () {
      beforeEach(async function () {
        const actionMock = await ActionMock.new();
        await web3.eth.sendTransaction({
          from: accounts[0],
          to: org.avatar.address,
          value: constants.TEST_VALUE,
        });

        const payCallData = web3.eth.abi.encodeFunctionCall(
          actionMock.abi.find(x => x.name === "executeCall"),
          [accounts[1], "0x0", 10]
        );

        const callDataMintRep = web3.eth.abi.encodeFunctionCall(
          org.controller.abi.find(x => x.name === "mintReputation"),
          [constants.TEST_VALUE, accounts[4]]
        );

        await permissionRegistry.setETHPermission(
          org.avatar.address,
          actionMock.address,
          payCallData.substring(0, 10),
          0,
          true
        );
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          actionMock.address,
          constants.NULL_SIGNATURE,
          constants.TEST_VALUE,
          true
        );

        const tx = await masterAvatarScheme.proposeCalls(
          [actionMock.address, actionMock.address, org.controller.address],
          ["0x0", payCallData, callDataMintRep],
          [constants.TEST_VALUE, 0, 0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      });

      it("fail sharing invalid vote signature", async function () {
        const voteHash = await dxdVotingMachine.hashVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          70000
        );
        const votesignature = fixSignature(
          await web3.eth.sign(voteHash, accounts[3])
        );
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        await expectRevert(
          dxdVotingMachine.shareSignedVote(
            dxdVotingMachine.address,
            proposalId,
            accounts[3],
            2,
            70000,
            votesignature,
            { from: accounts[3] }
          ),
          "wrong signer"
        );

        await expectRevert(
          dxdVotingMachine.shareSignedVote(
            dxdVotingMachine.address,
            proposalId,
            accounts[3],
            1,
            71000,
            votesignature,
            { from: accounts[3] }
          ),
          "wrong signer"
        );
      });
      it("Can share a vote signed by a different user", async function () {
        const voteHash = await dxdVotingMachine.hashVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          70000
        );

        const votesignature = fixSignature(
          await web3.eth.sign(voteHash, accounts[3])
        );

        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        const voteTx = await dxdVotingMachine.shareSignedVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          70000,
          votesignature,
          { from: accounts[1] }
        );

        expectEvent(voteTx, "VoteSigned", {
          votingMachine: dxdVotingMachine.address,
          proposalId: proposalId,
          voter: accounts[3],
          voteDecision: "1",
          amount: "70000",
          signature: votesignature,
        });
      });

      it("Cannot share a vote with the incorrect signature", async function () {
        const voteHash = await dxdVotingMachine.hashVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          70000,
          { from: accounts[1] }
        );

        const votesignature = fixSignature(
          await web3.eth.sign(voteHash, accounts[1])
        );

        assert.equal(
          accounts[1],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        await expectRevert(
          dxdVotingMachine.shareSignedVote(
            dxdVotingMachine.address,
            proposalId,
            accounts[3],
            1,
            70000,
            votesignature,
            { from: accounts[1] }
          ),
          "wrong signer"
        );
      });

      it("fail executing vote with invalid data", async function () {
        const voteHash = await dxdVotingMachine.hashVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          70000
        );
        const votesignature = fixSignature(
          await web3.eth.sign(voteHash, accounts[3])
        );
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        const shareVoteTx = await dxdVotingMachine.shareSignedVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          70000,
          votesignature,
          { from: accounts[3] }
        );
        const voteInfoFromLog = shareVoteTx.logs[0].args;

        await expectRevert(
          dxdVotingMachine.executeSignedVote(
            voteInfoFromLog.votingMachine,
            voteInfoFromLog.proposalId,
            voteInfoFromLog.voter,
            2,
            voteInfoFromLog.amount,
            voteInfoFromLog.signature,
            { from: accounts[4] }
          ),
          "wrong signer"
        );

        await expectRevert(
          dxdVotingMachine.executeSignedVote(
            voteInfoFromLog.votingMachine,
            voteInfoFromLog.proposalId,
            voteInfoFromLog.voter,
            voteInfoFromLog.voteDecision,
            voteInfoFromLog.amount - 1,
            voteInfoFromLog.signature,
            { from: accounts[4] }
          ),
          "wrong signer"
        );

        await expectRevert(
          dxdVotingMachine.executeSignedVote(
            voteInfoFromLog.votingMachine,
            voteInfoFromLog.proposalId,
            accounts[1],
            voteInfoFromLog.voteDecision,
            voteInfoFromLog.amount,
            voteInfoFromLog.signature,
            { from: accounts[4] }
          ),
          "wrong signer"
        );
      });

      it("positive signed decision with all rep available", async function () {
        const voteHash = await dxdVotingMachine.hashVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          0
        );
        const votesignature = fixSignature(
          await web3.eth.sign(voteHash, accounts[3])
        );
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        const shareVoteTx = await dxdVotingMachine.shareSignedVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          0,
          votesignature,
          { from: accounts[3] }
        );
        const voteInfoFromLog = shareVoteTx.logs[0].args;
        await dxdVotingMachine.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          voteInfoFromLog.voteDecision,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          { from: accounts[4] }
        );

        const organizationProposal =
          await masterAvatarScheme.getOrganizationProposal(proposalId);
        assert.equal(
          organizationProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
        );
      });

      it("negative signed decision with less rep than the one held", async function () {
        // The voter has 70 rep but votes with 60 rep
        const voteHash = await dxdVotingMachine.hashVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          2,
          60000
        );
        const votesignature = fixSignature(
          await web3.eth.sign(voteHash, accounts[3])
        );
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        const shareVoteTx = await dxdVotingMachine.shareSignedVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          2,
          60000,
          votesignature,
          { from: accounts[3] }
        );
        const voteInfoFromLog = shareVoteTx.logs[0].args;

        await dxdVotingMachine.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          voteInfoFromLog.voteDecision,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          { from: accounts[4] }
        );

        const organizationProposal =
          await masterAvatarScheme.getOrganizationProposal(proposalId);
        assert.equal(
          organizationProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
        );
      });
    });

    describe("Signal Votes", function () {
      beforeEach(async function () {
        const tx = await masterAvatarScheme.proposeCalls(
          [accounts[1]],
          ["0x0"],
          [constants.TEST_VALUE],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      });

      it("positive signal decision", async function () {
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .voteDecision,
          0
        );
        await expectRevert(
          dxdVotingMachine.signalVote(proposalId, 3, 60000, {
            from: accounts[3],
          }),
          "wrong decision value"
        );
        const signalVoteTx = await dxdVotingMachine.signalVote(
          proposalId,
          1,
          60000,
          { from: accounts[3] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .voteDecision,
          1
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .amount,
          60000
        );
        expect(signalVoteTx.receipt.gasUsed).to.be.closeTo(50000, 25000);
        const voteInfoFromLog = signalVoteTx.logs[0].args;
        await dxdVotingMachine.executeSignaledVote(
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          { from: accounts[4] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .voteDecision,
          0
        );
        const organizationProposal =
          await masterAvatarScheme.getOrganizationProposal(proposalId);
        assert.equal(
          organizationProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
        );
      });

      it("negative signal decision", async function () {
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .voteDecision,
          0
        );
        const signalVoteTx = await dxdVotingMachine.signalVote(
          proposalId,
          2,
          0,
          { from: accounts[3] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .voteDecision,
          2
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .amount,
          0
        );
        expect(signalVoteTx.receipt.gasUsed).to.be.closeTo(50000, 25000);

        const voteInfoFromLog = signalVoteTx.logs[0].args;
        await dxdVotingMachine.executeSignaledVote(
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          { from: accounts[4] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .voteDecision,
          0
        );
        const organizationProposal =
          await masterAvatarScheme.getOrganizationProposal(proposalId);
        assert.equal(
          organizationProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
        );
      });
    });
  });

  describe("Boosted Proposals", function () {
    beforeEach(async function () {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: web3.utils.toWei("1"),
      });

      const parameterHash = await dxdVotingMachine.getParametersHash(
        helpers.defaultParametersArray,
        helpers.defaultParameters.voteOnBehalf
      );

      const setBoostedVoteRequiredPercentageData =
        web3.eth.abi.encodeFunctionCall(
          DXDVotingMachine.abi.find(
            x => x.name === "setBoostedVoteRequiredPercentage"
          ),
          [masterAvatarScheme.address, parameterHash, 1950]
        );

      await permissionRegistry.setETHPermission(
        org.avatar.address,
        dxdVotingMachine.address,
        setBoostedVoteRequiredPercentageData.substring(0, 10),
        0,
        true
      );
      await permissionRegistry.setETHPermission(
        org.avatar.address,
        actionMock.address,
        helpers.testCallFrom(org.avatar.address).substring(0, 10),
        0,
        true
      );

      const setBoostedVoteRequiredPercentageTx =
        await masterAvatarScheme.proposeCalls(
          [dxdVotingMachine.address],
          [setBoostedVoteRequiredPercentageData],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
      const setBoostedVoteRequiredPercentageProposalId =
        await helpers.getValueFromLogs(
          setBoostedVoteRequiredPercentageTx,
          "_proposalId"
        );
      const organizationId = (
        await dxdVotingMachine.proposals(
          setBoostedVoteRequiredPercentageProposalId
        )
      ).organizationId;
      assert.equal(
        await dxdVotingMachine.organizations(organizationId),
        org.avatar.address
      );
      await dxdVotingMachine.vote(
        setBoostedVoteRequiredPercentageProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );

      assert.equal(
        1950,
        await dxdVotingMachine.getBoostedVoteRequiredPercentage(
          org.avatar.address,
          masterAvatarScheme.address,
          parameterHash
        )
      );
    });

    it("boosted proposal should succeed with enough votes", async function () {
      const tx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const stakeTx = await dxdVotingMachine.stake(testProposalId, 1, 1000, {
        from: accounts[1],
      });

      expectEvent(stakeTx.receipt, "StateChange", {
        _proposalId: testProposalId,
        _proposalState: "4",
      });

      await dxdVotingMachine.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gasPrice: constants.GAS_PRICE }
      );

      await dxdVotingMachine.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[1], gasPrice: constants.GAS_PRICE }
      );
      await time.increase(86400 + 1);
      const executeTx = await dxdVotingMachine.execute(testProposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });
      // Check it changed to executed in redeem
      await expectEvent.inTransaction(
        executeTx.tx,
        dxdVotingMachine.contract,
        "StateChange",
        {
          _proposalId: testProposalId,
          _proposalState: "2",
        }
      );

      const organizationProposal =
        await masterAvatarScheme.getOrganizationProposal(testProposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(
        organizationProposal.callData[0],
        helpers.testCallFrom(org.avatar.address)
      );
      assert.equal(organizationProposal.to[0], actionMock.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    it("boosted proposal should fail with not enough votes", async function () {
      const tx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const stakeTx = await dxdVotingMachine.stake(testProposalId, 1, 1000, {
        from: accounts[1],
      });

      expectEvent(stakeTx.receipt, "StateChange", {
        _proposalId: testProposalId,
        _proposalState: "4",
      });

      await dxdVotingMachine.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gasPrice: constants.GAS_PRICE }
      );

      await time.increase(86400 + 1);

      const executeTx = await dxdVotingMachine.execute(testProposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // Check it changed to executed in redeem
      await expectEvent.inTransaction(
        executeTx.tx,
        dxdVotingMachine.contract,
        "StateChange",
        {
          _proposalId: testProposalId,
          _proposalState: "1",
        }
      );

      const organizationProposal =
        await masterAvatarScheme.getOrganizationProposal(testProposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
      );
      assert.equal(
        organizationProposal.callData[0],
        helpers.testCallFrom(org.avatar.address)
      );
      assert.equal(organizationProposal.to[0], actionMock.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    it("should calculate average downstake of Boosted Proposals", async function () {
      // First proposal
      const firstProposalTx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );

      const firstProposalId = await helpers.getValueFromLogs(
        firstProposalTx,
        "_proposalId"
      );

      const firstUpStake = await dxdVotingMachine.stake(
        firstProposalId,
        1,
        1000,
        {
          from: accounts[1],
        }
      );

      expectEvent(firstUpStake.receipt, "StateChange", {
        _proposalId: firstProposalId,
        _proposalState: "4",
      });

      // Second proposal

      const secondProposalTx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );

      const secondProposalId = await helpers.getValueFromLogs(
        secondProposalTx,
        "_proposalId"
      );

      const secondUpStake = await dxdVotingMachine.stake(
        secondProposalId,
        1,
        1000,
        { from: accounts[1] }
      );

      expectEvent(secondUpStake.receipt, "StateChange", {
        _proposalId: secondProposalId,
        _proposalState: "4",
      });

      await time.increase(3600 + 1);

      await dxdVotingMachine.vote(
        secondProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        {
          from: accounts[2],
          gasPrice: constants.GAS_PRICE,
        }
      );

      // await time.increase(86400 + 1);

      //check boosted
      assert.equal(
        (await dxdVotingMachine.proposals(secondProposalId)).state,
        "5"
      );

      await dxdVotingMachine.stake(proposalId, 2, 2000, {
        from: accounts[0],
      });

      const upStake = await dxdVotingMachine.stake(proposalId, 1, 7900, {
        from: accounts[1],
      });

      const totalStaked = (await dxdVotingMachine.proposals(proposalId))
        .totalStakes;

      assert.equal(totalStaked, 9900);

      expectEvent(upStake.receipt, "StateChange", {
        _proposalId: proposalId,
        _proposalState: "4",
      });

      await time.increase(3600 + 1);

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      //check boosted
      assert.equal((await dxdVotingMachine.proposals(proposalId)).state, "5");

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[0],
        gasPrice: constants.GAS_PRICE,
      });

      await time.increase(86400 + 1);

      const orgId = (await dxdVotingMachine.proposals(proposalId))
        .organizationId;

      const totalDownStaked =
        await dxdVotingMachine.averagesDownstakesOfBoosted(orgId);

      assert.equal(totalDownStaked, 1015);

      const executeTx = await dxdVotingMachine.execute(proposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // Check it changed to executed
      await expectEvent.inTransaction(
        executeTx.tx,
        dxdVotingMachine.contract,
        "StateChange",
        {
          _proposalId: proposalId,
          _proposalState: "2",
        }
      );

      const proposalState = (
        await masterAvatarScheme.getOrganizationProposal(proposalId)
      ).state;

      assert.equal(
        proposalState,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });

    it("execution state is preBoosted after the vote execution bar has been crossed", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "_proposalId"
      );

      const upStake = await dxdVotingMachine.stake(proposalId, 1, 2000, {
        from: accounts[1],
      });

      const totalStaked = (await dxdVotingMachine.proposals(proposalId))
        .totalStakes;

      assert.equal(totalStaked, 2000);

      // check preBoosted
      expectEvent(upStake.receipt, "StateChange", {
        _proposalId: proposalId,
        _proposalState: "4",
      });

      // vote enough times to pass the execution bar threshold
      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[0],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[3],
        gasPrice: constants.GAS_PRICE,
      });

      // check executed
      assert.equal((await dxdVotingMachine.proposals(proposalId)).state, "2");

      const proposalState = (
        await masterAvatarScheme.getOrganizationProposal(proposalId)
      ).state;

      assert.equal(
        proposalState,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });

    it("execution state is Boosted after the vote execution bar has been crossed", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "_proposalId"
      );

      const upStake = await dxdVotingMachine.stake(proposalId, 1, 2000, {
        from: accounts[1],
      });

      const totalStaked = (await dxdVotingMachine.proposals(proposalId))
        .totalStakes;

      assert.equal(totalStaked, 2000);

      // check preBoosted
      expectEvent(upStake.receipt, "StateChange", {
        _proposalId: proposalId,
        _proposalState: "4",
      });

      await time.increase(3600 + 1);

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // check boosted
      assert.equal((await dxdVotingMachine.proposals(proposalId)).state, "5");

      // vote enough times to pass the execution bar threshold
      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[3],
        gasPrice: constants.GAS_PRICE,
      });

      // check executed
      assert.equal((await dxdVotingMachine.proposals(proposalId)).state, "2");

      const proposalState = (
        await masterAvatarScheme.getOrganizationProposal(proposalId)
      ).state;

      assert.equal(
        proposalState,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });

    it("should check proposal score against confidence threshold", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "_proposalId"
      );

      const upStake = await dxdVotingMachine.stake(proposalId, 1, 500, {
        from: accounts[1],
      });

      // downstake
      await dxdVotingMachine.stake(proposalId, 2, 2000, {
        from: accounts[0],
      });

      const totalStaked = (await dxdVotingMachine.proposals(proposalId))
        .totalStakes;

      assert.equal(totalStaked, 2500);

      // check preBoosted
      expectEvent(upStake.receipt, "StateChange", {
        _proposalId: proposalId,
        _proposalState: "4",
      });

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // vote enough times to pass the execution bar threshold
      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[3],
        gasPrice: constants.GAS_PRICE,
      });

      // check executed
      assert.equal((await dxdVotingMachine.proposals(proposalId)).state, "2");

      const proposalState = (
        await masterAvatarScheme.getOrganizationProposal(proposalId)
      ).state;

      assert.equal(
        proposalState,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });
    it("should emit confidenceLevelChange event", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "_proposalId"
      );

      const proposalId2 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "_proposalId"
      );

      await dxdVotingMachine.stake(proposalId2, 1, 1500, {
        from: accounts[1],
      });

      await time.increase(3600 + 1);

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.execute(proposalId2, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // check boosted
      assert.equal((await dxdVotingMachine.proposals(proposalId2)).state, "5");

      await dxdVotingMachine.vote(proposalId, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      const upStake = await dxdVotingMachine.stake(proposalId, 1, 100, {
        from: accounts[1],
      });

      // check preBoosted
      expectEvent(upStake.receipt, "StateChange", {
        _proposalId: proposalId,
        _proposalState: "4",
      });

      await dxdVotingMachine.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[0],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId2, 1, 0, constants.NULL_ADDRESS, {
        from: accounts[3],
        gasPrice: constants.GAS_PRICE,
      });

      // check executed
      assert.equal((await dxdVotingMachine.proposals(proposalId2)).state, "2");

      const downStake = await dxdVotingMachine.stake(proposalId, 2, 50, {
        from: accounts[0],
      });

      expectEvent(downStake.receipt, "ConfidenceLevelChange", {
        _proposalId: proposalId,
        _confidenceThreshold: "1099511627776",
      });
    });
  });

  describe("Fallback function", function () {
    it("Should not receive value from unregistered organization", async function () {
      await expectRevert(
        // Send value to DXDVotingMachine with unregistered organization address
        web3.eth.sendTransaction({
          from: accounts[0],
          to: dxdVotingMachine.address,
          value: constants.TEST_VALUE,
        }),
        "Address not registered in organizationRefounds"
      );
    });
    it("Should receive value from registered organization", async function () {
      // get contract instance
      const contract = new web3.eth.Contract(
        DXDVotingMachine.abi,
        dxdVotingMachine.address
      );

      // register organization
      await contract.methods
        .setOrganizationRefund(VOTE_GAS, constants.GAS_PRICE)
        .send({ from: accounts[1] });

      // Send value to DXDVotingMachine with registered organization address
      await web3.eth.sendTransaction({
        from: accounts[1],
        to: contract.options.address,
        value: constants.TEST_VALUE,
      });
      // Get organizationRefund data
      const organizationRefoundData = await contract.methods
        .organizationRefunds(accounts[1])
        .call();

      assert.equal(
        Number(organizationRefoundData.balance),
        constants.TEST_VALUE
      );
    });
  });

  describe("withdrawRefundBalance", function () {
    let dxdVotingMachineInstance;
    beforeEach(function () {
      dxdVotingMachineInstance = new web3.eth.Contract(
        DXDVotingMachine.abi,
        dxdVotingMachine.address
      );
    });

    it("Should not withdraw refund balance if organization is not registered", async function () {
      const unexistentOrganizationAddress = accounts[2];
      const expectedErrorMsg =
        "DXDVotingMachine: Address not registered in organizationRefounds";
      try {
        await dxdVotingMachineInstance.methods
          .withdrawRefundBalance()
          .call({ from: unexistentOrganizationAddress });
      } catch (e) {
        expect(e.message).to.contain(expectedErrorMsg);
      }
    });

    it("Should not withdraw if organization has no balance", async function () {
      const registeredOrganization = accounts[3];
      const expectedErrorMsg =
        "DXDVotingMachine: Organization refund balance is zero";

      // register organization
      await dxdVotingMachineInstance.methods
        .setOrganizationRefund(VOTE_GAS, constants.GAS_PRICE)
        .send({ from: registeredOrganization });

      try {
        await dxdVotingMachineInstance.methods
          .withdrawRefundBalance()
          .call({ from: registeredOrganization });
      } catch (e) {
        expect(e.message).to.contain(expectedErrorMsg);
      }
    });

    it("Should withdraw refund balance if balance is bigger than 0 for registered organizations", async function () {
      const registeredOrganizationAddress = accounts[4];
      const VALUE = 500000000000;
      const tracker = await balance.tracker(
        registeredOrganizationAddress,
        "wei"
      );
      const initialBalance = await tracker.get();

      // register organization
      await dxdVotingMachineInstance.methods
        .setOrganizationRefund(VOTE_GAS, constants.GAS_PRICE)
        .send({ from: registeredOrganizationAddress });

      // Send value to DXDVotingMachine with registered organization address
      await web3.eth.sendTransaction({
        from: registeredOrganizationAddress,
        to: dxdVotingMachineInstance.options.address,
        value: VALUE,
      });

      const orgRefund = await dxdVotingMachineInstance.methods
        .organizationRefunds(registeredOrganizationAddress)
        .call();

      // check org balance has been updated ok.
      expect(Number(orgRefund.balance)).to.eql(VALUE);

      // withdraw refund balance
      await dxdVotingMachineInstance.methods
        .withdrawRefundBalance()
        .send({ from: registeredOrganizationAddress });

      const orgBalance = Number(
        (
          await dxdVotingMachineInstance.methods
            .organizationRefunds(registeredOrganizationAddress)
            .call()
        ).balance
      );

      const { fees } = await tracker.deltaWithFees();
      const balanceAfterWithdraw = await tracker.get();

      // Expect reset balance
      expect(orgBalance).to.eql(0);

      expect(balanceAfterWithdraw).to.eql(initialBalance.sub(fees));
    });
  });

  describe("Staking", function () {
    let stakeProposalId;
    beforeEach(async function () {
      await permissionRegistry.setETHPermission(
        org.avatar.address,
        actionMock.address,
        helpers.testCallFrom(org.avatar.address).substring(0, 10),
        0,
        true
      );

      stakeProposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "_proposalId"
      );
    });
    it("should execute a proposal but fail to stake", async function () {
      const stake = await dxdVotingMachine.stake(stakeProposalId, 1, 2000, {
        from: accounts[1],
      });

      expectEvent(stake.receipt, "StateChange", {
        _proposalId: stakeProposalId,
        _proposalState: "4",
      });

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.vote(
        stakeProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        {
          from: accounts[1],
          gasPrice: constants.GAS_PRICE,
        }
      );

      // check Boosted
      assert.equal(
        (await dxdVotingMachine.proposals(stakeProposalId)).state,
        "5"
      );

      await time.increase(helpers.defaultParameters.boostedVotePeriodLimit + 1);

      const executeStake = await dxdVotingMachine.stake(
        stakeProposalId,
        1,
        2000,
        {
          from: accounts[1],
        }
      );

      expectEvent(executeStake.receipt, "StateChange", {
        _proposalId: stakeProposalId,
        _proposalState: "2",
      });

      expectEvent.notEmitted(executeStake.receipt, "Stake");
    });
    it("address cannot upstake and downstake on same proposal", async function () {
      const upStake = await dxdVotingMachine.stake(stakeProposalId, 1, 100, {
        from: accounts[1],
      });

      expectEvent(upStake.receipt, "Stake", {
        _proposalId: stakeProposalId,
        _organization: org.avatar.address,
        _staker: accounts[1],
        _vote: "1",
        _amount: "100",
      });

      const downStake = await dxdVotingMachine.stake(stakeProposalId, 2, 100, {
        from: accounts[1],
      });

      expectEvent.notEmitted(downStake.receipt, "Stake");
    });
  });
});
