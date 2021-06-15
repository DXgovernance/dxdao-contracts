import * as helpers from "../helpers";
const { fixSignature } = require("../helpers/sign");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal
} = require("../helpers/guild");

const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time
} = require("@openzeppelin/test-helpers");

const ERC20Guild = artifacts.require("ERC20Guild.sol");
const IERC20Guild = artifacts.require("IERC20Guild.sol");
const ActionMock = artifacts.require("ActionMock.sol");

require("chai").should();

contract("ERC20Guild", function (accounts) {
  
  const constants = helpers.constants;
  const ZERO = new BN("0");
  const TIMELOCK = new BN("60");
  const VOTE_GAS = new BN("50000"); // 50k
  const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.GAS_PRICE); // 8 gwei (check config)

  let walletScheme,
    daoCreator,
    org,
    actionMock,
    votingMachine,
    guildToken,
    erc20Guild,
    tokenVault,
    callData,
    genericCallData,
    walletSchemeProposalId,
    walletSchemeProposalData,
    genericProposal;
    
  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, TIMELOCK);
    erc20Guild = await IERC20Guild.at(erc20Guild.address);
    tokenVault = await erc20Guild.tokenVault();

    await guildToken.approve(tokenVault, 100, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100, { from: accounts[3] });
    await guildToken.approve(tokenVault, 100, { from: accounts[4] });
    await guildToken.approve(tokenVault, 200, { from: accounts[5] });

    await erc20Guild.lockTokens(100, { from: accounts[2] });
    await erc20Guild.lockTokens(100, { from: accounts[3] });
    await erc20Guild.lockTokens(100, { from: accounts[4] });
    await erc20Guild.lockTokens(200, { from: accounts[5] });
    
    const createDaoResult = await createDAO(erc20Guild, accounts);
    daoCreator = createDaoResult.daoCreator;
    walletScheme = createDaoResult.walletScheme;
    votingMachine = createDaoResult.votingMachine;
    org = createDaoResult.org;
    actionMock = await ActionMock.new();
    tokenVault = await erc20Guild.tokenVault();
    
    const allowVotingMachineProposalId = await createProposal({
      guild: erc20Guild,
      to: [erc20Guild.address],
      data: [await new web3.eth.Contract(
        ERC20Guild.abi
      ).methods.setAllowance(
        [votingMachine.address],
        ["0x359afa49"],
        [true]
      ).encodeABI()],
      value: [0],
      description: "Allow vote in voting machine",
      contentHash: constants.NULL_ADDRESS,
      account: accounts[3],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: allowVotingMachineProposalId,
      account: accounts[5],
    });
    await time.increase(time.duration.seconds(31));
    await erc20Guild.endProposal(allowVotingMachineProposalId);
    
    walletSchemeProposalData = helpers.encodeGenericCallData(
      org.avatar.address, actionMock.address, helpers.testCallFrom(org.avatar.address), 0
    )
    const tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [walletSchemeProposalData],
      [0],
      "Test Title",
      constants.SOME_HASH
    );
    walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    genericCallData = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods.vote(walletSchemeProposalId, 1, 0, constants.NULL_ADDRESS).encodeABI();
    genericProposal = {
      guild: erc20Guild,
      to: [votingMachine.address],
      data: [genericCallData],
      value: [0],
      description: "Guild Test Proposal",
      contentHash: constants.NULL_ADDRESS,
      account: accounts[3],
    };
  });  
    
  describe("Initialization", function () {
    
    it("cannot initialize with zero locktime", async function () {
      erc20Guild = await ERC20Guild.new();
      await expectRevert(
        erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 0),
        "ERC20Guild: lockTime should be higher than zero"
      );
    });

    it("cannot initialize twice", async function () {
      erc20Guild = await ERC20Guild.at(erc20Guild.address);
      await expectRevert(
        erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 1),
        "Initializable: contract is already initialized"
      );
    });
    
  });
  
  describe("setConfig", function () {
    
    it("cannot setConfig with zero locktime", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 0).encodeABI()
        ],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      )

      assert.equal(await erc20Guild.proposalTime(), 30);
      assert.equal(await erc20Guild.votesForCreation(), 100);
      assert.equal(await erc20Guild.votesForExecution(), 200);
      assert.equal(await erc20Guild.lockTime(), 60);
    });
    
    it("not execute an ERC20guild setConfig proposal on the guild", async function () {      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 10).encodeABI()
        ],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });

      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);

      assert.equal(await erc20Guild.proposalTime(), 30);
      assert.equal(await erc20Guild.votesForCreation(), 100);
      assert.equal(await erc20Guild.votesForExecution(), 200);
      assert.equal(await erc20Guild.lockTime(), 60);
    });
    
    it("execute an ERC20Guild setConfig proposal on the guild", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(15, 15, 100, 50, 0, 0, 10).encodeABI()
        ],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      assert.equal(await erc20Guild.proposalTime(), 15);
      assert.equal(await erc20Guild.votesForCreation(), 50);
      assert.equal(await erc20Guild.votesForExecution(), 100);
      assert.equal(await erc20Guild.lockTime(), 10);
    });
    
  });
  
  describe("setAllowance", function () {
    
    it("Reverts when not called by guild", async function () {
      await expectRevert(
        erc20Guild.setAllowance([], [], []),
        "ERC20Guild: Only callable by ERC20guild itself"
      );
    });

    it("Reverts when proposal exec calls setAllowance with invalid params", async function () {
      const setConfigSignature = web3.eth.abi.encodeFunctionSignature(
        "setConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"
      );

      const setAllowanceEncoded = await new web3.eth.Contract(
        ERC20Guild.abi
      ).methods.setAllowance(
        [erc20Guild.address],
        [setConfigSignature],
        []
      ).encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [setAllowanceEncoded],
        value: ["0"],
        description: "Update config",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      await time.increase(time.duration.seconds(31));

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );
    });
    
    it("Proposal for setting new method with empty signature allowance for guild shoudl fail", async function () {
      const setAllowanceEncoded = await new web3.eth.Contract(
        ERC20Guild.abi
      ).methods.setAllowance(
        [actionMock.address],
        ["0x0"],
        [true]
      ).encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [setAllowanceEncoded],
        value: ["0"],
        description: "Set empty allowance",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      
      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal call failed"
      );
      (await erc20Guild.getCallPermission(actionMock.address, "0x0")).should.equal(false);
    });
    
  });
  
  describe("createProposal", function () {
  
    it("cannot create a proposal without enough creation votes", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [votingMachine.address],
          [genericCallData],
          [0],
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[9] }
        ),
        "ERC20Guild: Not enough tokens to create proposal"
      );
    });

    it("cannot create a proposal with uneven _to and _data arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [votingMachine.address],
          [],
          [0],
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with uneven _to and _value arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [votingMachine.address],
          [genericCallData],
          [],
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: Wrong length of to, data or value arrays"
      );
    });

    it("cannot create a proposal with empty _to, _data and _value arrays", async function () {
      await expectRevert(
        erc20Guild.createProposal(
          [],
          [],
          [],
          "Guild Test Proposal",
          constants.NULL_ADDRESS,
          { from: accounts[3] }
        ),
        "ERC20Guild: to, data value arrays cannot be empty"
      );
    });
    
    it("cannot create proposal with an unauthorized function", async function () {
      const testWithNoargsEncoded = await new web3.eth.Contract(ActionMock.abi)
        .methods.testWithNoargs().encodeABI();

      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [actionMock.address],
        data: [testWithNoargsEncoded],
        value: ["0"],
        description: "random function call",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[2],
      });

      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      
      await time.increase(time.duration.seconds(31));

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Not allowed call"
      );
    });
    
  });
  
  describe("endProposal", function () {
    
    it("cannot execute as proposal not ended yet", async function () {
      const customProposal = Object.assign({}, genericProposal);
      const guildProposalId = await createProposal(customProposal);

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal hasnt ended yet"
      );
    });

    it("proposal rejected as not enough tokens to execute proposal when proposal ends", async function () {
      const guildProposalId = await createProposal(genericProposal);

      await time.increase(time.duration.seconds(61));

      await erc20Guild.endProposal(guildProposalId);
      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, constants.WalletSchemeProposalState.rejected);
    });
  });
  
  it("cannot set multiple votes with uneven arrays", async function () {  
    const callDataNegativeVote = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods.vote(walletSchemeProposalId, 2, 0, constants.NULL_ADDRESS).encodeABI();

    const customProposal = Object.assign({}, genericProposal);
    customProposal.data = [callDataNegativeVote];
    const guildProposalId = await createProposal(genericProposal);
    const newGuildProposalId = await createProposal(customProposal);

    await expectRevert(
      erc20Guild.setVotes(
        [guildProposalId, newGuildProposalId],
        [10],
        { from: accounts[5] }
      ),
      "ERC20Guild: Wrong length of proposalIds or amounts"
    );
  });

  describe("setVotes", function () {

    it("can set multiple votes", async function () {
      const tx = await walletScheme.proposeCalls(
        [org.controller.address],
        [genericCallData],
        [0],
        "Test title",
        constants.SOME_HASH
      );
      const walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

      const callDataVote = await new web3.eth.Contract(
        votingMachine.contract.abi
      ).methods.vote(walletSchemeProposalId, 1, 0, constants.NULL_ADDRESS).encodeABI();

      const customProposal = Object.assign({}, genericProposal);
      customProposal.data = [callDataVote];
      const guildProposalId = await createProposal(customProposal);

      const txVote = await erc20Guild.setVotes(
        [guildProposalId, guildProposalId], [10, 10],
        { from: accounts[5] }
      );
      
      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      expectEvent(txVote, "VoteRemoved", { proposalId: guildProposalId });
    });

    it("cannot set votes once executed", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const txVote = await erc20Guild.setVote(guildProposalId, 200, {
        from: accounts[5],
      });
      
      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, constants.WalletSchemeProposalState.executionSuccedd);

      await expectRevert(
        erc20Guild.setVote(guildProposalId, 100, { from: accounts[3] }),
        "ERC20Guild: Proposal already executed"
      );
    });

    it("cannot set votes exceeded your voting balance", async function () {
      const guildProposalId = await createProposal(genericProposal);
      await expectRevert(
        erc20Guild.setVote(guildProposalId, 10000, { from: accounts[5] }),
        "ERC20Guild: Invalid amount"
      );
    });

    it("can reduce the total votes on a proposal", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const txVoteAdd = await erc20Guild.setVote( guildProposalId, 200, { from: accounts[5] } );
      
      if (constants.GAS_PRICE > 1)
        expect(txVoteAdd.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteAdd, "VoteAdded", {
        proposalId: guildProposalId,
        voter: accounts[5],
        amount: "200",
      });
      let totalVotes = await erc20Guild.getProposalVotes(
        guildProposalId,
        accounts[5]
      );
      totalVotes.should.be.bignumber.equal("200");

      const txVoteRemove = await erc20Guild.setVote( guildProposalId, 100, { from: accounts[5] } );
      
      if (constants.GAS_PRICE > 1)
        expect(txVoteRemove.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVoteRemove, "VoteRemoved", {
        proposalId: guildProposalId,
        voter: accounts[5],
        amount: "100",
      });
      totalVotes = await erc20Guild.getProposalVotes(guildProposalId, accounts[5]);
      totalVotes.should.be.bignumber.equal("100");
    });
    
  });
  
  describe("complete proposal process", function() {
    
    it("execute a proposal in walletScheme from the guild", async function () {
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallData],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const organizationProposal = await walletScheme.getOrganizationProposal(walletSchemeProposalId);
      assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
      assert.equal(organizationProposal.callData[0], walletSchemeProposalData);
      assert.equal(organizationProposal.to[0], org.controller.address);
      assert.equal(organizationProposal.value[0], 0);
    });
    
    it("execute a proposal to a contract from the guild", async function () {
      const allowActionMock = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [await new web3.eth.Contract(
          ERC20Guild.abi
        ).methods.setAllowance(
          [actionMock.address],
          [helpers.testCallFrom(erc20Guild.address).substring(0,10)],
          [true]
        ).encodeABI()],
        value: [0],
        description: "Allow vote in voting machine",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: allowActionMock,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(allowActionMock);
      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [actionMock.address],
        data: [helpers.testCallFrom(erc20Guild.address)],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });
      expectEvent.inTransaction(receipt.tx, actionMock, "ReceivedEther");
    });

    it("fail to execute a not allowed proposal to a contract from the guild", async function () {      
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [actionMock.address],
        data: [helpers.testCallFrom(erc20Guild.address)],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Not allowed call"
      )
    });
    
    it("execute a positive vote on the voting machine from the guild", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });

      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });
      const proposalInfo = await erc20Guild.getProposal(guildProposalId);
      assert.equal(proposalInfo.state, constants.WalletSchemeProposalState.executionSuccedd);
      assert.equal(proposalInfo.data[0], genericCallData);
      assert.equal(proposalInfo.to[0], votingMachine.address);
      assert.equal(proposalInfo.value[0], 0);
    });
    

    it("cannot execute a positive vote on the voting machine from the guild twice", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const txVote = await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      if (constants.GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      await time.increase(time.duration.seconds(31));
      const receipt = await erc20Guild.endProposal(guildProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

      const { state } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(state, constants.WalletSchemeProposalState.executionSuccedd);

      await expectRevert(
        erc20Guild.endProposal(guildProposalId),
        "ERC20Guild: Proposal already executed"
      );
    });
    
  });
  
  describe("public view", function () {

    it("can read proposal details of in-flight proposal", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const {
        creator,
        startTime,
        endTime,
        to,
        data,
        value,
        description,
        contentHash,
        totalVotes,
        state,
      } = await erc20Guild.getProposal(guildProposalId);
      assert.equal(creator, accounts[3]);
      const now = await time.latest();
      assert.equal(startTime.toString(), now.toString());
      assert.equal(endTime.toString(), now.add(new BN("30")).toString()); // proposalTime and extra time are 0
      assert.deepEqual(to, [votingMachine.address]);
      assert.deepEqual(data, [genericCallData]);
      assert.deepEqual( value.map((bn) => bn.toString()), ["0"] );
      assert.equal(description, "Guild Test Proposal");
      assert.equal(contentHash, constants.NULL_ADDRESS);
      totalVotes.should.be.bignumber.equal("100");
      assert.equal(state, constants.WalletSchemeProposalState.submitted);
    });

    it("can read votesOf single accounts", async function () {
      const votes = await erc20Guild.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal("100");
    });

    it("can read votesOf multiple accounts", async function () {
      const res = await erc20Guild.methods["votesOf(address[])"]([ accounts[2], accounts[5] ]);
      res[0].should.be.bignumber.equal("100");
      res[1].should.be.bignumber.equal("200");
    });
  
  });
      
  describe("lock/release tokens", function () {
    
    it("can lock tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, {from: accounts[1],});

      const tx = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50" });

      const now = await time.latest();
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[1]);
      amount.should.be.bignumber.equal("50");
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("50");

      const totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal("550");
    });

    it("can release tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      let votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("50");

      let totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal("550");

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      const txRelease = await erc20Guild.releaseTokens(50, { from: accounts[1] });
      expectEvent(txRelease, "TokensReleased", {
        voter: accounts[1],
        value: "50",
      });

      votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal("0");

      totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal("500");
    });

    it("cannot release more token than locked", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      // move past the time lock period
      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      await expectRevert(
        erc20Guild.releaseTokens(100, { from: accounts[1] }),
        "ERC20Guild: Unable to release more tokens than locked"
      );
    });

    it("cannot release before end of timelock", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      await expectRevert(
        erc20Guild.releaseTokens(25, { from: accounts[1] }),
        "ERC20Guild: Tokens still locked"
      );
    });

    it("cannot transfer locked tokens", async function () {
      let bal = await guildToken.balanceOf(accounts[1]);
      bal.should.be.bignumber.equal("50");

      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const txLock = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(txLock, "TokensLocked", { voter: accounts[1], value: "50" });

      bal = await guildToken.balanceOf(accounts[1]);
      bal.should.be.bignumber.equal("0");

      await expectRevert(
        guildToken.transfer(accounts[0], 50, { from: accounts[1] }),
        "ERC20: transfer amount exceeds balance"
      );
    });
    
    it("can lock tokens and check snapshot", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, {from: accounts[1]});

      const tx = await erc20Guild.lockTokens(50, {from: accounts[1]});
      expectEvent(tx, "TokensLocked", {
        voter: accounts[1],
        value: "50",
      });

      const now = await time.latest();
      const { amount, timestamp } = await erc20Guild.tokensLocked(
        accounts[1]
      );
      amount.should.be.bignumber.equal(new BN("50"));
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](
        accounts[1]
      );
      votes.should.be.bignumber.equal(new BN("50"));

      const totalLocked = await erc20Guild.totalLocked();
      totalLocked.should.be.bignumber.equal(new BN("550"));
    });

    it("can lock tokens for multiple accounts and check snapshot", async function () {
      await createProposal({
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallData],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[2],
      });
      await createProposal({
        guild: erc20Guild,
        to: [votingMachine.address],
        data: [genericCallData],
        value: [0],
        description: "Test description",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });
      const res = await erc20Guild.votesOfAt([accounts[2], accounts[3]], [1, 2]);
      res[0].should.be.bignumber.equal(new BN("100"));
      res[1].should.be.bignumber.equal(new BN("100"));
    });

    it("can lock tokens and release tokens", async function () {
      // approve lockable guild to "transfer in" tokens to lock
      await guildToken.approve(tokenVault, 50, { from: accounts[1] });

      const tx = await erc20Guild.lockTokens(50, { from: accounts[1] });
      expectEvent(tx, "TokensLocked", { voter: accounts[1], value: "50" });

      const now = await time.latest();
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[1]);
      amount.should.be.bignumber.equal(new BN("50"));
      timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[1]);
      votes.should.be.bignumber.equal(new BN("50"));

      (await erc20Guild.totalLocked()).should.be.bignumber.equal(new BN("550"));

      await time.latest();
      await time.increase(TIMELOCK.add(new BN("1")));

      await erc20Guild.releaseTokens(50, { from: accounts[1], });
      (await erc20Guild.totalLocked()).should.be.bignumber.equal(new BN("500"));

    });

    it("can lock tokens and create proposal", async function () {
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[2]);
      const now = await time.latest();
      amount.should.be.bignumber.equal(new BN("100"));
      // timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal(new BN("100"));

      await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      const totalLockedAt = await erc20Guild.totalLockedAt(1);
      totalLockedAt.should.be.bignumber.equal(new BN("500"));

      const votesOfAt = await erc20Guild.methods[
        "votesOfAt(address,uint256)"
      ](accounts[2], 1);
      votesOfAt.should.be.bignumber.equal(new BN("100"));
    });

    it("can not lock tokens, create proposal and setVote", async function () {
      const { amount, timestamp } = await erc20Guild.tokensLocked(accounts[2]);
      amount.should.be.bignumber.equal(new BN("100"));
      // timestamp.should.be.bignumber.equal(now.add(TIMELOCK));

      const votes = await erc20Guild.methods["votesOf(address)"](accounts[2]);
      votes.should.be.bignumber.equal(new BN("100"));

      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      const totalLockedAt = await erc20Guild.totalLockedAt(1);
      totalLockedAt.should.be.bignumber.equal(new BN("500"));

      const votesOfAt = await erc20Guild.methods[
        "votesOfAt(address,uint256)"
      ](accounts[2], 1);
      votesOfAt.should.be.bignumber.equal(new BN("100"));

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );

      const txVote = await erc20Guild.setVote(guildProposalId, 10, { from: accounts[2] });
      expectEvent(txVote, "VoteRemoved", { proposalId: guildProposalId });
    });

    it("can not check votesOfAt for invalid nonexistent ID", async function () {    
      await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[2] }
      );

      await expectRevert(
        erc20Guild.methods["votesOfAt(address,uint256)"](accounts[2], 3),
        "ERC20Guild: nonexistent id"
      );
    });

    it("can check votesOfAt for invalid ID", async function () {
      await expectRevert(
        erc20Guild.methods["votesOfAt(address,uint256)"](accounts[2], 0),
        "ERC20Guild: id is 0"
      );
    });
  });
  describe("refund votes", function () {
    
    beforeEach(async function(){
      const guildProposalId = await createProposal({
        guild: erc20Guild,
        to: [erc20Guild.address],
        data: [
          await new web3.eth.Contract(
            ERC20Guild.abi
          ).methods.setConfig(30, 30, 200, 100, VOTE_GAS, MAX_GAS_PRICE, 1).encodeABI()
        ],
        value: [0],
        description: "Guild Test Proposal",
        contentHash: constants.NULL_ADDRESS,
        account: accounts[3],
      });
      await setAllVotesOnProposal({
        guild: erc20Guild,
        proposalId: guildProposalId,
        account: accounts[5],
      });
      await time.increase(time.duration.seconds(31));
      await erc20Guild.endProposal(guildProposalId);
    })
    
    describe("with high gas vote setting (above cost) and standard gas price", function () {

      it("can pay ETH to the guild (ot cover votes)", async function () {
        const tracker = await balance.tracker(erc20Guild.address);
        let guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO); // empty

        await send.ether(accounts[5], erc20Guild.address, VOTE_GAS, { from: accounts[5] });

        guildBalance = await tracker.delta();
        guildBalance.should.be.bignumber.equal(VOTE_GAS);
      });

      it("can set a vote and refund gas", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(erc20Guild.address);

        // send ether to cover gas
        await send.ether(accounts[0], erc20Guild.address, ether("10"), { from: accounts[0] });
        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ether("10"));

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await erc20Guild.setVote(guildProposalId, 100, {
          from: accounts[2], gasPrice: REAL_GAS_PRICE
        });
        expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

        if (constants.GAS_PRICE > 1) {
          const txGasUsed = txVote.receipt.gasUsed;

          // mul by -1 as balance has decreased
          guildBalance = await guildTracker.delta();
          guildBalance.should.be.bignumber.equal(
            VOTE_GAS.mul(MAX_GAS_PRICE).neg()
          );
          // account 1 should have a refund
          // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
          let accounts1Balance = await tracker.delta();
          accounts1Balance.neg().should.be.bignumber.equal(
            new BN(txGasUsed).mul(REAL_GAS_PRICE).sub(VOTE_GAS.mul(MAX_GAS_PRICE))
          );
        }
      });

      it("can set a vote but no refund as contract has no ether", async function () {
        const guildProposalId = await createProposal(genericProposal);

        const guildTracker = await balance.tracker(erc20Guild.address);

        let guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(ZERO);

        const tracker = await balance.tracker(accounts[2]);

        const txVote = await erc20Guild.setVote(guildProposalId, 100, {
          from: accounts[2], gasPrice: REAL_GAS_PRICE
        });
        expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

        if (constants.GAS_PRICE > 1) {
          const txGasUsed = txVote.receipt.gasUsed;

          // no change as still no ether
          guildBalance = await guildTracker.delta();
          guildBalance.should.be.bignumber.equal(ZERO);

          // account 1 has paid as normal for the vote
          let accounts1Balance = await tracker.delta();
          accounts1Balance.should.be.bignumber.equal(
            new BN(txGasUsed).mul(REAL_GAS_PRICE).neg()
          );
        }
      });
      
      it("execute a proposal in walletScheme from the guild", async function () {
        walletSchemeProposalData = helpers.encodeGenericCallData(
          org.avatar.address, actionMock.address, helpers.testCallFrom(org.avatar.address), 0
        )
        const tx = await walletScheme.proposeCalls(
          [org.controller.address],
          [walletSchemeProposalData],
          [0],
          "Test title",
          constants.SOME_HASH
        );
        const walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");

        const genericCallData = await new web3.eth.Contract(
          votingMachine.contract.abi
        ).methods.vote(walletSchemeProposalId, 1, 0, constants.NULL_ADDRESS).encodeABI();
      
        const guildProposalId = await createProposal({
          guild: erc20Guild,
          to: [votingMachine.address],
          data: [genericCallData],
          value: [0],
          description: "Guild Test Proposal",
          contentHash: constants.NULL_ADDRESS,
          account: accounts[3],
        });

        const txVote = await setAllVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalId,
          account: accounts[5],
        });

        if (constants.GAS_PRICE > 1)
          expect(txVote.receipt.gasUsed).to.be.below(80000);

        expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

        await time.increase(time.duration.seconds(31));
        const receipt = await erc20Guild.endProposal(guildProposalId);
        expectEvent(receipt, "ProposalExecuted", { proposalId: guildProposalId });

        const organizationProposal = await walletScheme.getOrganizationProposal(walletSchemeProposalId);
        assert.equal(organizationProposal.state, constants.WalletSchemeProposalState.executionSuccedd);
        assert.equal(organizationProposal.callData[0], walletSchemeProposalData);
        assert.equal(organizationProposal.to[0], org.controller.address);
        assert.equal(organizationProposal.value[0], 0);
      });
      
    });

    it("only refunds upto max gas price", async function () {
      const guildProposalId = await createProposal(genericProposal);

      const guildTracker = await balance.tracker(erc20Guild.address);

      // send ether to cover gas
      await send.ether(accounts[0], erc20Guild.address, ether("10"), { from: accounts[0] });
      let guildBalance = await guildTracker.delta();
      guildBalance.should.be.bignumber.equal(ether("10"));

      const tracker = await balance.tracker(accounts[2]);

      const txVote = await erc20Guild.setVote(guildProposalId, 100, {
        from: accounts[2], gasPrice: MAX_GAS_PRICE.add(new BN("50"))
      });
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      if (constants.GAS_PRICE > 1) {
        const txGasUsed = txVote.receipt.gasUsed;

        // mul by -1 as balance has decreased
        guildBalance = await guildTracker.delta();
        guildBalance.should.be.bignumber.equal(
          VOTE_GAS.mul(MAX_GAS_PRICE).neg()
        );
        // account 1 should have a refund
        // the gas for the vote multipled by set gas price minus the real cost of gas multiplied by gas price
        let accounts1Balance = await tracker.delta();
        accounts1Balance.neg().should.be.bignumber.equal(
          new BN(txGasUsed).mul(MAX_GAS_PRICE.add(new BN("50"))).sub(VOTE_GAS.mul(MAX_GAS_PRICE))
        );
      }
    });
  });
  
  describe("Signed votes", function () {
    it("can hash a vote", async function () {
      const hashedVote = await erc20Guild.hashVote(accounts[1], web3.utils.asciiToHex("abc123"), 50);
      hashedVote.should.exist;
    });

    it("can set a vote", async function () {
      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );
      const hashedVote = await erc20Guild.hashVote(accounts[2], guildProposalId, 50);
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId, 50, accounts[2], signature,
        { from: accounts[3] }
      );

      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });

      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(true);
    });

    it("can set multiple votes", async function () {
      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[4] }
      );

      const guildProposalId = await helpers.getValueFromLogs(txGuild, "proposalId", "ProposalCreated");

      const hashedVote1 = await erc20Guild.hashVote(accounts[2], guildProposalId, 50);
      const hashedVote2 = await erc20Guild.hashVote(accounts[3], guildProposalId, 50);

      const signature1 = fixSignature(
        await web3.eth.sign(hashedVote1, accounts[2])
      );
      const signature2 = fixSignature(
        await web3.eth.sign(hashedVote2, accounts[3])
      );

      const txVote = await erc20Guild.methods[
        "setSignedVotes(bytes32[],uint256[],address[],bytes[])"
      ](
        [guildProposalId, guildProposalId],
        [50, 50],
        [accounts[2], accounts[3]],
        [signature1, signature2],
        { from: accounts[4] }
      );

      const addedEvents = txVote.logs.filter(
        (evt) => evt.event === "VoteAdded"
      );
      addedEvents.length.should.be.equal(2);

      (await erc20Guild.signedVotes(hashedVote1)).should.be.equal(true);
      (await erc20Guild.signedVotes(hashedVote2)).should.be.equal(true);
    });

    it("cannot set a signed vote twice", async function () {
      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );
      const hashedVote = await erc20Guild.hashVote(accounts[2], guildProposalId, 50);
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[2])
      );
      accounts[2].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      const txVote = await erc20Guild.setSignedVote(
        guildProposalId,
        50,
        accounts[2],
        signature,
        { from: accounts[3] }
      );
      expectEvent(txVote, "VoteAdded", { proposalId: guildProposalId });
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(true);

      await expectRevert(
        erc20Guild.setSignedVote(
          guildProposalId,
          50,
          accounts[2],
          signature,
          { from: accounts[3] }
        ),
        "ERC20Guild: Already voted"
      );
    });

    it("cannot set a vote if wrong signer", async function () {
      const txGuild = await erc20Guild.createProposal(
        [votingMachine.address],
        [genericCallData],
        [0],
        "Guild Test Proposal",
        constants.NULL_ADDRESS,
        { from: accounts[3] }
      );

      const guildProposalId = await helpers.getValueFromLogs(
        txGuild,
        "proposalId",
        "ProposalCreated"
      );
      const hashedVote = await erc20Guild.hashVote(accounts[1], guildProposalId, 50);
      (await erc20Guild.signedVotes(hashedVote)).should.be.equal(false);

      const signature = fixSignature(
        await web3.eth.sign(hashedVote, accounts[0])
      ); // wrong signer
      accounts[0].should.be.equal(
        web3.eth.accounts.recover(hashedVote, signature)
      );

      // now call from different account aka accounts[1]
      await expectRevert(
        erc20Guild.setSignedVote(
          guildProposalId,
          50,
          accounts[1],
          signature,
          { from: accounts[1] }
        ),
        "ERC20Guild: Wrong signer"
      );
    });
    
  });
  
});
