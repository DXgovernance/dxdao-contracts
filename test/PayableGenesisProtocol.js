import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const PayableGenesisProtocol = artifacts.require("./PayableGenesisProtocol.sol");

const ProposalState = {
  submitted: 0,
  passed: 1,
  failed: 2,
  executed: 3
};

contract("PayableGenesisProtocol", function(accounts) {
  
  let standardTokenMock,
    expensiveVoteWalletScheme,
    cheapVoteWalletScheme,
    org,
    actionMock,
    votingMachine,
    payableVotingMachine;
  
  const TEST_VALUE = 123;
  const TEST_HASH = helpers.SOME_HASH;
  const GAS_PRICE = 10000000000;
  const VOTE_GAS = 360000;
  
  function testCallFrom(address) {
    return new web3.eth.Contract(ActionMock.abi).methods.test(address).encodeABI();
  }
  function testCallWithoutReturnValueFrom(address) {
    return new web3.eth.Contract(ActionMock.abi).methods.testWithoutReturnValue(address).encodeABI();
  }

  function decodeGenericCallError(genericCallDataReturn) {
    assert.equal(genericCallDataReturn.substring(0,10), web3.eth.abi.encodeFunctionSignature('Error(string)'));
    const errorMsgBytesLength = web3.utils.hexToNumber('0x'+genericCallDataReturn.substring(74, 138))*2;
    return web3.utils.hexToUtf8('0x' + genericCallDataReturn.substring(138, 138 + errorMsgBytesLength));
  }

  
  beforeEach( async function(){
    actionMock = await ActionMock.new();
    const standardTokenMock = await ERC20Mock.new(accounts[1], 1000);
    const controllerCreator = await DxControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
    const daoCreator = await DaoCreator.new(
      controllerCreator.address, {gas: constants.ARC_GAS_LIMIT}
    );
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [accounts[0], accounts[1], accounts[2]],
      [1000, 1000, 1000],
      [20, 10, 70]
    );
    
    votingMachine = await helpers.setupGenesisProtocol(
      accounts, standardTokenMock.address, 0, false, helpers.NULL_ADDRESS
    );
    payableVotingMachine = await helpers.setupGenesisProtocol(
      accounts, standardTokenMock.address, 0, true, helpers.NULL_ADDRESS
    );
    
    expensiveVoteWalletScheme = await WalletScheme.new();
    await expensiveVoteWalletScheme.initialize(
      org.avatar.address,
      votingMachine.address,
      votingMachine.params,
      org.controller.address
    );
    
    cheapVoteWalletScheme = await WalletScheme.new();
    await cheapVoteWalletScheme.initialize(
      org.avatar.address,
      payableVotingMachine.address,
      payableVotingMachine.params,
      org.controller.address
    );
    
    await daoCreator.setSchemes(
      org.avatar.address,
      [expensiveVoteWalletScheme.address, cheapVoteWalletScheme.address],
      [votingMachine.params, payableVotingMachine.params],
      [helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        }),
        helpers.encodePermission({
          canGenericCall: true,
          canUpgrade: true,
          canChangeConstraints: true,
          canRegisterSchemes: true
        }),
     ],
      "metaData"
    );
  })

  it("gas spent in PayableGenesisProtocol vote is less than GenesisProtocol vote", async function() {
    const callData = testCallFrom(org.avatar.address);
    let genericCallData = helpers.encodeGenericCallData(
      org.avatar.address, actionMock.address, callData, 0
    );
    
    let tx = await expensiveVoteWalletScheme.proposeCalls(
      [org.controller.address], [genericCallData], [0], TEST_HASH
    );
    let proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    let balanceBeforeVote = await web3.eth.getBalance(accounts[2]);
    tx = await votingMachine.contract.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2], gasPrice: GAS_PRICE}
    );
    let balanceAfterVote = await web3.eth.getBalance(accounts[2]);
    const gastVoteWithoutRefund = parseInt((balanceBeforeVote - balanceAfterVote) / GAS_PRICE)
    assert.equal(tx.receipt.gasUsed, gastVoteWithoutRefund);
  
    await expensiveVoteWalletScheme.execute(proposalId);  
    let organizationProposal = await expensiveVoteWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, ProposalState.executed);
    assert.equal(organizationProposal.callData[0], genericCallData);
    assert.equal(organizationProposal.to[0], org.controller.address);
    assert.equal(organizationProposal.value[0], 0);
    
    // Configure refund
    await web3.eth.sendTransaction({
      from: accounts[0], to: org.avatar.address, value: web3.utils.toWei('1')
    });
    const totalGasRefund = VOTE_GAS * GAS_PRICE;
    const setRefundConfData = new web3.eth.Contract(PayableGenesisProtocol.abi).methods.setOrganizationRefund(
      VOTE_GAS, GAS_PRICE
    ).encodeABI();
    tx = await cheapVoteWalletScheme.proposeCalls(
      [org.controller.address, org.controller.address], 
      [helpers.encodeGenericCallData(
        org.avatar.address, payableVotingMachine.address, setRefundConfData, 0
      ),
      helpers.encodeGenericCallData(
        org.avatar.address, payableVotingMachine.address, '0x0', web3.utils.toWei('1')
      )],
      [0, 0],
      TEST_HASH
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    const organizationId = (await payableVotingMachine.contract.proposals(proposalId)).organizationId
    assert.equal(await payableVotingMachine.contract.organizations(organizationId), org.avatar.address);
    await payableVotingMachine.contract.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2]}
    );
    tx = await cheapVoteWalletScheme.execute(proposalId);
    const organizationRefundConf = await payableVotingMachine.contract.organizationRefunds(org.avatar.address);
    assert.equal(web3.utils.toWei('1'), organizationRefundConf.balance);
    assert.equal(VOTE_GAS, organizationRefundConf.voteGas);
    assert.equal(GAS_PRICE, organizationRefundConf.maxGasPrice);
    
    // Vote with refund configured
    tx = await cheapVoteWalletScheme.proposeCalls(
      [org.controller.address], [genericCallData], [0], TEST_HASH
    );
    proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    balanceBeforeVote = await web3.eth.getBalance(accounts[2]);
    tx = await payableVotingMachine.contract.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2], gasPrice: GAS_PRICE}
    );
    balanceAfterVote = await web3.eth.getBalance(accounts[2]);
    const gasVoteWithRefund = parseInt((balanceBeforeVote - balanceAfterVote) / GAS_PRICE);
    
    // Gas was taken from the organization refund balance and used to pay most of vote gas cost
    assert.equal(web3.utils.toWei('1') - totalGasRefund,
      (await payableVotingMachine.contract.organizationRefunds(org.avatar.address)).balance
    )
    assert.equal(tx.receipt.gasUsed - VOTE_GAS, gasVoteWithRefund);
    
    await cheapVoteWalletScheme.execute(proposalId);
    organizationProposal = await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, ProposalState.executed);
    assert.equal(organizationProposal.callData[0], genericCallData);
    assert.equal(organizationProposal.to[0], org.controller.address);
    assert.equal(organizationProposal.value[0], 0);
  });

});
