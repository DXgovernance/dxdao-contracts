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

  const minProposalTime = new BN("0");
  const votesForExecution = new BN("200");
  const votesForCreation = new BN("100");

  beforeEach(async function () {
    const guildTokenBalances = [
      new BN("1000"),
      new BN("50"),
      new BN("100"),
      new BN("100"),
      new BN("100"),
      new BN("200"),
    ];

    guildToken = await createAndSetupGuildToken(
      accounts.slice(0, 6),
      guildTokenBalances
    );

    erc20GuildPermissioned = await ERC20GuildPermissioned.new();
    await erc20GuildPermissioned.initialize(
      guildToken.address,
      minProposalTime,
      votesForExecution,
      votesForCreation
    );

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
          await newGuild.initialize(
            helpers.NULL_ADDRESS,
            new BN("10"),
            new BN("10"),
            new BN("10")
          );
          assert(false, "ERC20Guild: token is the zero address");
        } catch (error) {
          helpers.assertVMException(error);
        }
      });

      it("cannot initialize twice", async function () {
        try {
          await erc20GuildPermissioned.initialize(
            guildToken.address,
            new BN("10"),
            new BN("10"),
            new BN("10")
          );
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
        (
          await erc20GuildPermissioned.minimumProposalTime()
        ).should.be.bignumber.equal(minProposalTime);
        (
          await erc20GuildPermissioned.votesForExecution()
        ).should.be.bignumber.equal(votesForExecution);
        (
          await erc20GuildPermissioned.votesForCreation()
        ).should.be.bignumber.equal(votesForCreation);

        // Create proposal for updated values
        const updatedMinimumProposalTime = new BN("1");
        const updatedVotesForExecution = new BN("100");
        const updatedVotesForCreation = new BN("50");
        const setConfigFunctionEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods
          .setConfig(
            updatedMinimumProposalTime,
            updatedVotesForExecution,
            updatedVotesForCreation
          )
          .encodeABI();

        const proposalIdGuild = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setConfigFunctionEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          extraTime: "0",
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: proposalIdGuild,
          account: accounts[5],
        });

        await time.increaseTo("10000009999");

        await erc20GuildPermissioned.executeProposal(proposalIdGuild);

        // Check values are updated
        (
          await erc20GuildPermissioned.minimumProposalTime()
        ).should.be.bignumber.equal(updatedMinimumProposalTime);
        (
          await erc20GuildPermissioned.votesForExecution()
        ).should.be.bignumber.equal(updatedVotesForExecution);
        (
          await erc20GuildPermissioned.votesForCreation()
        ).should.be.bignumber.equal(updatedVotesForCreation);
      });

      it("Proposal for setting new method allowance for guild is successful (setAllowance)", async function () {
        const setConfigSignature = web3.eth.abi.encodeFunctionSignature(
          "setConfig(uint256,uint256,uint256)"
        );

        const setAllowanceEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods
          .setAllowance(
            [erc20GuildPermissioned.address],
            [setConfigSignature],
            [false]
          )
          .encodeABI();

        const proposalIdGuild = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setAllowanceEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          extraTime: "0",
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: proposalIdGuild,
          account: accounts[5],
        });

        await erc20GuildPermissioned.executeProposal(proposalIdGuild);

        // Check existing values are as expected
        (
          await erc20GuildPermissioned.minimumProposalTime()
        ).should.be.bignumber.equal(minProposalTime);
        (
          await erc20GuildPermissioned.votesForExecution()
        ).should.be.bignumber.equal(votesForExecution);
        (
          await erc20GuildPermissioned.votesForCreation()
        ).should.be.bignumber.equal(votesForCreation);

        // Create proposal for updated values
        const updatedMinimumProposalTime = new BN("1");
        const updatedVotesForExecution = new BN("100");
        const updatedVotesForCreation = new BN("50");
        const setConfigFunctionEncoded = await new web3.eth.Contract(
          ERC20GuildPermissioned.abi
        ).methods
          .setConfig(
            updatedMinimumProposalTime,
            updatedVotesForExecution,
            updatedVotesForCreation
          )
          .encodeABI();

        const setConfigProposalIdGuild = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setConfigFunctionEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          extraTime: "0",
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: setConfigProposalIdGuild,
          account: accounts[5],
        });

        await time.increaseTo("10000099999");

        await expectRevert(
          erc20GuildPermissioned.executeProposal(setConfigProposalIdGuild),
          "ERC20GuildPermissioned: Not allowed call"
        );

        // Check values are still the same
        (
          await erc20GuildPermissioned.minimumProposalTime()
        ).should.be.bignumber.equal(minProposalTime);
        (
          await erc20GuildPermissioned.votesForExecution()
        ).should.be.bignumber.equal(votesForExecution);
        (
          await erc20GuildPermissioned.votesForCreation()
        ).should.be.bignumber.equal(votesForCreation);
      });

      it("Reverts when trying to get the permissioned guild to call an unauthorized method", async function () {
        const testWithNoargsEncoded = await new web3.eth.Contract(
          ActionMock.abi
        ).methods
          .testWithNoargs()
          .encodeABI();

        const proposalIdGuild = await createProposal({
          guild: erc20GuildPermissioned,
          to: [actionMock.address],
          data: [testWithNoargsEncoded],
          value: ["0"],
          description: "random function call",
          contentHash: helpers.NULL_ADDRESS,
          extraTime: "0",
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: proposalIdGuild,
          account: accounts[5],
        });

        await expectRevert(
          erc20GuildPermissioned.executeProposal(proposalIdGuild),
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
        ).methods
          .setAllowance(
            [erc20GuildPermissioned.address],
            [setConfigSignature],
            []
          )
          .encodeABI();

        const proposalIdGuild = await createProposal({
          guild: erc20GuildPermissioned,
          to: [erc20GuildPermissioned.address],
          data: [setAllowanceEncoded],
          value: ["0"],
          description: "Update config",
          contentHash: helpers.NULL_ADDRESS,
          extraTime: "0",
          account: accounts[2],
        });

        await setAllVotesOnProposal({
          guild: erc20GuildPermissioned,
          proposalId: proposalIdGuild,
          account: accounts[5],
        });

        await time.increaseTo("10000199999");

        await expectRevert(
          erc20GuildPermissioned.executeProposal(proposalIdGuild),
          "ERC20Guild: Proposal call failed"
        );
      });
    });
  });
});
