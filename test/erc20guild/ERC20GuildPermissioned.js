import * as helpers from "../helpers";

const ERC20GuildPermissioned = artifacts.require("ERC20GuildPermissioned.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const { BN, expectRevert, time } = require("@openzeppelin/test-helpers");
const {
  createDAO,
  createAndSetupGuildToken,
  createProposal,
  setAllVotesOnProposal,
} = require("../helpers/guild");

require("chai").should();

contract("ERC20GuildPermissioned", function (accounts) {
  let walletScheme,
    daoCreator,
    org,
    actionMock,
    votingMachine,
    guildToken,
    erc20GuildPermissioned;

  const proposalTime = 30;
  const votesForExecution = 200;
  const votesForCreation = 100;

  beforeEach(async function () {
    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6), [1000, 50, 100, 100, 100, 200]
    );
    
    erc20GuildPermissioned = await ERC20GuildPermissioned.new();
    await erc20GuildPermissioned.initialize(guildToken.address, 30, 200, 100, "TestGuild");
    
    actionMock = await ActionMock.new();
    const createDaoResult = await createDAO(erc20GuildPermissioned, accounts);
    daoCreator = createDaoResult.daoCreator;
    walletScheme = createDaoResult.walletScheme;
    votingMachine = createDaoResult.votingMachine;
    org = createDaoResult.org;

  });

  describe("ERC20GuildPermissioned Core Tests", function () {
    describe("Initialization", function () {
      it("cannot initialize with zero address", async function () {
        try {
          const newGuild = await ERC20GuildPermissioned.new();
          await newGuild.initialize(helpers.NULL_ADDRESS, 10, 10, 10, "TestGuild");
          assert(false, "ERC20Guild: token is the zero address");
        } catch (error) {
          helpers.assertVMException(error);
        }
      });

      it("cannot initialize twice", async function () {
        try {
          await erc20GuildPermissioned.initialize(guildToken.address, 10, 10, 10, "TestGuild");
          assert(
            false,
            "ERC20Guild: Only callable by ERC20guild itself when initialized"
          );
        } catch (error) {
          helpers.assertVMException(error);
        }
      });
    });

    describe("Proposals which use the call permissions defined by initialize()", function () {
      it("Proposal for updating the config is successful (setConfig)", async function () {
        // Check existing values are as expected
        (await erc20GuildPermissioned.proposalTime())
          .should.be.bignumber.equal(new BN(proposalTime));
        (await erc20GuildPermissioned.votesForExecution())
          .should.be.bignumber.equal(new BN(votesForExecution));
        (await erc20GuildPermissioned.votesForCreation())
          .should.be.bignumber.equal(new BN(votesForCreation));

        // Create proposal for updated values
        const updatedproposalTime = 31;
        const updatedVotesForExecution = 100;
        const updatedVotesForCreation = 50;
        const setConfigFunctionEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods
          .setConfig(
            updatedproposalTime,
            updatedVotesForExecution,
            updatedVotesForCreation
          )
          .encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setConfigFunctionEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: guildProposalId,
          account: accounts[5],
        });

        await time.increase(time.duration.seconds(31));

        await erc20GuildPermissioned.executeProposal(guildProposalId);

        // Check values are updated
        (await erc20GuildPermissioned.proposalTime())
          .should.be.bignumber.equal(new BN(updatedproposalTime));
        (await erc20GuildPermissioned.votesForExecution())
          .should.be.bignumber.equal(new BN(updatedVotesForExecution));
        (await erc20GuildPermissioned.votesForCreation())
          .should.be.bignumber.equal(new BN(updatedVotesForCreation));
      });

      it("Proposal for setting new method allowance for guild is successful (setAllowance)", async function () {
        const setConfigSignature = web3.eth.abi.encodeFunctionSignature(
          "setConfig(uint256,uint256,uint256)"
        );

        const setAllowanceEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods.setAllowance(
          [erc20GuildPermissioned.address],
          [setConfigSignature],
          [false]
        ).encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setAllowanceEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: guildProposalId,
          account: accounts[5],
        });
        
        await time.increase(time.duration.seconds(31));
        await erc20GuildPermissioned.executeProposal(guildProposalId);

        // Check existing values are as expected
        (await erc20GuildPermissioned.proposalTime())
          .should.be.bignumber.equal(new BN(proposalTime));
        (await erc20GuildPermissioned.votesForExecution())
          .should.be.bignumber.equal(new BN(votesForExecution));
        (await erc20GuildPermissioned.votesForCreation())
          .should.be.bignumber.equal(new BN(votesForCreation));

        // Create proposal for updated values
        const updatedproposalTime = 1;
        const updatedVotesForExecution = 100;
        const updatedVotesForCreation = 50;
        const setConfigFunctionEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods.setConfig(
          updatedproposalTime,
          updatedVotesForExecution,
          updatedVotesForCreation
        ).encodeABI();

        const setConfigguildProposalId = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setConfigFunctionEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: setConfigguildProposalId,
          account: accounts[5],
        });

        await time.increase(time.duration.seconds(31));
        await expectRevert(
          erc20GuildPermissioned.executeProposal(setConfigguildProposalId),
          "ERC20GuildPermissioned: Not allowed call"
        );

        // Check values are still the same
        (await erc20GuildPermissioned.proposalTime())
          .should.be.bignumber.equal(new BN(proposalTime));
        (await erc20GuildPermissioned.votesForExecution())
          .should.be.bignumber.equal(new BN(votesForExecution));
        (await erc20GuildPermissioned.votesForCreation())
          .should.be.bignumber.equal(new BN(votesForCreation));
      });
      
      it("Proposal for setting new method with empty signatyre allowance for guild shoudl fail", async function () {
        const setAllowanceEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods.setAllowance(
          [actionMock.address],
          ["0x0"],
          [true]
        ).encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setAllowanceEncoded],
          value: ["0"],
          description: "Set empty allowance",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: guildProposalId,
          account: accounts[5],
        });
        
        await time.increase(time.duration.seconds(31));
        await expectRevert(
          erc20GuildPermissioned.executeProposal(guildProposalId),
          "ERC20Guild: Proposal call failed"
        );
        (await erc20GuildPermissioned.getCallPermission(actionMock.address, "0x0")).should.equal(false);
      });

      it("Reverts when trying to get the permissioned guild to call an unauthorized method", async function () {
        const testWithNoargsEncoded = await new web3.eth.Contract(ActionMock.abi)
          .methods.testWithNoargs().encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20GuildPermissioned,
          to: [actionMock.address],
          data: [testWithNoargsEncoded],
          value: ["0"],
          description: "random function call",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: guildProposalId,
          account: accounts[5],
        });

        await expectRevert(
          erc20GuildPermissioned.executeProposal(guildProposalId),
          "ERC20GuildPermissioned: Not allowed call"
        );
      });
    });

    describe("setAllowance()", function () {
      it("Reverts when not called by guild", async function () {
        await expectRevert(
          erc20GuildPermissioned.setAllowance([], [], []),
          "ERC20Guild: Only callable by ERC20guild itself"
        );
      });

      it("Reverts when proposal exec calls setAllowance with invalid params", async function () {
        const setConfigSignature = web3.eth.abi.encodeFunctionSignature(
          "setConfig(uint256,uint256,uint256)"
        );

        const setAllowanceEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods.setAllowance(
          [erc20GuildPermissioned.address],
          [setConfigSignature],
          []
        ).encodeABI();

        const guildProposalId = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setAllowanceEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: guildProposalId,
          account: accounts[5],
        });

        await time.increase(time.duration.seconds(31));

        await expectRevert(
          erc20GuildPermissioned.executeProposal(guildProposalId),
          "ERC20Guild: Proposal call failed"
        );
      });
    });
  });
});
