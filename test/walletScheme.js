import * as helpers from "./helpers";
const constants = require("./constants");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const DaoCreator = artifacts.require("./DaoCreator.sol");
const DxControllerCreator = artifacts.require("./DxControllerCreator.sol");
const DAOTracker = artifacts.require("./DAOTracker.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const Wallet = artifacts.require("./Wallet.sol");

const setupWalletSchemeParams = async function(
  walletScheme,
  accounts,
  genesisProtocol = false,
  tokenAddress = 0,
  avatarAddress,
  controllerAddress
) {
  var walletSchemeParams = {};
  if (genesisProtocol === true){
    walletSchemeParams.votingMachine = await helpers.setupGenesisProtocol(
      accounts, tokenAddress, 0, helpers.NULL_ADDRESS
    );
    await walletScheme.initialize(
      avatarAddress,
      controllerAddress,
      walletSchemeParams.votingMachine.genesisProtocol.address,
      walletSchemeParams.votingMachine.params,
    );
  } else {
    walletSchemeParams.votingMachine = await helpers.setupAbsoluteVote(
      helpers.NULL_ADDRESS, 50, walletScheme.address
    );
    await walletScheme.initialize(
      avatarAddress,
      controllerAddress,
      walletSchemeParams.votingMachine.absoluteVote.address,
      walletSchemeParams.votingMachine.params,
    );
  }
  return walletSchemeParams;
};

const setup = async function(
  accounts, reputationAccount = 0, genesisProtocol = false, tokenAddress = 0
) {
  const standardTokenMock = await ERC20Mock.new(accounts[ 1 ], 100);
  const walletScheme = await WalletScheme.new();
  var controllerCreator = await DxControllerCreator.new({gas: constants.ARC_GAS_LIMIT});
  var daoTracker = await DAOTracker.new({gas: constants.ARC_GAS_LIMIT});
  const daoCreator = await DaoCreator.new(
    controllerCreator.address, daoTracker.address, {gas: constants.ARC_GAS_LIMIT}
  );
  const reputationArray = [ 20, 10, 70 ];
  let org;
  if (reputationAccount === 0) {
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ] ],
      [ 1000, 1000, 1000 ],
      reputationArray
    );
  } else {
    org = await helpers.setupOrganizationWithArrays(
      daoCreator,
      [ accounts[ 0 ],
        accounts[ 1 ],
        reputationAccount ],
      [ 1000, 1000, 1000 ],
      reputationArray
    );
  }
  const walletSchemeParams = await setupWalletSchemeParams(
    walletScheme,
    accounts,
    genesisProtocol,
    tokenAddress,
    org.avatar.address,
    org.controller.address
  );
  await daoCreator.setSchemes(
    org.avatar.address,
    [ walletScheme.address ],
    [ helpers.NULL_HASH ],
    [ helpers.encodePermission({
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    }) ],
    "metaData"
  );

  return {standardTokenMock, walletScheme, daoCreator, reputationArray, org, walletSchemeParams};
};

const createCallToActionMock = async function(_sender, _actionMock) {
  return await new web3.eth.Contract(_actionMock.abi).methods.test2(_sender).encodeABI();
};

