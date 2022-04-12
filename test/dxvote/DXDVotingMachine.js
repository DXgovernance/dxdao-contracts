import * as helpers from "../helpers";
const { fixSignature } = require("../helpers/sign");

const {
  BN,
  time,
  expectEvent,
  expectRevert,
  balance,
} = require("@openzeppelin/test-helpers");

const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");

contract("DXDVotingMachine", function (accounts) {
  let permissionRegistry,
    expensiveVoteWalletScheme,
    cheapVoteWalletScheme,
    org,
    actionMock,
    genVotingMachine,
    dxdVotingMachine,
    proposalId;

  const constants = helpers.constants;
  const VOTE_GAS = 360000;
  const TOTAL_GAS_REFUND = VOTE_GAS * constants.GAS_PRICE;

  function testCallFrom(address) {
    return new web3.eth.Contract(ActionMock.abi).methods
      .test(address, 1)
      .encodeABI();
  }

  beforeEach(async function () {
    actionMock = await ActionMock.new();
    const standardTokenMock = await ERC20Mock.new(accounts[1], 1000);
    org = await helpers.setupOrganization(
      [accounts[0], accounts[1], accounts[2], accounts[3]],
      [0, 0, 0, 0],
      [10000, 10000, 10000, 70000]
    );

    genVotingMachine = await helpers.setUpVotingMachine(
      standardTokenMock.address,
      "gen",
      constants.NULL_ADDRESS
    );
    await standardTokenMock.approve(genVotingMachine.contract.address, 1000, {
      from: accounts[1],
    });

    dxdVotingMachine = await helpers.setUpVotingMachine(
      standardTokenMock.address,
      "dxd",
      constants.NULL_ADDRESS
    );
    await standardTokenMock.approve(dxdVotingMachine.contract.address, 1000, {
      from: accounts[1],
    });

    permissionRegistry = await PermissionRegistry.new(accounts[0], 10);
    await permissionRegistry.initialize();

    await permissionRegistry.setPermission(
      constants.NULL_ADDRESS,
      org.avatar.address,
      constants.ANY_ADDRESS,
      constants.ANY_FUNC_SIGNATURE,
      constants.MAX_UINT_256,
      true
    );

    await time.increase(10);

    expensiveVoteWalletScheme = await WalletScheme.new();
    await expensiveVoteWalletScheme.initialize(
      org.avatar.address,
      genVotingMachine.address,
      true,
      org.controller.address,
      permissionRegistry.address,
      "Expensive Scheme",
      172800,
      5
    );

    cheapVoteWalletScheme = await WalletScheme.new();
    await cheapVoteWalletScheme.initialize(
      org.avatar.address,
      dxdVotingMachine.address,
      true,
      org.controller.address,
      permissionRegistry.address,
      "Cheap Scheme",
      172800,
      5
    );

    await org.daoCreator.setSchemes(
      org.avatar.address,
      [expensiveVoteWalletScheme.address, cheapVoteWalletScheme.address],
      [genVotingMachine.params, dxdVotingMachine.params],
      [
        helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true,
        }),
        helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true,
        }),
      ],
      "metaData"
    );
  });

  describe("Payable Votes", function () {
    let setRefundConfProposalId;
    beforeEach(async function () {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: web3.utils.toWei("1"),
      });
      const setRefundConfData = new web3.eth.Contract(
        DXDVotingMachine.abi
      ).methods
        .setOrganizationRefund(VOTE_GAS, constants.GAS_PRICE)
        .encodeABI();
      const setRefundConfTx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [
          helpers.encodeGenericCallData(
            org.avatar.address,
            dxdVotingMachine.address,
            setRefundConfData,
            0
          ),
        ],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      setRefundConfProposalId = await helpers.getValueFromLogs(
        setRefundConfTx,
        "_proposalId"
      );
      const organizationId = (
        await dxdVotingMachine.contract.proposals(setRefundConfProposalId)
      ).organizationId;
      assert.equal(
        await dxdVotingMachine.contract.organizations(organizationId),
        org.avatar.address
      );
      await dxdVotingMachine.contract.vote(
        setRefundConfProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );
      const organizationRefundConf =
        await dxdVotingMachine.contract.organizationRefunds(org.avatar.address);
      assert.equal(0, organizationRefundConf.balance);
      assert.equal(VOTE_GAS, organizationRefundConf.voteGas);
      assert.equal(constants.GAS_PRICE, organizationRefundConf.maxGasPrice);
    });

    it("gas spent in PayableGenesisProtocol vote is less than GenesisProtocol vote", async function () {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: web3.utils.toWei("1"),
      });
      const fundVotingMachineTx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [
          helpers.encodeGenericCallData(
            org.avatar.address,
            dxdVotingMachine.address,
            "0x0",
            web3.utils.toWei("1")
          ),
        ],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const fundVotingMachineProposalId = await helpers.getValueFromLogs(
        fundVotingMachineTx,
        "_proposalId"
      );

      await dxdVotingMachine.contract.vote(
        fundVotingMachineProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        testCallFrom(org.avatar.address),
        0
      );

      let tx = await expensiveVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const expensiveProposalId = await helpers.getValueFromLogs(
        tx,
        "_proposalId"
      );
      let balanceBeforeVote = new BN(await web3.eth.getBalance(accounts[3]));
      tx = await genVotingMachine.contract.vote(
        expensiveProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3], gasPrice: constants.GAS_PRICE }
      );
      let balanceAfterVote = new BN(await web3.eth.getBalance(accounts[3]));
      const gastVoteWithoutRefund = parseInt(
        balanceBeforeVote
          .sub(balanceAfterVote)
          .div(new BN(constants.GAS_PRICE))
          .toString()
      );
      expect(tx.receipt.gasUsed).to.be.closeTo(gastVoteWithoutRefund, 1);

      let organizationProposal =
        await expensiveVoteWalletScheme.getOrganizationProposal(
          expensiveProposalId
        );
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);

      // Vote with refund configured
      tx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const cheapProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      balanceBeforeVote = new BN(await web3.eth.getBalance(accounts[3]));
      tx = await dxdVotingMachine.contract.vote(
        cheapProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3], gasPrice: constants.GAS_PRICE }
      );
      balanceAfterVote = new BN(await web3.eth.getBalance(accounts[3]));
      const gasVoteWithRefund = parseInt(
        balanceBeforeVote
          .sub(balanceAfterVote)
          .div(new BN(constants.GAS_PRICE))
          .toString()
      );

      // Gas was taken from the organization refund balance and used to pay most of vote gas cost on two votes,
      // the vote approving the funding of the dxd voting machine and the one approving the other proposal
      assert.equal(
        web3.utils.toWei("1") - TOTAL_GAS_REFUND * 2,
        (
          await dxdVotingMachine.contract.organizationRefunds(
            org.avatar.address
          )
        ).balance
      );
      expect(tx.receipt.gasUsed - VOTE_GAS).to.be.closeTo(gasVoteWithRefund, 1);

      organizationProposal =
        await cheapVoteWalletScheme.getOrganizationProposal(cheapProposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    it("pay for gasRefund from voting machine only when gasRefund balance is enough", async function () {
      // Send enough eth just for two votes
      const votesRefund = TOTAL_GAS_REFUND * 3;
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: votesRefund.toString(),
      });
      const fundVotingMachineTx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [
          helpers.encodeGenericCallData(
            org.avatar.address,
            dxdVotingMachine.address,
            "0x0",
            votesRefund.toString()
          ),
        ],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const fundVotingMachineProposalId = await helpers.getValueFromLogs(
        fundVotingMachineTx,
        "_proposalId"
      );
      await dxdVotingMachine.contract.vote(
        fundVotingMachineProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3], gasPrice: constants.GAS_PRICE }
      );

      // Vote three times and pay only the first two
      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        testCallFrom(org.avatar.address),
        0
      );
      let tx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      let proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      assert.equal(
        TOTAL_GAS_REFUND * 2,
        Number(
          (
            await dxdVotingMachine.contract.organizationRefunds(
              org.avatar.address
            )
          ).balance
        )
      );
      // Vote with higher gas than maxGasPrice and dont spend more than one vote refund
      await dxdVotingMachine.contract.vote(
        proposalId,
        2,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[1], gasPrice: constants.GAS_PRICE * 2 }
      );

      assert.equal(
        TOTAL_GAS_REFUND,
        Number(
          (
            await dxdVotingMachine.contract.organizationRefunds(
              org.avatar.address
            )
          ).balance
        )
      );
      await dxdVotingMachine.contract.vote(
        proposalId,
        2,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gasPrice: constants.GAS_PRICE }
      );

      assert.equal(
        0,
        Number(
          (
            await dxdVotingMachine.contract.organizationRefunds(
              org.avatar.address
            )
          ).balance
        )
      );
      const balanceBeforeVote = new BN(await web3.eth.getBalance(accounts[3]));
      tx = await dxdVotingMachine.contract.vote(
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
        await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    describe("VoteOnBehalf", function () {
      let genericProposalId;
      beforeEach(async function () {
        const defaultParamaters = [
          "50",
          "172800",
          "86400",
          "3600",
          "2000",
          "0",
          "60",
          "10",
          "15",
          "10",
          "0",
        ];

        await dxdVotingMachine.contract.setParameters(
          defaultParamaters,
          accounts[3]
        );

        const parameterHash = await dxdVotingMachine.contract.getParametersHash(
          defaultParamaters,
          accounts[3]
        );

        const tempWalletScheme = await WalletScheme.new();
        await tempWalletScheme.initialize(
          org.avatar.address,
          dxdVotingMachine.address,
          true,
          org.controller.address,
          permissionRegistry.address,
          "Temp Scheme",
          172800,
          5
        );

        await permissionRegistry.setPermission(
          constants.NULL_ADDRESS,
          tempWalletScheme.address,
          constants.ANY_ADDRESS,
          constants.ANY_FUNC_SIGNATURE,
          constants.MAX_UINT_256,
          true
        );

        const registerSchemeData = await org.controller.contract.methods
          .registerScheme(
            tempWalletScheme.address,
            parameterHash,
            helpers.encodePermission({
              canGenericCall: true,
              canUpgrade: true,
              canChangeConstraints: true,
              canRegisterSchemes: true,
            }),
            org.avatar.address
          )
          .encodeABI();

        const registerProposalId = await helpers.getValueFromLogs(
          await cheapVoteWalletScheme.proposeCalls(
            [org.controller.address],
            [registerSchemeData],
            [0],
            constants.TEST_TITLE,
            constants.SOME_HASH
          ),
          "_proposalId"
        );

        assert.equal(
          (
            await cheapVoteWalletScheme.getOrganizationProposal(
              registerProposalId
            )
          ).state,
          constants.WalletSchemeProposalState.submitted
        );

        await dxdVotingMachine.contract.vote(
          registerProposalId,
          1,
          0,
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        );

        assert.equal(
          (
            await cheapVoteWalletScheme.getOrganizationProposal(
              registerProposalId
            )
          ).state,
          constants.WalletSchemeProposalState.executionSuccedd
        );

        assert.equal(
          await org.controller.getSchemeParameters(
            tempWalletScheme.address,
            org.avatar.address
          ),
          parameterHash
        );

        const callData = helpers.testCallFrom(tempWalletScheme.address);

        genericProposalId = await helpers.getValueFromLogs(
          await tempWalletScheme.proposeCalls(
            [actionMock.address],
            [callData],
            [0],
            constants.TEST_TITLE,
            constants.SOME_HASH
          ),
          "_proposalId"
        );
      });

      it("Fails if address is not allowed to vote on behalf", async function () {
        const proposalParamsHash = (
          await dxdVotingMachine.contract.proposals(genericProposalId)
        ).paramsHash;

        const params = await dxdVotingMachine.contract.parameters(
          proposalParamsHash
        );

        assert.equal(params.voteOnBehalf, accounts[3]);

        await expectRevert(
          dxdVotingMachine.contract.vote(genericProposalId, 1, 0, accounts[2], {
            from: accounts[1],
          }),
          "address not allowed to vote on behalf"
        );
      });
      it("Succeeds if allowed address is able to vote on behalf", async function () {
        const tx = await dxdVotingMachine.contract.vote(
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
    });

    it("Can view rep of votes and amount staked on proposal", async function () {
      const statusInfo =
        await dxdVotingMachine.contract.proposalStatusWithVotes(
          setRefundConfProposalId
        );

      expect(statusInfo["0"].toNumber()).to.equal(70000);
      expect(statusInfo["1"].toNumber()).to.equal(0);
      expect(statusInfo["2"].toNumber()).to.equal(70000);
      expect(statusInfo["3"].toNumber()).to.equal(0);
      expect(statusInfo["4"].toNumber()).to.equal(0);
      expect(statusInfo["5"].toNumber()).to.equal(15);
    });
  });

  describe("Signed Votes", function () {
    beforeEach(async function () {
      const wallet = await Wallet.new();
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: constants.TEST_VALUE,
      });
      await wallet.transferOwnership(org.avatar.address);

      const genericCallDataTransfer = helpers.encodeGenericCallData(
        org.avatar.address,
        wallet.address,
        "0x0",
        constants.TEST_VALUE
      );
      const payCallData = await new web3.eth.Contract(wallet.abi).methods
        .pay(accounts[1])
        .encodeABI();
      const genericCallDataPay = helpers.encodeGenericCallData(
        org.avatar.address,
        wallet.address,
        payCallData,
        0
      );
      const callDataMintRep = await org.controller.contract.methods
        .mintReputation(constants.TEST_VALUE, accounts[4], org.avatar.address)
        .encodeABI();

      const tx = await cheapVoteWalletScheme.proposeCalls(
        [
          org.controller.address,
          org.controller.address,
          org.controller.address,
        ],
        [genericCallDataTransfer, genericCallDataPay, callDataMintRep],
        [0, 0, 0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    });

    it("fail sharing invalid vote signature", async function () {
      const voteHash = await dxdVotingMachine.contract.hashVote(
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

      try {
        await dxdVotingMachine.contract.shareSignedVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          2,
          70000,
          votesignature,
          { from: accounts[3] }
        );
        assert(
          false,
          "cannot share invalid vote signature with different vote"
        );
      } catch (error) {
        helpers.assertVMException(error);
      }

      try {
        await dxdVotingMachine.contract.shareSignedVote(
          dxdVotingMachine.address,
          proposalId,
          accounts[3],
          1,
          71000,
          votesignature,
          { from: accounts[3] }
        );
        assert(false, "cannot share invalid vote signature with higher REP");
      } catch (error) {
        helpers.assertVMException(error);
      }
    });
    it("Can share a vote signed by a different user", async function () {
      const voteHash = await dxdVotingMachine.contract.hashVote(
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

      const voteTx = await dxdVotingMachine.contract.shareSignedVote(
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
      const voteHash = await dxdVotingMachine.contract.hashVote(
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
        dxdVotingMachine.contract.shareSignedVote(
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
      const voteHash = await dxdVotingMachine.contract.hashVote(
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

      const shareVoteTx = await dxdVotingMachine.contract.shareSignedVote(
        dxdVotingMachine.address,
        proposalId,
        accounts[3],
        1,
        70000,
        votesignature,
        { from: accounts[3] }
      );
      const voteInfoFromLog = shareVoteTx.logs[0].args;

      try {
        await dxdVotingMachine.contract.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          2,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          { from: accounts[4] }
        );
        assert(false, "cannot execute vote signature with different vote");
      } catch (error) {
        helpers.assertVMException(error);
      }

      try {
        await dxdVotingMachine.contract.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          voteInfoFromLog.voteDecision,
          voteInfoFromLog.amount - 1,
          voteInfoFromLog.signature,
          { from: accounts[4] }
        );
        assert(false, "cannot execute vote signature with less REP");
      } catch (error) {
        helpers.assertVMException(error);
      }

      try {
        await dxdVotingMachine.contract.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          accounts[1],
          voteInfoFromLog.voteDecision,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          { from: accounts[4] }
        );
        assert(false, "cannot execute vote signature form other address");
      } catch (error) {
        helpers.assertVMException(error);
      }
    });

    it("positive signed decision with all rep available", async function () {
      const voteHash = await dxdVotingMachine.contract.hashVote(
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

      const shareVoteTx = await dxdVotingMachine.contract.shareSignedVote(
        dxdVotingMachine.address,
        proposalId,
        accounts[3],
        1,
        0,
        votesignature,
        { from: accounts[3] }
      );
      const voteInfoFromLog = shareVoteTx.logs[0].args;
      await dxdVotingMachine.contract.executeSignedVote(
        voteInfoFromLog.votingMachine,
        voteInfoFromLog.proposalId,
        voteInfoFromLog.voter,
        voteInfoFromLog.voteDecision,
        voteInfoFromLog.amount,
        voteInfoFromLog.signature,
        { from: accounts[4] }
      );

      const organizationProposal =
        await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });

    it("negative signed decision with less rep than the one held", async function () {
      // The voter has 70 rep but votes with 60 rep
      const voteHash = await dxdVotingMachine.contract.hashVote(
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

      const shareVoteTx = await dxdVotingMachine.contract.shareSignedVote(
        dxdVotingMachine.address,
        proposalId,
        accounts[3],
        2,
        60000,
        votesignature,
        { from: accounts[3] }
      );
      const voteInfoFromLog = shareVoteTx.logs[0].args;

      await dxdVotingMachine.contract.executeSignedVote(
        voteInfoFromLog.votingMachine,
        voteInfoFromLog.proposalId,
        voteInfoFromLog.voter,
        voteInfoFromLog.voteDecision,
        voteInfoFromLog.amount,
        voteInfoFromLog.signature,
        { from: accounts[4] }
      );

      const organizationProposal =
        await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
      );
    });
  });

  describe("Signal Votes", function () {
    beforeEach(async function () {
      const wallet = await Wallet.new();
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: constants.TEST_VALUE,
      });
      await wallet.transferOwnership(org.avatar.address);

      const genericCallDataTransfer = helpers.encodeGenericCallData(
        org.avatar.address,
        wallet.address,
        "0x0",
        constants.TEST_VALUE
      );

      const tx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallDataTransfer],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    });

    it("positive signal decision", async function () {
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .voteDecision,
        0
      );
      await expectRevert(
        dxdVotingMachine.contract.signalVote(proposalId, 3, 60000, {
          from: accounts[3],
        }),
        "wrong decision value"
      );
      const signalVoteTx = await dxdVotingMachine.contract.signalVote(
        proposalId,
        1,
        60000,
        { from: accounts[3] }
      );
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .voteDecision,
        1
      );
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .amount,
        60000
      );
      expect(signalVoteTx.receipt.gasUsed).to.be.closeTo(50000, 25000);
      const voteInfoFromLog = signalVoteTx.logs[0].args;
      await dxdVotingMachine.contract.executeSignaledVote(
        voteInfoFromLog.proposalId,
        voteInfoFromLog.voter,
        { from: accounts[4] }
      );
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .voteDecision,
        0
      );
      const organizationProposal =
        await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
    });

    it("negative signal decision", async function () {
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .voteDecision,
        0
      );
      const signalVoteTx = await dxdVotingMachine.contract.signalVote(
        proposalId,
        2,
        0,
        { from: accounts[3] }
      );
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .voteDecision,
        2
      );
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .amount,
        0
      );
      expect(signalVoteTx.receipt.gasUsed).to.be.closeTo(50000, 25000);

      const voteInfoFromLog = signalVoteTx.logs[0].args;
      await dxdVotingMachine.contract.executeSignaledVote(
        voteInfoFromLog.proposalId,
        voteInfoFromLog.voter,
        { from: accounts[4] }
      );
      assert.equal(
        (await dxdVotingMachine.contract.votesSignaled(proposalId, accounts[3]))
          .voteDecision,
        0
      );
      const organizationProposal =
        await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
      );
    });
  });

  describe("Required % of votes in boosted proposals", function () {
    beforeEach(async function () {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: org.avatar.address,
        value: web3.utils.toWei("1"),
      });
      const setBoostedVoteRequiredPercentageData = new web3.eth.Contract(
        DXDVotingMachine.abi
      ).methods
        .setBoostedVoteRequiredPercentage(
          cheapVoteWalletScheme.address,
          dxdVotingMachine.params,
          1950
        )
        .encodeABI();
      const setBoostedVoteRequiredPercentageTx =
        await cheapVoteWalletScheme.proposeCalls(
          [org.controller.address],
          [
            helpers.encodeGenericCallData(
              org.avatar.address,
              dxdVotingMachine.address,
              setBoostedVoteRequiredPercentageData,
              0
            ),
          ],
          [0],
          constants.TEST_TITLE,
          constants.SOME_HASH
        );
      const setBoostedVoteRequiredPercentageProposalId =
        await helpers.getValueFromLogs(
          setBoostedVoteRequiredPercentageTx,
          "_proposalId"
        );
      const organizationId = (
        await dxdVotingMachine.contract.proposals(
          setBoostedVoteRequiredPercentageProposalId
        )
      ).organizationId;
      assert.equal(
        await dxdVotingMachine.contract.organizations(organizationId),
        org.avatar.address
      );
      await dxdVotingMachine.contract.vote(
        setBoostedVoteRequiredPercentageProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );

      assert.equal(
        1950,
        await dxdVotingMachine.contract.getBoostedVoteRequiredPercentage(
          org.avatar.address,
          cheapVoteWalletScheme.address,
          dxdVotingMachine.params
        )
      );
    });

    it("boosted proposal succed with enough votes", async function () {
      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        testCallFrom(org.avatar.address),
        0
      );
      const tx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const stakeTx = await dxdVotingMachine.contract.stake(
        testProposalId,
        1,
        1000,
        { from: accounts[1] }
      );

      expectEvent(stakeTx.receipt, "StateChange", {
        _proposalId: testProposalId,
        _proposalState: "4",
      });
      await time.increase(3600 + 1);
      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gasPrice: constants.GAS_PRICE }
      );
      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[1], gasPrice: constants.GAS_PRICE }
      );
      await time.increase(86400 + 1);
      const executeTx = await dxdVotingMachine.contract.execute(
        testProposalId,
        { from: accounts[1], gasPrice: constants.GAS_PRICE }
      );
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
        await cheapVoteWalletScheme.getOrganizationProposal(testProposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.executionSuccedd
      );
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    it("boosted proposal fails with not enough votes", async function () {
      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        testCallFrom(org.avatar.address),
        0
      );
      const tx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const stakeTx = await dxdVotingMachine.contract.stake(
        testProposalId,
        1,
        1000,
        { from: accounts[1] }
      );

      expectEvent(stakeTx.receipt, "StateChange", {
        _proposalId: testProposalId,
        _proposalState: "4",
      });

      await time.increase(3600 + 1);
      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gasPrice: constants.GAS_PRICE }
      );
      await time.increase(86400 + 1);
      const executeTx = await dxdVotingMachine.contract.execute(
        testProposalId,
        { from: accounts[1], gasPrice: constants.GAS_PRICE }
      );
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
        await cheapVoteWalletScheme.getOrganizationProposal(testProposalId);
      assert.equal(
        organizationProposal.state,
        constants.WALLET_SCHEME_PROPOSAL_STATES.rejected
      );
      assert.equal(organizationProposal.callData[0], genericCallData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });

    it.only("execution state is preBoosted after the vote execution bar has been crossed", async function () {
      // stake enough times to enter preboosted mode
      // execution bar of a proposal has been reached after it has been preBoosted
      const genericCallData = helpers.encodeGenericCallData(
        org.avatar.address,
        actionMock.address,
        testCallFrom(org.avatar.address),
        0
      );
      const tx = await cheapVoteWalletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        constants.TEST_TITLE,
        constants.SOME_HASH
      );
      const testProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      const stakeTx = await dxdVotingMachine.contract.stake(
        testProposalId,
        1,
        1000,
        { from: accounts[1] }
      );

      //check stateChange to preboosted
      expectEvent(stakeTx.receipt, "StateChange", {
        _proposalId: testProposalId,
        _proposalState: "4",
      });

      await time.increase(3600 + 1);

      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[2], gasPrice: constants.GAS_PRICE }
      );
      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[1], gasPrice: constants.GAS_PRICE }
      );

      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[3], gasPrice: constants.GAS_PRICE }
      );

      await dxdVotingMachine.contract.vote(
        testProposalId,
        1,
        0,
        constants.NULL_ADDRESS,
        { from: accounts[4], gasPrice: constants.GAS_PRICE }
      );
      //await time.increase(86400 + 1);

      // check Execution State while executing
      const executeTx = await dxdVotingMachine.contract.execute(
        testProposalId,
        { from: accounts[1], gasPrice: constants.GAS_PRICE }
      );
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
    });
    it("execution state is Boosted after the vote execution bar has been crossed", async function () {
      // stake enough to enter boosted mode
      // execution bar of a proposal has been reached after it has been boosted
    });

    it("Correct calcuation of down staked boosted proposal", async function () {
      // create a proposal and downstake it with a few different accounts and check calculation
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
});
