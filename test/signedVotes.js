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
  
  let standardTokenMock, walletScheme, daoCreator, org, actionMock, votingMachine;
  
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
      accounts, standardTokenMock.address, 0, helpers.NULL_ADDRESS
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
  })
  
  describe("MasterWalletScheme", function() {

    it("positive decision - proposal executed with transfer, pay and mint rep", async function() {
      var wallet = await Wallet.new();
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
      const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
      assert.equal(await helpers.getValueFromLogs(tx, "_descriptionHash"), TEST_HASH);
      assert.equal(await web3.eth.getBalance(org.avatar.address), TEST_VALUE);
      assert.equal(await web3.eth.getBalance(wallet.address), 0);
      assert.equal(await org.reputation.balanceOf(accounts[4]), 0);

      const balanceBeforePay = await web3.eth.getBalance(accounts[1]);
      
      const voteHash = await votingMachine.contract.hashVote(votingMachine.address, proposalId, accounts[2], 1, 70);
      const votesignature = fixSignature(await web3.eth.sign(voteHash, accounts[2]));

      assert.equal(accounts[2], web3.eth.accounts.recover(voteHash, votesignature));
      await votingMachine.contract.shareSignedVote(
        votingMachine.address, proposalId, 1, 70, votesignature, {from: accounts[2]}
      );
      await votingMachine.contract.executeSignedVote(
        votingMachine.address, proposalId, accounts[2], 1, 70, votesignature, {from: accounts[0]}
      );
      
      await walletScheme.execute(proposalId);
      assert.equal(await web3.eth.getBalance(org.avatar.address), 0);
      assert.equal(await web3.eth.getBalance(wallet.address), 0);
      assert.equal(await web3.eth.getBalance(accounts[1]), Number(balanceBeforePay) + TEST_VALUE);
      assert.equal(await org.reputation.balanceOf(accounts[4]), TEST_VALUE);
      
      const organizationProposal = await walletScheme.getOrganizationProposal(proposalId);
      assert.equal(organizationProposal.state, ProposalState.executed);
      assert.equal(organizationProposal.callData[0], genericCallDataTransfer);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
      assert.equal(organizationProposal.callData[1], genericCallDataPay);
      assert.equal(organizationProposal.to[1], org.controller.address);
      assert.equal(organizationProposal.value[1], 0);
      assert.equal(organizationProposal.callData[2], callDataMintRep);
      assert.equal(organizationProposal.to[2], org.controller.address);
      assert.equal(organizationProposal.value[2], 0);
    });

  }); 

});
