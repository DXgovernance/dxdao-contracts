import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");
const { toEthSignedMessageHash, fixSignature } = require('./helpers/sign');

const ProposalState = {
  submitted: 0,
  passed: 1,
  failed: 2,
  executed: 3
};

contract("SignedGenesisProtocol", function(accounts) {
  
  let standardTokenMock, walletScheme, daoCreator, org, actionMock, votingMachine, proposalId;
  
  const TEST_VALUE = 123;
  const TEST_HASH = helpers.SOME_HASH;
  
  function decodeGenericCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0,10), web3.eth.abi.encodeFunctionSignature('Error(string)'));
    const errorMsgBytesLength = web3.utils.hexToNumber('0x'+genericCallDataReturn.substring(74, 138))*2;
    return web3.utils.hexToUtf8('0x' + genericCallDataReturn.substring(138, 138 + errorMsgBytesLength));
  }

  
  beforeEach( async function(){
    actionMock = await ActionMock.new();
    const standardTokenMock = await ERC20Mock.new(accounts[1], 1000);
    const controllerCreator = await DxControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
    daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.ARC_GAS_LIMIT}
    );
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [accounts[0], accounts[1], accounts[2]],
      [1000, 1000, 1000],
      [20, 10, 70]
    );
    
    walletScheme = await WalletScheme.new();
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, standardTokenMock.address, 'signed'
    );;
    await walletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address
    );
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [walletScheme.address],
      [votingMachine.params],
      [helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        })
     ],
      "metaData"
    );
    
    const wallet = await Wallet.new();
    await web3.eth.sendTransaction({
      from: accounts[0], to: org.avatar.address, value: TEST_VALUE
    });
    await wallet.transferOwnership(org.avatar.address);
    
    const genericCallDataTransfer = helpers.encodeGenericCallData(
      org.avatar.address, wallet.address, "0x0", TEST_VALUE
    );
    const payCallData = await new web3.eth.Contract(wallet.abi).methods.pay(accounts[1]).encodeABI();
    const genericCallDataPay = helpers.encodeGenericCallData(
      org.avatar.address, wallet.address, payCallData, 0
    );
    const callDataMintRep = await org.controller.contract.methods.mintReputation(
      TEST_VALUE,
      accounts[4],
      org.avatar.address
    ).encodeABI();
    
    const tx = await walletScheme.proposeCalls(
      [org.controller.address, org.controller.address, org.controller.address],
      [genericCallDataTransfer, genericCallDataPay, callDataMintRep],
      [0, 0, 0],
      TEST_HASH
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");    
  })
  
  describe("SignedGenesisProtocol", function() {
    
    it("fail sharing ivalid vote signature", async function() {
      const voteHash = await votingMachine.contract.hashVote(
        votingMachine.address, proposalId, accounts[2], 1, 70
      );
      const votesignature = fixSignature(await web3.eth.sign(voteHash, accounts[2]));  
      assert.equal(accounts[2], web3.eth.accounts.recover(voteHash, votesignature));
      
      try {
        await votingMachine.contract.shareSignedVote(
          votingMachine.address, proposalId, 2, 70, votesignature, {from: accounts[2]}
        );
        assert(false, "cannot share invalid vote signature different vote");
      } catch(error) { helpers.assertVMException(error) }
      
      try {
        await votingMachine.contract.shareSignedVote(
          votingMachine.address, proposalId, 1, 71, votesignature, {from: accounts[2]}
        );
        assert(false, "cannot share invalid vote signature with higher REP");
      } catch(error) { helpers.assertVMException(error) }
      
      try {
        await votingMachine.contract.shareSignedVote(
          votingMachine.address, proposalId, 1, 70, votesignature, {from: accounts[1]}
        );
        assert(false, "cannot share invalid vote signature form other address");
      } catch(error) { helpers.assertVMException(error) }
      
    });
    
    it("fail executing vote with invalid data", async function() {
      const voteHash = await votingMachine.contract.hashVote(
        votingMachine.address, proposalId, accounts[2], 1, 70
      );
      const votesignature = fixSignature(await web3.eth.sign(voteHash, accounts[2]));  
      assert.equal(accounts[2], web3.eth.accounts.recover(voteHash, votesignature));
      
      const shareVoteTx = await votingMachine.contract.shareSignedVote(
        votingMachine.address, proposalId, 1, 70, votesignature, {from: accounts[2]}
      );
      const voteInfoFromLog = shareVoteTx.logs[0].args;
      
      try {
        await votingMachine.contract.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          2,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          {from: accounts[5]}
        );
        assert(false, "cannot execute vote signature with different vote");
      } catch(error) { helpers.assertVMException(error) }
      
      try {
        await votingMachine.contract.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          voteInfoFromLog.voter,
          voteInfoFromLog.vote,
          voteInfoFromLog.amount - 1,
          voteInfoFromLog.signature,
          {from: accounts[5]}
        );
        assert(false, "cannot execute vote signature with less REP");
      } catch(error) { helpers.assertVMException(error) }
      
      try {
        await votingMachine.contract.executeSignedVote(
          voteInfoFromLog.votingMachine,
          voteInfoFromLog.proposalId,
          accounts[1],
          voteInfoFromLog.vote,
          voteInfoFromLog.amount,
          voteInfoFromLog.signature,
          {from: accounts[5]}
        );
        assert(false, "cannot execute vote signature form other address");
      } catch(error) { helpers.assertVMException(error) }
      
    });

    it("positive signed decision", async function() {
      const voteHash = await votingMachine.contract.hashVote(
        votingMachine.address, proposalId, accounts[2], 1, 70
      );
      const votesignature = fixSignature(await web3.eth.sign(voteHash, accounts[2]));  
      assert.equal(accounts[2], web3.eth.accounts.recover(voteHash, votesignature));
      
      const shareVoteTx = await votingMachine.contract.shareSignedVote(
        votingMachine.address, proposalId, 1, 70, votesignature, {from: accounts[2]}
      );
      const voteInfoFromLog = shareVoteTx.logs[0].args;
      await votingMachine.contract.executeSignedVote(
        voteInfoFromLog.votingMachine,
        voteInfoFromLog.proposalId,
        voteInfoFromLog.voter,
        voteInfoFromLog.vote,
        voteInfoFromLog.amount,
        voteInfoFromLog.signature,
        {from: accounts[5]}
      );
      
      await walletScheme.execute(proposalId);
      const organizationProposal = await walletScheme.getOrganizationProposal(proposalId);
      assert.equal(organizationProposal.state, ProposalState.executed);
    });
    
    it("negative signed decision with less rep than the one held", async function() {
      // The voter has 70 rep but votes with 60 rep
      const voteHash = await votingMachine.contract.hashVote(
        votingMachine.address, proposalId, accounts[2], 2, 60
      );
      const votesignature = fixSignature(await web3.eth.sign(voteHash, accounts[2]));  
      assert.equal(accounts[2], web3.eth.accounts.recover(voteHash, votesignature));
      
      const shareVoteTx = await votingMachine.contract.shareSignedVote(
        votingMachine.address, proposalId, 2, 60, votesignature, {from: accounts[2]}
      );
      const voteInfoFromLog = shareVoteTx.logs[0].args;
      await votingMachine.contract.executeSignedVote(
        voteInfoFromLog.votingMachine,
        voteInfoFromLog.proposalId,
        voteInfoFromLog.voter,
        voteInfoFromLog.vote,
        voteInfoFromLog.amount,
        voteInfoFromLog.signature,
        {from: accounts[5]}
      );
      
      const organizationProposal = await walletScheme.getOrganizationProposal(proposalId);
      assert.equal(organizationProposal.state, ProposalState.failed);
    });

  }); 

});
