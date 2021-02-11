import * as helpers from "../helpers";
const constants = require("../helpers/constants");
const ERC20Guild = artifacts.require("ERC20Guild.sol");
const IERC20Guild = artifacts.require("IERC20Guild.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const {
  BN,
  expectEvent,
  expectRevert,
  balance,
  send,
  ether,
  time
} = require("@openzeppelin/test-helpers");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal,
  GUILD_PROPOSAL_STATES
} = require("../helpers/guild");

require("chai").should();

contract("ERC20Guild", function (accounts) {
  const ZERO = new BN("0");

  let walletScheme,
    daoCreator,
    org,
    actionMock,
    votingMachine,
    guildToken,
    erc20Guild,
    tokenVault,
    genericCallDataVote,
    callData,
    genericCallData,
    walletSchemeProposalId,
    genericProposal;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20Guild = await ERC20Guild.new();
    await erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 1);
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
      contentHash: helpers.NULL_ADDRESS,
      account: accounts[3],
    });
    await setAllVotesOnProposal({
      guild: erc20Guild,
      proposalId: allowVotingMachineProposalId,
      account: accounts[5],
    });
    await time.increase(time.duration.seconds(31));
    await erc20Guild.endProposal(allowVotingMachineProposalId);
  });

  describe("ERC20Guild Core Tests", function () {
    describe("Initialization", function () {

      it("cannot initialize twice", async function () {
        erc20Guild = await ERC20Guild.at(erc20Guild.address);
        await expectRevert(
          erc20Guild.initialize(guildToken.address, 30, 30, 200, 100, "TestGuild", 0, 0, 1),
          "ERC20Guild: Only callable by ERC20guild itself when initialized"
        );
      });
    });

    describe("Proposals which use the call permissions defined by initialize()", function () {
      it("Proposal for updating the config is successful (setConfig)", async function () {
        // Check existing values are as expected
        (await erc20Guild.proposalTime())
          .should.be.bignumber.equal(new BN(30));
        (await erc20Guild.votesForExecution())
          .should.be.bignumber.equal(new BN(200));
        (await erc20Guild.votesForCreation())
          .should.be.bignumber.equal(new BN(100));

        // Create proposal for updated values
        const updatedproposalTime = 31;
        const updatedExecutionTime = 31;
        const updatedVotesForExecution = 100;
        const updatedVotesForCreation = 50;
        const setConfigFunctionEncoded = await new web3.eth.Contract(
          ERC20Guild.abi
        ).methods
          .setConfig(
            updatedproposalTime,
            updatedExecutionTime,
            updatedVotesForExecution,
            updatedVotesForCreation,
            0, 0, 1
          )
          .encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20Guild,
          to: [erc20Guild.address],
          data: [setConfigFunctionEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20Guild,
          proposalId: guildProposalId,
          account: accounts[5],
        });

        await time.increase(time.duration.seconds(31));

        await erc20Guild.endProposal(guildProposalId);

        // Check values are updated
        (await erc20Guild.proposalTime())
          .should.be.bignumber.equal(new BN(updatedproposalTime));
        (await erc20Guild.votesForExecution())
          .should.be.bignumber.equal(new BN(updatedVotesForExecution));
        (await erc20Guild.votesForCreation())
          .should.be.bignumber.equal(new BN(updatedVotesForCreation));
      });
      
      it("Proposal for setting new method with empty signatyre allowance for guild shoudl fail", async function () {
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
          contentHash: helpers.NULL_ADDRESS,
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

      it("Reverts when trying to get the permissioned guild to call an unauthorized method", async function () {
        const testWithNoargsEncoded = await new web3.eth.Contract(ActionMock.abi)
          .methods.testWithNoargs().encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20Guild,
          to: [actionMock.address],
          data: [testWithNoargsEncoded],
          value: ["0"],
          description: "random function call",
          contentHash: helpers.NULL_ADDRESS,
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

    describe("setAllowance()", function () {
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
          contentHash: helpers.NULL_ADDRESS,
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
    });
  });
});
