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
  const TOTAL_GAS_REFUND = VOTE_GAS * GAS_PRICE;
  
  function testCallFrom(address) {
    return new web3.eth.Contract(ActionMock.abi).methods.test(address).encodeABI();
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
      accounts, standardTokenMock.address, 'normal', helpers.NULL_ADDRESS
    );
    payableVotingMachine = await helpers.setupGenesisProtocol(
      accounts, standardTokenMock.address, 'payable', helpers.NULL_ADDRESS
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
    
    // Configure refund
    await web3.eth.sendTransaction({
      from: accounts[0], to: org.avatar.address, value: web3.utils.toWei('1')
    });
    const setRefundConfData = new web3.eth.Contract(PayableGenesisProtocol.abi).methods.setOrganizationRefund(
      VOTE_GAS, GAS_PRICE
    ).encodeABI();
    const setRefundConfTx = await cheapVoteWalletScheme.proposeCalls(
      [org.controller.address], 
      [helpers.encodeGenericCallData(
        org.avatar.address, payableVotingMachine.address, setRefundConfData, 0
      )],
      [0],
      TEST_HASH
    );
    const setRefundConfProposalId = await helpers.getValueFromLogs(setRefundConfTx, "_proposalId");
    const organizationId = (await payableVotingMachine.contract.proposals(setRefundConfProposalId)).organizationId
    assert.equal(await payableVotingMachine.contract.organizations(organizationId), org.avatar.address);
    await payableVotingMachine.contract.vote(setRefundConfProposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2]});
    await cheapVoteWalletScheme.execute(setRefundConfProposalId);
    const organizationRefundConf = await payableVotingMachine.contract.organizationRefunds(org.avatar.address);
    assert.equal(0, organizationRefundConf.balance);
    assert.equal(VOTE_GAS, organizationRefundConf.voteGas);
    assert.equal(GAS_PRICE, organizationRefundConf.maxGasPrice);
  });

  it("gas spent in PayableGenesisProtocol vote is less than GenesisProtocol vote", async function() {  
    await web3.eth.sendTransaction({from: accounts[0], to: org.avatar.address, value: web3.utils.toWei('1')});
    const fundVotingMachineTx = await cheapVoteWalletScheme.proposeCalls(
      [org.controller.address], 
      [helpers.encodeGenericCallData( org.avatar.address, payableVotingMachine.address, '0x0', web3.utils.toWei('1') )],
      [0],
      TEST_HASH
    );
    const fundVotingMachineProposalId = await helpers.getValueFromLogs(fundVotingMachineTx, "_proposalId");
    await payableVotingMachine.contract.vote(
      fundVotingMachineProposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2]}
    );
    await cheapVoteWalletScheme.execute(fundVotingMachineProposalId);
    
    const genericCallData = helpers.encodeGenericCallData(
      org.avatar.address, actionMock.address, testCallFrom(org.avatar.address), 0
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
    expect(tx.receipt.gasUsed).to.be.closeTo(gastVoteWithoutRefund, 1);

    await expensiveVoteWalletScheme.execute(proposalId);  
    let organizationProposal = await expensiveVoteWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, ProposalState.executed);
    assert.equal(organizationProposal.callData[0], genericCallData);
    assert.equal(organizationProposal.to[0], org.controller.address);
    assert.equal(organizationProposal.value[0], 0);
    
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
    assert.equal(web3.utils.toWei('1') - TOTAL_GAS_REFUND,
      (await payableVotingMachine.contract.organizationRefunds(org.avatar.address)).balance
    )
    expect(tx.receipt.gasUsed - VOTE_GAS).to.be.closeTo(gasVoteWithRefund, 1);

    await cheapVoteWalletScheme.execute(proposalId);
    organizationProposal = await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, ProposalState.executed);
    assert.equal(organizationProposal.callData[0], genericCallData);
    assert.equal(organizationProposal.to[0], org.controller.address);
    assert.equal(organizationProposal.value[0], 0);
  });
  
  
  it("pay for gasRefund from voting machine only when gasRefund balance is enough", async function() {
    
    // Send enough eth just for two votes
    const votesRefund = TOTAL_GAS_REFUND * 2;
    await web3.eth.sendTransaction({from: accounts[0], to: org.avatar.address, value: votesRefund.toString()});
    const fundVotingMachineTx = await cheapVoteWalletScheme.proposeCalls(
      [org.controller.address], 
      [helpers.encodeGenericCallData(
        org.avatar.address, payableVotingMachine.address, '0x0', votesRefund.toString()
      )],
      [0],
      TEST_HASH
    );
    const fundVotingMachineProposalId = await helpers.getValueFromLogs(fundVotingMachineTx, "_proposalId");
    await payableVotingMachine.contract.vote(
      fundVotingMachineProposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2], gasPrice: GAS_PRICE}
    );
    await cheapVoteWalletScheme.execute(fundVotingMachineProposalId);
    
    // Vote three times and pay only the first two
    const genericCallData = helpers.encodeGenericCallData(
      org.avatar.address, actionMock.address, testCallFrom(org.avatar.address), 0
    );
    let tx = await cheapVoteWalletScheme.proposeCalls(
      [org.controller.address], [genericCallData], [0], TEST_HASH
    );
    let proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(TOTAL_GAS_REFUND * 2,
      Number((await payableVotingMachine.contract.organizationRefunds(org.avatar.address)).balance)
    )
    // Vote with higher gas than maxGasPrice and dont spend more than one vote refund
    await payableVotingMachine.contract.vote(
      proposalId, 2, 0, helpers.NULL_ADDRESS, {from: accounts[0], gasPrice: GAS_PRICE*2}
    );
    
    assert.equal(TOTAL_GAS_REFUND,
      Number((await payableVotingMachine.contract.organizationRefunds(org.avatar.address)).balance)
    )
    await payableVotingMachine.contract.vote(
      proposalId, 2, 0, helpers.NULL_ADDRESS, {from: accounts[1], gasPrice: GAS_PRICE}
    );
    
    assert.equal(0,
      Number((await payableVotingMachine.contract.organizationRefunds(org.avatar.address)).balance)
    )
    const balanceBeforeVote = await web3.eth.getBalance(accounts[2]);
    tx = await payableVotingMachine.contract.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[2], gasPrice: GAS_PRICE}
    );
    const balanceAfterVote = await web3.eth.getBalance(accounts[2]);
  
    // There wasnt enough gas balance in the voting machine to pay the gas refund of the last vote
    const gastVoteWithoutRefund = parseInt((balanceBeforeVote - balanceAfterVote) / GAS_PRICE);
    expect(tx.receipt.gasUsed).to.be.closeTo(gastVoteWithoutRefund, 1);
    
    await cheapVoteWalletScheme.execute(proposalId);
    const organizationProposal = await cheapVoteWalletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.state, ProposalState.executed);
    assert.equal(organizationProposal.callData[0], genericCallData);
    assert.equal(organizationProposal.to[0], org.controller.address);
    assert.equal(organizationProposal.value[0], 0);
  });

});
