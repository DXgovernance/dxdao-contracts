import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert } from "chai";
import * as helpers from "../../helpers";

const {
  BN,
  time,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");
import { getMessage } from "eip-712";

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const AvatarScheme = artifacts.require("./AvatarScheme.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const VotingMachine = artifacts.require("./VotingMachine.sol");

contract("VotingMachine", function (accounts) {
  let permissionRegistry,
    masterAvatarScheme,
    registrarScheme,
    org,
    actionMock,
    dxdVotingMachine,
    proposalId,
    stakingToken;

  const constants = helpers.constants;
  const VOTE_GAS = 360000;
  const TOTAL_GAS_REFUND_PER_VOTE = new BN(VOTE_GAS * constants.GAS_PRICE);

  const range = (n = 1) => [...Array(n).keys()];
  const createSchemeProposals = (amount = 1) =>
    Promise.all(
      range(amount).map(async () => {
        const tx = await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        return helpers.getValueFromLogs(tx, "proposalId");
      })
    );

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    stakingToken = await ERC20Mock.new(
      "",
      "",
      constants.MAX_UINT_256,
      accounts[1]
    );

    org = await helpers.deployDao({
      owner: accounts[0],
      votingMachineToken: stakingToken.address,
      repHolders: [
        { address: accounts[0], amount: 10000 },
        { address: accounts[1], amount: 10000 },
        { address: accounts[2], amount: 10000 },
        { address: accounts[3], amount: 70000 },
      ],
    });

    dxdVotingMachine = org.votingMachine;

    await stakingToken.transfer(accounts[0], web3.utils.toWei("100"), {
      from: accounts[1],
    });
    await stakingToken.transfer(accounts[2], web3.utils.toWei("100"), {
      from: accounts[1],
    });
    await stakingToken.transfer(accounts[3], web3.utils.toWei("100"), {
      from: accounts[1],
    });
    await stakingToken.transfer(org.avatar.address, web3.utils.toWei("100"), {
      from: accounts[1],
    });

    await stakingToken.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[0],
      }
    );
    await stakingToken.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[1],
      }
    );
    await stakingToken.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[2],
      }
    );
    await stakingToken.approve(
      dxdVotingMachine.address,
      constants.MAX_UINT_256,
      {
        from: accounts[3],
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
      5
    );

    registrarScheme = await WalletScheme.new();
    await registrarScheme.initialize(
      org.avatar.address,
      dxdVotingMachine.address,
      org.controller.address,
      permissionRegistry.address,
      "Registrar Scheme",
      5
    );

    const defaultParamsHash = await helpers.setDefaultParameters(
      org.votingMachine
    );

    await org.controller.registerScheme(
      masterAvatarScheme.address,
      defaultParamsHash,
      false,
      true,
      true
    );
    await org.controller.registerScheme(
      registrarScheme.address,
      defaultParamsHash,
      true,
      false,
      false
    );
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      constants.ZERO_ADDRESS,
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
        "registerScheme(address,bytes32,bool,bool,bool)"
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

    // Set permissions and execute proposal to approve 100 staking tokens to be used by VM
    await permissionRegistry.setETHPermission(
      org.avatar.address,
      stakingToken.address,
      web3.eth.abi.encodeFunctionSignature("approve(address,uint256)"),
      0,
      true
    );
    await permissionRegistry.addERC20Limit(
      org.avatar.address,
      stakingToken.address,
      web3.utils.toWei("100"),
      0
    );
    const approveStakingTokensData = web3.eth.abi.encodeFunctionCall(
      ERC20Mock.abi.find(x => x.name === "approve"),
      [dxdVotingMachine.address, web3.utils.toWei("100")]
    );

    const proposalToApproveStakeTokens = await helpers.getValueFromLogs(
      await masterAvatarScheme.proposeCalls(
        [stakingToken.address],
        [approveStakingTokensData],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      ),
      "proposalId"
    );
    await dxdVotingMachine.vote(
      proposalToApproveStakeTokens,
      constants.YES_OPTION,
      0,
      {
        from: accounts[3],
      }
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
          VotingMachine.abi.find(x => x.name === "setSchemeRefund"),
          [
            org.avatar.address,
            masterAvatarScheme.address,
            VOTE_GAS,
            constants.GAS_PRICE,
          ]
        );
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          dxdVotingMachine.address,
          setRefundConfData.substring(0, 10),
          constants.MAX_UINT_256,
          true
        );
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          dxdVotingMachine.address,
          web3.eth.abi.encodeFunctionSignature(
            "withdrawRefundBalance(address,address)"
          ),
          0,
          true
        );
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          constants.ZERO_ADDRESS,
          constants.NULL_SIGNATURE,
          web3.utils.toWei("1"),
          true
        );
        const setRefundConfTx = await masterAvatarScheme.proposeCalls(
          [dxdVotingMachine.address],
          [setRefundConfData],
          [VOTE_GAS * constants.GAS_PRICE],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        setRefundConfProposalId = await helpers.getValueFromLogs(
          setRefundConfTx,
          "proposalId"
        );
        const schemeId = (
          await dxdVotingMachine.proposals(setRefundConfProposalId)
        ).schemeId;
        await dxdVotingMachine.vote(
          setRefundConfProposalId,
          constants.YES_OPTION,
          0,
          { from: accounts[3], gasPrice: constants.GAS_PRICE }
        );
        const schemeData = await dxdVotingMachine.schemes(schemeId);
        assert.equal(schemeData.avatar, org.avatar.address);
        assert.equal("0", schemeData.voteGasBalance.toString());
        assert.equal(VOTE_GAS, schemeData.voteGas);
        assert.equal(constants.GAS_PRICE, schemeData.maxGasPrice);
        await permissionRegistry.setETHPermission(
          org.avatar.address,
          actionMock.address,
          helpers.testCallFrom(org.avatar.address).substring(0, 10),
          0,
          true
        );
      });

      it("pay for gasRefund from voting machine only when gasRefund balance is enough", async function () {
        // Send enough eth just for three votes
        const setRefundConfData = web3.eth.abi.encodeFunctionCall(
          VotingMachine.abi.find(x => x.name === "setSchemeRefund"),
          [
            org.avatar.address,
            masterAvatarScheme.address,
            VOTE_GAS,
            constants.GAS_PRICE,
          ]
        );

        const fundVotingMachineTx = await masterAvatarScheme.proposeCalls(
          [dxdVotingMachine.address],
          [setRefundConfData],
          [TOTAL_GAS_REFUND_PER_VOTE.mul(new BN(3))],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
        const fundVotingMachineProposalId = await helpers.getValueFromLogs(
          fundVotingMachineTx,
          "proposalId"
        );
        const schemeId = (
          await dxdVotingMachine.proposals(setRefundConfProposalId)
        ).schemeId;

        await dxdVotingMachine.vote(
          fundVotingMachineProposalId,
          constants.YES_OPTION,
          0,
          { from: accounts[3], gasPrice: constants.GAS_PRICE }
        );

        assert.equal(
          TOTAL_GAS_REFUND_PER_VOTE * 2,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
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

        let proposalId = await helpers.getValueFromLogs(tx, "proposalId");
        assert.equal(
          TOTAL_GAS_REFUND_PER_VOTE * 2,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
        );
        // Vote with higher gas than maxGasPrice and dont spend more than one vote refund
        await dxdVotingMachine.vote(proposalId, constants.NO_OPTION, 0, {
          from: accounts[1],
          gasPrice: constants.GAS_PRICE * 2,
        });

        assert.equal(
          TOTAL_GAS_REFUND_PER_VOTE,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
        );
        await dxdVotingMachine.vote(proposalId, constants.NO_OPTION, 0, {
          from: accounts[2],
          gasPrice: constants.GAS_PRICE,
        });

        assert.equal(
          0,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
        );
        const balanceBeforeVote = new BN(
          await web3.eth.getBalance(accounts[3])
        );
        tx = await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
          from: accounts[3],
          gasPrice: constants.GAS_PRICE,
        });
        const balanceAfterVote = new BN(await web3.eth.getBalance(accounts[3]));

        // There wasnt enough gas balance in the voting machine to pay the gas refund of the last vote
        const gastVoteWithoutRefund = parseInt(
          balanceBeforeVote
            .sub(balanceAfterVote)
            .div(new BN(constants.GAS_PRICE))
            .toString()
        );
        expect(tx.receipt.gasUsed).to.be.closeTo(gastVoteWithoutRefund, 1);

        const schemeProposal = await masterAvatarScheme.getProposal(proposalId);
        assert.equal(
          schemeProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.passed
        );
        assert.equal(
          (await dxdVotingMachine.proposals(proposalId)).executionState,
          constants.VOTING_MACHINE_EXECUTION_STATES.QueueBarCrossed
        );
        assert.equal(
          schemeProposal.callData[0],
          helpers.testCallFrom(org.avatar.address)
        );
        assert.equal(schemeProposal.to[0], actionMock.address);
        assert.equal(schemeProposal.value[0], 0);
      });

      it("pay for gasRefund from votingMachine and withdrawBalance after that", async function () {
        const setRefundConfData = web3.eth.abi.encodeFunctionCall(
          VotingMachine.abi.find(x => x.name === "setSchemeRefund"),
          [
            org.avatar.address,
            masterAvatarScheme.address,
            VOTE_GAS,
            constants.GAS_PRICE,
          ]
        );

        const setRefundConfProposalId = await helpers.getValueFromLogs(
          await masterAvatarScheme.proposeCalls(
            [dxdVotingMachine.address],
            [setRefundConfData],
            [TOTAL_GAS_REFUND_PER_VOTE.mul(new BN(6))],
            2,
            constants.TEST_TITLE,
            constants.SOME_HASH
          ),
          "proposalId"
        );
        const schemeId = (
          await dxdVotingMachine.proposals(setRefundConfProposalId)
        ).schemeId;

        await dxdVotingMachine.vote(
          setRefundConfProposalId,
          constants.YES_OPTION,
          0,
          { from: accounts[3], gasPrice: constants.GAS_PRICE }
        );

        assert.equal(
          TOTAL_GAS_REFUND_PER_VOTE * 5,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
        );

        const withdrawRefundBalanceData = web3.eth.abi.encodeFunctionCall(
          VotingMachine.abi.find(x => x.name === "withdrawRefundBalance"),
          [org.avatar.address, masterAvatarScheme.address]
        );

        let withdrawRefundBalanceProposalId = await helpers.getValueFromLogs(
          await masterAvatarScheme.proposeCalls(
            [dxdVotingMachine.address],
            [withdrawRefundBalanceData],
            [0],
            2,
            constants.TEST_TITLE,
            constants.SOME_HASH
          ),
          "proposalId"
        );
        assert.equal(
          TOTAL_GAS_REFUND_PER_VOTE * 5,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
        );

        await dxdVotingMachine.vote(
          withdrawRefundBalanceProposalId,
          constants.YES_OPTION,
          0,
          {
            from: accounts[3],
            gasPrice: constants.GAS_PRICE,
            gasLimit: constants.GAS_LIMIT,
          }
        );

        const schemeProposal = await masterAvatarScheme.getProposal(
          withdrawRefundBalanceProposalId
        );
        assert.equal(
          schemeProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.passed
        );
        assert.equal(
          (await dxdVotingMachine.proposals(withdrawRefundBalanceProposalId))
            .executionState,
          constants.VOTING_MACHINE_EXECUTION_STATES.QueueBarCrossed
        );

        assert.equal(
          0,
          Number((await dxdVotingMachine.schemes(schemeId)).voteGasBalance)
        );
      });

      it("Can view rep of votes and amount staked on proposal", async function () {
        const statusInfo = await dxdVotingMachine.getProposalStatus(
          setRefundConfProposalId
        );

        expect(statusInfo["0"].toString()).to.equal("0");
        expect(statusInfo["1"].toString()).to.equal("70000");
        expect(statusInfo["2"].toString()).to.equal("0");
        expect(statusInfo["3"].toString()).to.equal("70000");
        expect(statusInfo["4"].toString()).to.equal(
          web3.utils.toWei("0.1").toString()
        );
        expect(statusInfo["5"].toString()).to.equal("0");
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
          "proposalId"
        );

        const vote = await dxdVotingMachine.vote(
          proposalId,
          constants.YES_OPTION,
          0,
          {
            from: accounts[1],
          }
        );

        await expectEvent(vote.receipt, "VoteProposal", {
          proposalId: proposalId,
          avatar: org.avatar.address,
          voter: accounts[1],
          option: constants.YES_OPTION.toString(),
          reputation: "10000",
        });

        const secondVote = await dxdVotingMachine.vote(
          proposalId,
          constants.NO_OPTION,
          0,
          {
            from: accounts[1],
          }
        );

        expectEvent.notEmitted(secondVote.receipt, "VoteProposal");
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
        proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      });

      it("fail sharing invalid vote signature", async function () {
        const signerNonce = await dxdVotingMachine.signerNonce(accounts[3]);
        const voteHash = await dxdVotingMachine.hashAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          70000,
          signerNonce,
          1
        );
        const votesignature = await web3.eth.sign(voteHash, accounts[3]);
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        await expectRevert(
          dxdVotingMachine.shareSignedAction(
            proposalId,
            accounts[3],
            constants.NO_OPTION,
            70000,
            1,
            1,
            votesignature,
            { from: accounts[3] }
          ),
          "VotingMachine__WrongSigner()"
        );

        await expectRevert(
          dxdVotingMachine.shareSignedAction(
            proposalId,
            accounts[3],
            constants.YES_OPTION,
            71000,
            1,
            1,
            votesignature,
            { from: accounts[3] }
          ),
          "VotingMachine__WrongSigner()"
        );
      });

      it("Can share a vote signed by a different user", async function () {
        const signerNonce = await dxdVotingMachine.signerNonce(accounts[3]);
        const voteHashOnChain = await dxdVotingMachine.hashAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          70000,
          signerNonce,
          1
        );

        const typedData = {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            action: [
              { name: "proposalId", type: "bytes32" },
              { name: "signer", type: "address" },
              { name: "option", type: "uint256" },
              { name: "amount", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "actionType", type: "uint256" },
            ],
          },
          primaryType: "action",
          domain: {
            name: "VotingMachine",
            version: "1",
            chainId: "31337",
            verifyingContract: dxdVotingMachine.address,
          },
          message: {
            proposalId: proposalId,
            signer: accounts[3],
            option: constants.YES_OPTION,
            amount: 70000,
            nonce: signerNonce,
            actionType: 1,
          },
        };

        const voteHashOffChain =
          "0x" + Buffer.from(getMessage(typedData, true)).toString("hex");

        assert.equal(voteHashOnChain, voteHashOffChain);

        const votesignature = await web3.eth.sign(
          voteHashOffChain,
          accounts[3]
        );

        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHashOffChain, votesignature)
        );
        const voteTx = await dxdVotingMachine.shareSignedAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          70000,
          signerNonce,
          1,
          votesignature,
          { from: accounts[1] }
        );

        expectEvent(voteTx, "ActionSigned", {
          proposalId: proposalId,
          voter: accounts[3],
          option: constants.YES_OPTION,
          amount: "70000",
          nonce: signerNonce,
          signature: votesignature,
        });
      });

      it("Cannot share a vote with the incorrect signature", async function () {
        const signerNonce = await dxdVotingMachine.signerNonce(accounts[3]);
        const voteHash = await dxdVotingMachine.hashAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          70000,
          signerNonce,
          1
        );

        const votesignature = await web3.eth.sign(voteHash, accounts[1]);

        assert.equal(
          accounts[1],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        await expectRevert(
          dxdVotingMachine.shareSignedAction(
            proposalId,
            accounts[3],
            constants.YES_OPTION,
            70000,
            1,
            1,
            votesignature,
            { from: accounts[1] }
          ),
          "VotingMachine__WrongSigner()"
        );
      });

      it("fail executing vote with invalid data", async function () {
        const signerNonce = await dxdVotingMachine.signerNonce(accounts[3]);
        const voteHash = await dxdVotingMachine.hashAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          70000,
          signerNonce,
          1
        );
        const votesignature = await web3.eth.sign(voteHash, accounts[3]);
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        const shareVoteTx = await dxdVotingMachine.shareSignedAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          70000,
          signerNonce,
          1,
          votesignature,
          { from: accounts[3] }
        );
        const voteInfoFromLog = shareVoteTx.logs[0].args;

        await expectRevert(
          dxdVotingMachine.executeSignedVote(
            voteInfoFromLog.proposalId,
            voteInfoFromLog.voter,
            constants.NO_OPTION,
            voteInfoFromLog.amount,
            voteInfoFromLog.signature,
            { from: accounts[4] }
          ),
          "VotingMachine__WrongSigner()"
        );

        await expectRevert(
          dxdVotingMachine.executeSignedVote(
            voteInfoFromLog.proposalId,
            voteInfoFromLog.voter,
            voteInfoFromLog.option,
            voteInfoFromLog.amount - 1,
            voteInfoFromLog.signature,
            { from: accounts[4] }
          ),
          "VotingMachine__WrongSigner()"
        );

        await expectRevert(
          dxdVotingMachine.executeSignedVote(
            voteInfoFromLog.proposalId,
            accounts[1],
            voteInfoFromLog.option,
            voteInfoFromLog.amount,
            voteInfoFromLog.signature,
            { from: accounts[4] }
          ),
          "VotingMachine__WrongSigner()"
        );
      });

      it("positive signed decision with all rep available", async function () {
        const signerNonce = await dxdVotingMachine.signerNonce(accounts[3]);
        const voteHash = await dxdVotingMachine.hashAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          0,
          signerNonce,
          1
        );
        const votesignature = await web3.eth.sign(voteHash, accounts[3]);
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        const shareVoteTx = await dxdVotingMachine.shareSignedAction(
          proposalId,
          accounts[3],
          constants.YES_OPTION,
          0,
          signerNonce,
          1,
          votesignature,
          { from: accounts[3] }
        );
        const voteInfoFromLog = shareVoteTx.logs[0].args;
        await dxdVotingMachine.executeSignedVote(
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          voteInfoFromLog.option,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          { from: accounts[4] }
        );

        const schemeProposal = await masterAvatarScheme.getProposal(proposalId);
        assert.equal(
          schemeProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.passed
        );
      });

      it("negative signed decision with less rep than the one held", async function () {
        // The voter has 70 rep but votes with 60 rep
        const signerNonce = await dxdVotingMachine.signerNonce(accounts[3]);
        const voteHash = await dxdVotingMachine.hashAction(
          proposalId,
          accounts[3],
          constants.NO_OPTION,
          60000,
          signerNonce,
          1
        );
        const votesignature = await web3.eth.sign(voteHash, accounts[3]);
        assert.equal(
          accounts[3],
          web3.eth.accounts.recover(voteHash, votesignature)
        );

        await dxdVotingMachine.executeSignedVote(
          proposalId,
          accounts[3],
          constants.NO_OPTION,
          60000,
          votesignature,
          { from: accounts[4] }
        );

        const schemeProposal = await masterAvatarScheme.getProposal(proposalId);
        assert.equal(
          schemeProposal.state,
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
        proposalId = await helpers.getValueFromLogs(tx, "proposalId");
      });

      it("positive signal decision", async function () {
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .option,
          0
        );
        await expectRevert(
          dxdVotingMachine.signalVote(proposalId, 3, 60000, {
            from: accounts[3],
          }),
          "VotingMachine__WrongDecisionValue()"
        );
        const signalVoteTx = await dxdVotingMachine.signalVote(
          proposalId,
          constants.YES_OPTION,
          60000,
          { from: accounts[3] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .option,
          constants.YES_OPTION
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .amount,
          60000
        );

        const voteInfoFromLog = signalVoteTx.logs[0].args;
        await dxdVotingMachine.executeSignaledVote(
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          { from: accounts[4] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .option,
          0
        );
        const schemeProposal = await masterAvatarScheme.getProposal(proposalId);
        assert.equal(
          schemeProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.passed
        );
      });

      it("negative signal decision", async function () {
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .option,
          0
        );
        const signalVoteTx = await dxdVotingMachine.signalVote(
          proposalId,
          constants.NO_OPTION,
          0,
          { from: accounts[3] }
        );
        assert.equal(
          (await dxdVotingMachine.votesSignaled(proposalId, accounts[3]))
            .option,
          constants.NO_OPTION
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
            .option,
          0
        );
        const schemeProposal = await masterAvatarScheme.getProposal(proposalId);
        assert.equal(
          schemeProposal.state,
          constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
        );
      });
    });
  });

  describe("Boosted Proposals", function () {
    it("boosted proposal should succeed with enough votes", async function () {
      const tx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "proposalId");

      const stakesToBoost = await dxdVotingMachine.calculateBoostChange(
        testProposalId
      );

      const stakeTx = await dxdVotingMachine.stake(
        testProposalId,
        constants.YES_OPTION,
        stakesToBoost,
        {
          from: accounts[1],
        }
      );

      expectEvent(stakeTx.receipt, "StateChange", {
        proposalId: testProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });
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
          proposalId: testProposalId,
          proposalState:
            constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInBoost,
        }
      );

      const schemeProposal = await masterAvatarScheme.getProposal(
        testProposalId
      );
      assert.equal(
        schemeProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
      );

      assert.equal(
        schemeProposal.callData[0],
        helpers.testCallFrom(org.avatar.address)
      );
      assert.equal(schemeProposal.to[0], actionMock.address);
      assert.equal(schemeProposal.value[0], 0);
    });

    it("sign stake and boosted proposal should succeed with enough votes", async function () {
      const tx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "proposalId");

      const stakesToBoost = await dxdVotingMachine.calculateBoostChange(
        testProposalId
      );

      const signerNonce = await dxdVotingMachine.signerNonce(accounts[1]);
      const stakeHash = await dxdVotingMachine.hashAction(
        testProposalId,
        accounts[1],
        constants.YES_OPTION,
        stakesToBoost,
        signerNonce,
        2
      );
      const stakeSignature = await web3.eth.sign(stakeHash, accounts[1]);
      assert.equal(
        accounts[1],
        web3.eth.accounts.recover(stakeHash, stakeSignature)
      );

      const stakeTx = await dxdVotingMachine.executeSignedStake(
        testProposalId,
        accounts[1],
        constants.YES_OPTION,
        stakesToBoost,
        stakeSignature,
        { from: accounts[4] }
      );

      expectEvent(stakeTx.receipt, "StateChange", {
        proposalId: testProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });
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
          proposalId: testProposalId,
          proposalState:
            constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInBoost,
        }
      );
    });

    it("steal staked tokens with fake org", async function () {
      const tx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "proposalId");

      assert.equal(await stakingToken.balanceOf(dxdVotingMachine.address), "0");

      const stakeTx = await dxdVotingMachine.stake(
        testProposalId,
        constants.YES_OPTION,
        web3.utils.toWei("0.2"),
        {
          from: accounts[1],
        }
      );

      assert.equal(
        await stakingToken.balanceOf(dxdVotingMachine.address),
        web3.utils.toWei("0.2").toString()
      );

      // attack starts

      await stakingToken.transfer(accounts[9], web3.utils.toWei("1"), {
        from: accounts[1],
      });
      await stakingToken.approve(
        dxdVotingMachine.address,
        constants.MAX_UINT_256,
        { from: accounts[9] }
      );
      const fakeOrg = await helpers.deployDao({
        owner: accounts[9],
        votingMachineToken: stakingToken.address,
        repHolders: [{ address: accounts[9], amount: 10000 }],
      });
      const fakePermissionRegistry = await PermissionRegistry.new(
        accounts[9],
        1
      );
      await fakePermissionRegistry.initialize();
      const fakeOrgScheme = await WalletScheme.new();
      await fakeOrgScheme.initialize(
        fakeOrg.avatar.address,
        dxdVotingMachine.address,
        fakeOrg.controller.address,
        fakePermissionRegistry.address,
        "FakeOrg Scheme",
        5
      );
      await dxdVotingMachine.setParameters([
        5000,
        10,
        1,
        1,
        1001,
        1,
        web3.utils.toWei("0.2"),
        0,
      ]);
      const fakeParamsHash = await dxdVotingMachine.getParametersHash([
        5000,
        10,
        1,
        1,
        1001,
        1,
        web3.utils.toWei("0.2"),
        0,
      ]);
      await fakeOrg.controller.registerScheme(
        fakeOrgScheme.address,
        fakeParamsHash,
        true,
        false,
        true,
        { from: accounts[9] }
      );
      const fakeProposalId = helpers.getValueFromLogs(
        await fakeOrgScheme.proposeCalls(
          [constants.ZERO_ADDRESS],
          [constants.ZERO_DATA],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      await dxdVotingMachine.stake(
        fakeProposalId,
        constants.YES_OPTION,
        web3.utils.toWei("0.21"),
        {
          from: accounts[9],
        }
      );
      await dxdVotingMachine.vote(fakeProposalId, constants.YES_OPTION, 0, {
        from: accounts[9],
        gasPrice: constants.GAS_PRICE,
      });

      assert.equal(
        await stakingToken.balanceOf(dxdVotingMachine.address),
        web3.utils.toWei("0.41")
      );

      await dxdVotingMachine.redeem(fakeProposalId, accounts[9]);

      // If the attack succedded this should be 0
      assert.equal(
        await stakingToken.balanceOf(dxdVotingMachine.address),
        web3.utils.toWei("0.2")
      );

      // attack ends

      expectEvent(stakeTx.receipt, "StateChange", {
        proposalId: testProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });
      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });
      await time.increase(86400 + 1);
      const executeTx = await dxdVotingMachine.execute(testProposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await expectEvent.inTransaction(
        executeTx.tx,
        dxdVotingMachine.contract,
        "StateChange",
        {
          proposalId: testProposalId,
          proposalState:
            constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInBoost,
        }
      );

      const schemeProposal = await masterAvatarScheme.getProposal(
        testProposalId
      );
      assert.equal(
        schemeProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
      );

      assert.equal(
        schemeProposal.callData[0],
        helpers.testCallFrom(org.avatar.address)
      );
      assert.equal(schemeProposal.to[0], actionMock.address);
      assert.equal(schemeProposal.value[0], 0);

      await dxdVotingMachine.redeem(testProposalId, accounts[9]);
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
      const testProposalId = await helpers.getValueFromLogs(tx, "proposalId");
      const stakesToBoost = await dxdVotingMachine.calculateBoostChange(
        testProposalId
      );

      const stakeTx = await dxdVotingMachine.stake(
        testProposalId,
        constants.YES_OPTION,
        stakesToBoost,
        {
          from: accounts[1],
        }
      );

      expectEvent(stakeTx.receipt, "StateChange", {
        proposalId: testProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 1, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await time.increase(86400 + 1);

      const executeTx = await dxdVotingMachine.execute(testProposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await expectEvent.inTransaction(
        executeTx.tx,
        dxdVotingMachine.contract,
        "StateChange",
        {
          proposalId: testProposalId,
          proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.Expired,
        }
      );

      const schemeProposal = await masterAvatarScheme.getProposal(
        testProposalId
      );
      assert.equal(
        schemeProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
      );

      assert.equal(
        schemeProposal.callData[0],
        helpers.testCallFrom(org.avatar.address)
      );
      assert.equal(schemeProposal.to[0], actionMock.address);
      assert.equal(schemeProposal.value[0], 0);
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
        "proposalId"
      );

      const stakesToBoost = await dxdVotingMachine.calculateBoostChange(
        proposalId
      );

      const upStake = await dxdVotingMachine.stake(
        proposalId,
        constants.YES_OPTION,
        stakesToBoost,
        {
          from: accounts[1],
        }
      );

      const totalStaked = (await dxdVotingMachine.proposals(proposalId))
        .totalStakes;

      assert(totalStaked.eq(stakesToBoost));

      // check preBoosted
      expectEvent(upStake.receipt, "StateChange", {
        proposalId: proposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      // vote enough times to pass the execution bar threshold
      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[0],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[3],
        gasPrice: constants.GAS_PRICE,
      });

      // check executed
      assert.equal((await dxdVotingMachine.proposals(proposalId)).state, "2");

      const proposalState = (await masterAvatarScheme.getProposal(proposalId))
        .state;

      assert.equal(
        proposalState,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
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
        "proposalId"
      );

      const stakesToBoost = await dxdVotingMachine.calculateBoostChange(
        proposalId
      );

      const upStake = await dxdVotingMachine.stake(
        proposalId,
        constants.YES_OPTION,
        stakesToBoost,
        {
          from: accounts[1],
        }
      );

      const totalStaked = (await dxdVotingMachine.proposals(proposalId))
        .totalStakes;

      assert(totalStaked.eq(stakesToBoost));

      // check preBoosted
      expectEvent(upStake.receipt, "StateChange", {
        proposalId: proposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // check boosted
      assert.equal(
        (await dxdVotingMachine.proposals(proposalId)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );

      // vote enough times to pass the execution bar threshold
      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[3],
        gasPrice: constants.GAS_PRICE,
      });

      // check executed
      assert.equal(
        (await dxdVotingMachine.proposals(proposalId)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInQueue
      );
      const proposalState = (await masterAvatarScheme.getProposal(proposalId))
        .state;

      assert.equal(
        proposalState,
        constants.WALLET_SCHEME_PROPOSAL_STATES.passed
      );
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
        "proposalId"
      );
    });

    it("should execute a proposal but fail to stake", async function () {
      const stakesToBoost = await dxdVotingMachine.calculateBoostChange(
        stakeProposalId
      );

      const stake = await dxdVotingMachine.stake(
        stakeProposalId,
        constants.YES_OPTION,
        stakesToBoost,
        {
          from: accounts[1],
        }
      );

      expectEvent(stake.receipt, "StateChange", {
        proposalId: stakeProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.vote(stakeProposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      // check Boosted
      assert.equal(
        (await dxdVotingMachine.proposals(stakeProposalId)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );

      await time.increase(helpers.defaultParameters.boostedVotePeriodLimit + 1);

      const executeStake = await dxdVotingMachine.stake(
        stakeProposalId,
        constants.YES_OPTION,
        1,
        {
          from: accounts[1],
        }
      );

      expectEvent(executeStake.receipt, "StateChange", {
        proposalId: stakeProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInBoost,
      });

      expectEvent.notEmitted(executeStake.receipt, "Stake");
    });
    it("address cannot upstake and downstake on same proposal", async function () {
      const upStake = await dxdVotingMachine.stake(
        stakeProposalId,
        constants.YES_OPTION,
        100,
        {
          from: accounts[1],
        }
      );

      expectEvent(upStake.receipt, "Stake", {
        proposalId: stakeProposalId,
        avatar: org.avatar.address,
        staker: accounts[1],
        option: constants.YES_OPTION.toString(),
        amount: "100",
      });

      const downStake = await dxdVotingMachine.stake(
        stakeProposalId,
        constants.NO_OPTION,
        100,
        {
          from: accounts[1],
        }
      );

      expectEvent.notEmitted(downStake.receipt, "Stake");
    });
  });

  describe("Redeems", function () {
    it("1 full stake on YES with 1 boosted proposal", async function () {
      const tx = await masterAvatarScheme.proposeCalls(
        [actionMock.address],
        [helpers.testCallFrom(org.avatar.address)],
        [0],
        2,
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "proposalId");
      const testProposal = await dxdVotingMachine.proposals(testProposalId);

      const signerNonce = await dxdVotingMachine.signerNonce(accounts[1]);
      const stakeHash = await dxdVotingMachine.hashAction(
        testProposalId,
        accounts[1],
        constants.YES_OPTION,
        web3.utils.toWei("0.100000000001"),
        signerNonce,
        2
      );
      const stakeSignature = await web3.eth.sign(stakeHash, accounts[1]);
      assert.equal(
        accounts[1],
        web3.eth.accounts.recover(stakeHash, stakeSignature)
      );

      const stakeTx = await dxdVotingMachine.executeSignedStake(
        testProposalId,
        accounts[1],
        constants.YES_OPTION,
        web3.utils.toWei("0.100000000001"),
        stakeSignature,
        { from: accounts[4] }
      );

      expectEvent(stakeTx.receipt, "StateChange", {
        proposalId: testProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted,
      });

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      const voteTx = await dxdVotingMachine.vote(
        testProposalId,
        constants.YES_OPTION,
        0,
        {
          from: accounts[2],
          gasPrice: constants.GAS_PRICE,
        }
      );

      expectEvent(voteTx.receipt, "StateChange", {
        proposalId: testProposalId,
        proposalState: constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted,
      });

      await time.increase(helpers.defaultParameters.boostedVotePeriodLimit + 1);

      const executeTx = await dxdVotingMachine.execute(testProposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await expectEvent.inTransaction(
        executeTx.tx,
        dxdVotingMachine.contract,
        "StateChange",
        {
          proposalId: testProposalId,
          proposalState:
            constants.VOTING_MACHINE_PROPOSAL_STATES.ExecutedInBoost,
        }
      );

      const redeemTx = await dxdVotingMachine.redeem(
        testProposalId,
        accounts[1]
      );

      await expectEvent.inTransaction(
        redeemTx.tx,
        stakingToken.contract,
        "Transfer",
        {
          from: org.avatar.address,
          to: accounts[1],
          value: web3.utils.toWei("0.1"),
        }
      );
      await expectEvent.inTransaction(
        redeemTx.tx,
        stakingToken.contract,
        "Transfer",
        {
          from: dxdVotingMachine.address,
          to: accounts[1],
          value: web3.utils.toWei("0.100000000001"),
        }
      );
    });

    it("Stake on multiple proposals in a row and check threshold increase", async function () {
      const testProposalId1 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const testProposalId2 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const testProposalId3 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const testProposalId4 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const testProposalId5 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const schemeId = (await dxdVotingMachine.proposals(testProposalId1))
        .schemeId;
      const paramsHash = (await dxdVotingMachine.proposals(testProposalId1))
        .paramsHash;
      const schemeParameters = await dxdVotingMachine.parameters(paramsHash);
      const threshold0BoostedProposal =
        await dxdVotingMachine.getSchemeThreshold(paramsHash, schemeId);
      const stakesToBoostFirstProposal =
        await dxdVotingMachine.multiplyRealMath(
          threshold0BoostedProposal,
          schemeParameters.daoBounty
        );

      // Stakes just what it needs to get to the boost threshold
      await dxdVotingMachine.stake(
        testProposalId1,
        constants.YES_OPTION,
        stakesToBoostFirstProposal,
        { from: accounts[1] }
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId1)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Queued
      );
      assert(
        (await dxdVotingMachine.score(testProposalId1)).eq(
          threshold0BoostedProposal
        )
      );

      // Stakes 100000 WEI more of what it needs to stake to boost to get a minimum advantage over the score
      await dxdVotingMachine.stake(
        testProposalId1,
        constants.YES_OPTION,
        "100000",
        { from: accounts[1] }
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId1)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );
      assert(
        (await dxdVotingMachine.score(testProposalId1)).gt(
          threshold0BoostedProposal
        )
      );

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.execute(testProposalId1);
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId1)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );

      const threshold1BoostedProposal =
        await dxdVotingMachine.calculateThreshold(
          schemeParameters.thresholdConst,
          schemeParameters.limitExponentValue,
          1
        );
      const stakesToBoostSecondProposal =
        await dxdVotingMachine.calculateBoostChange(testProposalId2);

      // Stakes more than the threshold directly to boost second proposal
      await dxdVotingMachine.stake(
        testProposalId2,
        constants.YES_OPTION,
        stakesToBoostSecondProposal,
        { from: accounts[1] }
      );
      assert(
        (await dxdVotingMachine.score(testProposalId2)).gt(
          threshold1BoostedProposal
        )
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId2)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.execute(testProposalId2);
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId2)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );

      // Stake on a third proposal to put it on preBoost state
      const stakesToBoostThirdProposal =
        await dxdVotingMachine.calculateBoostChange(testProposalId3);
      await dxdVotingMachine.stake(
        testProposalId3,
        constants.YES_OPTION,
        stakesToBoostThirdProposal,
        { from: accounts[1] }
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId3)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );

      // Boost the fourth proposal with 2 bootes and 1 preBoosted using the calculation from the VM
      const stakesToBoostFourthProposal =
        await dxdVotingMachine.calculateBoostChange(testProposalId4);
      await dxdVotingMachine.stake(
        testProposalId4,
        constants.YES_OPTION,
        stakesToBoostFourthProposal,
        { from: accounts[1] }
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId4)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );

      // Execute third and fourth proposal and boost both of them
      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );
      await dxdVotingMachine.execute(testProposalId3);
      await dxdVotingMachine.execute(testProposalId4);
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId3)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId4)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );
    });

    it("Stake/downstake on multiple proposals in a row and check threshold increase", async function () {
      const testProposalId1 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const testProposalId2 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );
      const testProposalId3 = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );

      const paramsHash = (await dxdVotingMachine.proposals(testProposalId1))
        .paramsHash;
      const schemeParameters = await dxdVotingMachine.parameters(paramsHash);

      // Do a big initial downstake of 10 staking tokens in NO
      await dxdVotingMachine.stake(
        testProposalId1,
        constants.NO_OPTION,
        web3.utils.toWei("10"),
        { from: accounts[2] }
      );

      const stakesToBoostFirstProposal =
        await dxdVotingMachine.calculateBoostChange(testProposalId1);

      // Stakes just what it needs to get to the boost threshold
      await dxdVotingMachine.stake(
        testProposalId1,
        constants.YES_OPTION,
        stakesToBoostFirstProposal,
        { from: accounts[1] }
      );

      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId1)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.execute(testProposalId1);
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId1)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );

      const threshold1BoostedProposal =
        await dxdVotingMachine.calculateThreshold(
          schemeParameters.thresholdConst,
          schemeParameters.limitExponentValue,
          1
        );

      // Stakes the double of tokens needed to boost
      const stakesToBoostSecondProposal =
        await dxdVotingMachine.calculateBoostChange(testProposalId2);
      await dxdVotingMachine.stake(
        testProposalId2,
        constants.YES_OPTION,
        stakesToBoostSecondProposal,
        { from: accounts[1] }
      );
      assert(
        (await dxdVotingMachine.score(testProposalId2)).gt(
          threshold1BoostedProposal
        )
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId2)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );

      // Downstake on the proposal to get it back to queue
      const stakesToUnBoostSecondProposal = (
        await dxdVotingMachine.getProposalStatus(testProposalId2)
      ).totalStakesYes.sub(
        (await dxdVotingMachine.getProposalStatus(testProposalId2))
          .totalStakesNo
      );
      await dxdVotingMachine.stake(
        testProposalId2,
        constants.NO_OPTION,
        stakesToUnBoostSecondProposal,
        { from: accounts[2] }
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId2)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Queued
      );

      // Stakes on the proposal again
      const stakesToBoostSecondProposalAgain =
        await dxdVotingMachine.calculateBoostChange(testProposalId2);
      await dxdVotingMachine.stake(
        testProposalId2,
        constants.YES_OPTION,
        stakesToBoostSecondProposalAgain,
        { from: accounts[1] }
      );
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId2)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.PreBoosted
      );

      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );

      await dxdVotingMachine.execute(testProposalId2);
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId2)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );

      const stakesToBoostThirdProposal =
        await dxdVotingMachine.calculateBoostChange(testProposalId3);

      await dxdVotingMachine.stake(
        testProposalId3,
        constants.YES_OPTION,
        stakesToBoostThirdProposal,
        { from: accounts[1] }
      );
      await time.increase(
        helpers.defaultParameters.preBoostedVotePeriodLimit + 1
      );
      await dxdVotingMachine.execute(testProposalId3);
      assert.equal(
        (await dxdVotingMachine.proposals(testProposalId3)).state,
        constants.VOTING_MACHINE_PROPOSAL_STATES.Boosted
      );
    });
  });

  describe("Getters", function () {
    it("should return vote info", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
      });

      const voteInfo = await dxdVotingMachine.getVoter(proposalId, accounts[1]);
      assert.equal(constants.YES_OPTION, Number(voteInfo[0]));
      assert.equal(10000, Number(voteInfo[1]));
    });

    it("should return true if the proposal is votable", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );

      const isVotable = await dxdVotingMachine.isVotable(proposalId);
      assert.equal(true, isVotable);
    });

    it("should return false if the proposal is not votable", async function () {
      const proposalId = await helpers.getValueFromLogs(
        await masterAvatarScheme.proposeCalls(
          [actionMock.address],
          [helpers.testCallFrom(org.avatar.address)],
          [0],
          2,
          constants.TEST_TITLE,
          constants.SOME_HASH
        ),
        "proposalId"
      );

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
      });

      await time.increase(86400 + 1);

      await dxdVotingMachine.vote(proposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
      });

      const isVotable = await dxdVotingMachine.isVotable(proposalId);
      assert.equal(false, isVotable);
    });

    it("Should return active proposals", async () => {
      const proposalsAmount = 50;
      const proposalIds = await createSchemeProposals(proposalsAmount);
      const activeProposals = await dxdVotingMachine.getActiveProposals(
        0,
        0,
        org.avatar.address
      );
      range(proposalsAmount).forEach(index => {
        assert.equal(activeProposals[index], proposalIds[index]);
      });
      assert.equal(
        await dxdVotingMachine.getActiveProposalsCount(org.avatar.address),
        proposalsAmount
      );
    });

    it("Should return inactive proposals", async () => {
      const proposalsAmount = 2;
      const inactiveAmount = 2;
      const [testProposalId] = await createSchemeProposals(proposalsAmount);

      await dxdVotingMachine.stake(testProposalId, constants.YES_OPTION, 1000, {
        from: accounts[1],
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[2],
        gasPrice: constants.GAS_PRICE,
      });

      await dxdVotingMachine.vote(testProposalId, constants.YES_OPTION, 0, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      await time.increase(86400 + 1);

      await dxdVotingMachine.execute(testProposalId, {
        from: accounts[1],
        gasPrice: constants.GAS_PRICE,
      });

      const inactiveProposals = await dxdVotingMachine.getInactiveProposals(
        0,
        0,
        org.avatar.address
      );

      assert.equal(inactiveProposals[1], testProposalId);
      assert.equal(
        await dxdVotingMachine.getInactiveProposalsCount(org.avatar.address),
        inactiveAmount
      );
    });
  });
});