contract("WalletScheme", function(accounts) {

  it("proposeCalls log", async function() {

    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    var callData = await createCallToActionMock(testSetup.walletScheme.address, actionMock);

    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    assert.equal(tx.logs.length, 1);
    assert.equal(tx.logs[ 0 ].event, "NewCallProposal");
  });

  it("execute proposeCalls -no decision - proposal data delete", async function() {
    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    var callData = await createCallToActionMock(testSetup.walletScheme.address, actionMock);
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    await testSetup.walletSchemeParams.votingMachine.absoluteVote.vote(
      proposalId, 0, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    //check organizationsProposals after execution
    var organizationProposal = await testSetup.walletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.passed, false);
    assert.equal(organizationProposal.callData[ 0 ], null);
  });

  it("execute proposeVote -positive decision - proposal data delete", async function() {
    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    var callData = await createCallToActionMock(testSetup.walletScheme.address, actionMock);
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    var organizationProposal = await testSetup.walletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal[ 1 ][ 0 ], callData, helpers.NULL_HASH);
    await testSetup.walletSchemeParams.votingMachine.absoluteVote.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    //check organizationsProposals after execution
    organizationProposal = await testSetup.walletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.callData[ 0 ], null);//new contract address
  });

  it("execute proposeVote -positive decision - destination reverts", async function() {
    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    var callData = await createCallToActionMock(helpers.NULL_ADDRESS, actionMock);
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await testSetup.walletSchemeParams.votingMachine.absoluteVote.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    //actionMock revert because msg.sender is not the _addr param at actionMock thpugh the generic scheme not .
    var organizationProposal = await testSetup.walletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.exist, true);//new contract address
    assert.equal(organizationProposal.passed, true);//new contract address
    //can call execute
    await testSetup.walletScheme.execute( proposalId);
  });


  it("execute proposeVote -positive decision - destination reverts and then active", async function() {
    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    var activationTime = (await web3.eth.getBlock("latest")).timestamp + 1000;
    await actionMock.setActivationTime(activationTime);
    var callData = await new web3.eth.Contract(actionMock.abi).methods.test3().encodeABI();
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await testSetup.walletSchemeParams.votingMachine.absoluteVote.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    //actionMock revert because msg.sender is not the _addr param at actionMock thpugh the generic scheme not .
    var organizationProposal = await testSetup.walletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.exist, true);//new contract address
    assert.equal(organizationProposal.passed, true);//new contract address
    //can call execute
    await testSetup.walletScheme.execute( proposalId);
    await helpers.increaseTime(1001);
    await testSetup.walletScheme.execute( proposalId);

    organizationProposal = await testSetup.walletScheme.getOrganizationProposal(proposalId);
    assert.equal(organizationProposal.exist, false);//new contract address
    assert.equal(organizationProposal.passed, false);//new contract address
    try {
      await testSetup.walletScheme.execute( proposalId);
      assert(false, "cannot call execute after it been executed");
    } catch(error) {
      helpers.assertVMException(error);
    }
  });

  it("execute proposeVote without return value-positive decision - check action", async function() {
    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    const encodeABI = await new web3.eth.Contract(actionMock.abi).methods.withoutReturnValue(
      testSetup.org.avatar.address
    ).encodeABI();
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ encodeABI ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    await testSetup.walletSchemeParams.votingMachine.absoluteVote.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );

  });

  it("execute should fail if not executed from votingMachine", async function() {
    var actionMock = await ActionMock.new();
    var testSetup = await setup(accounts);
    const encodeABI = await new web3.eth.Contract(actionMock.abi).methods.withoutReturnValue(
      testSetup.org.avatar.address
    ).encodeABI();
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ encodeABI ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

    try {
      await testSetup.walletScheme.execute( proposalId);
      assert(false, "execute should fail if not executed from votingMachine");
    } catch(error) {
      helpers.assertVMException(error);
    }

  });

  it("execute proposeVote -positive decision - check action - with GenesisProtocol", async function() {
    var actionMock = await ActionMock.new();
    var standardTokenMock = await ERC20Mock.new(accounts[ 0 ], 1000);
    var testSetup = await setup(accounts, 0, true, standardTokenMock.address);
    var value = 123;
    var callData = await createCallToActionMock(testSetup.walletScheme.address, actionMock);
    var tx = await testSetup.walletScheme.proposeCalls(
      [ actionMock.address ], [ callData ], [ value ], helpers.NULL_HASH
    );
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    //transfer some eth to avatar
    await web3.eth.sendTransaction({
      from: accounts[ 0 ], to: testSetup.walletScheme.address, value: web3.utils.toWei("1", "ether")});
    assert.equal(await web3.eth.getBalance(actionMock.address), 0);
    tx  = await testSetup.walletSchemeParams.votingMachine.genesisProtocol.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    await testSetup.walletScheme.getPastEvents("ProposalExecutedByVotingMachine", {
      fromBlock: tx.blockNumber,
      toBlock: "latest"
    })
      .then(function(events){
        assert.equal(events[ 0 ].event, "ProposalExecutedByVotingMachine");
        assert.equal(events[ 0 ].args._param, 1);
      });
    assert.equal(await web3.eth.getBalance(actionMock.address), value);
  });
  
  it(
    "execute registerScheme & removeScheme -positive decision - check action - with GenesisProtocol",
    async function() {
      var standardTokenMock = await ERC20Mock.new(accounts[ 0 ], 1000);
      var testSetup = await setup(accounts, 0, true, standardTokenMock.address);
      var newWalletScheme = await WalletScheme.new();
      await setupWalletSchemeParams(
        newWalletScheme,
        accounts,
        true,
        testSetup.org.token.address,
        testSetup.org.avatar.address,
        testSetup.org.controller.address
      );
      var callData = await testSetup.org.controller.contract.methods.registerScheme(
        newWalletScheme.address,
        "0x0",
        "0x0000000F",
        testSetup.org.avatar.address
      ).encodeABI();
      var tx = await testSetup.walletScheme.proposeCalls(
        [ testSetup.org.controller.address ], [ callData ], [ 0 ], helpers.NULL_HASH
      );
      var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      tx = await testSetup.walletSchemeParams.votingMachine.genesisProtocol.vote(
        proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
      );

      await testSetup.walletScheme.getPastEvents("ProposalExecutedByVotingMachine", {
        fromBlock: tx.blockNumber,
        toBlock: "latest"
      }).then(function(events){
        assert.equal(events[ 0 ].event, "ProposalExecutedByVotingMachine");
        assert.equal(events[ 0 ].args._param, 1);
      });
    }
  );

  it("execute proposeVote -negative decision - check action - with GenesisProtocol", async function() {
    var actionMock = await ActionMock.new();
    var standardTokenMock = await ERC20Mock.new(accounts[ 0 ], 1000);
    var testSetup = await setup(accounts, 0, true, standardTokenMock.address);

    var callData = await createCallToActionMock(testSetup.walletScheme.address, actionMock);
    var tx = await testSetup.walletScheme.proposeCalls([ actionMock.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    tx  = await testSetup.walletSchemeParams.votingMachine.genesisProtocol.vote(
      proposalId, 2, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    await testSetup.walletScheme.getPastEvents("ProposalExecutedByVotingMachine", {
      fromBlock: tx.blockNumber,
      toBlock: "latest"
    }).then(function(events){
      assert.equal(events[ 0 ].event, "ProposalExecutedByVotingMachine");
      assert.equal(events[ 0 ].args._param, 2);
    });
  });

  it("Wallet - execute proposeVote -positive decision - check action - with GenesisProtocol", async function() {
    var wallet = await Wallet.new();
    await web3.eth.sendTransaction({from: accounts[ 0 ], to: wallet.address, value: web3.utils.toWei("1", "ether")});
    var standardTokenMock = await ERC20Mock.new(accounts[ 0 ], 1000);
    var testSetup = await setup(accounts, 0, true, standardTokenMock.address);
    var callData = await new web3.eth.Contract(wallet.abi).methods.pay(accounts[ 1 ]).encodeABI();
    var tx = await testSetup.walletScheme.proposeCalls([ wallet.address ], [ callData ], [ 0 ], helpers.NULL_HASH);
    var proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    assert.equal(await web3.eth.getBalance(wallet.address), web3.utils.toWei("1", "ether"));
    await testSetup.walletSchemeParams.votingMachine.genesisProtocol.vote(
      proposalId, 1, 0, helpers.NULL_ADDRESS, {from: accounts[ 2 ]}
    );
    assert.equal(await web3.eth.getBalance(wallet.address), web3.utils.toWei("1", "ether"));
    await wallet.transferOwnership(testSetup.walletScheme.address);
    await testSetup.walletScheme.execute(proposalId);
    assert.equal(await web3.eth.getBalance(wallet.address), 0);
  });

  it("cannot init twice", async function() {
    var testSetup = await setup(accounts);

    try {
      await testSetup.walletScheme.initialize(
        testSetup.org.avatar.address,
        testSetup.daoCreator.address,
        accounts[ 0 ],
        accounts[ 0 ]
      );
      assert(false, "cannot init twice");
    } catch(error) {
      helpers.assertVMException(error);
    }

  });

});
