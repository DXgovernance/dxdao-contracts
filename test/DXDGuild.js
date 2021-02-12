import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const DXDGuild = artifacts.require("DXDGuild.sol");
const ActionMock = artifacts.require("ActionMock.sol");
const { fixSignature } = require("./helpers/sign");
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
} = require("./helpers/guild");

require("chai").should();

contract("DXDGuild", function (accounts) {
  
  const ZERO = new BN("0");
  const TIMELOCK = new BN("60");
  const VOTE_GAS = new BN("50000"); // 50k
  const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei
  const REAL_GAS_PRICE = new BN(constants.ARC_GAS_PRICE); // 8 gwei (check config)

  let walletScheme,
    daoCreator,
    org,
    actionMock,
    votingMachine,
    guildToken,
    dxdGuild,
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
    dxdGuild = await DXDGuild.new();
    
    const createDaoResult = await createDAO(dxdGuild, accounts);
    daoCreator = createDaoResult.daoCreator;
    walletScheme = createDaoResult.walletScheme;
    votingMachine = createDaoResult.votingMachine;
    org = createDaoResult.org;
    actionMock = await ActionMock.new();
    await dxdGuild.methods['initialize(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address)'](
      guildToken.address, 30, 30, 200, 100, VOTE_GAS, MAX_GAS_PRICE, TIMELOCK, votingMachine.address
    );
    tokenVault = await dxdGuild.tokenVault();

    await guildToken.approve(tokenVault, 100, { from: accounts[2] });
    await guildToken.approve(tokenVault, 100, { from: accounts[3] });
    await guildToken.approve(tokenVault, 100, { from: accounts[4] });
    await guildToken.approve(tokenVault, 200, { from: accounts[5] });

    await dxdGuild.lockTokens(100, { from: accounts[2] });
    await dxdGuild.lockTokens(100, { from: accounts[3] });
    await dxdGuild.lockTokens(100, { from: accounts[4] });
    await dxdGuild.lockTokens(200, { from: accounts[5] });
    
    tokenVault = await dxdGuild.tokenVault();

    const allowVotingMachineProposalId = await createProposal({
      guild: dxdGuild,
      to: [dxdGuild.address],
      data: [await new web3.eth.Contract(
        DXDGuild.abi
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
      guild: dxdGuild,
      proposalId: allowVotingMachineProposalId,
      account: accounts[5],
    });
    await time.increase(time.duration.seconds(31));
    await dxdGuild.endProposal(allowVotingMachineProposalId);
    
    walletSchemeProposalData = helpers.encodeGenericCallData(
      org.avatar.address, actionMock.address, helpers.testCallFrom(org.avatar.address), 0
    )
    const tx = await walletScheme.proposeCalls(
      [org.controller.address],
      [walletSchemeProposalData],
      [0],
      "Test Title",
      helpers.SOME_HASH
    );
    walletSchemeProposalId = await helpers.getValueFromLogs(tx, "_proposalId");
    genericCallData = await new web3.eth.Contract(
      votingMachine.contract.abi
    ).methods.vote(walletSchemeProposalId, 1, 0, helpers.NULL_ADDRESS).encodeABI();
  });

  describe("DXDGuild", function () {

    it.only("execute a positive vote on the voting machine from the dxd-guild", async function () {
      const tx = await dxdGuild.createVotingMachineProposal(walletSchemeProposalId, {from: accounts[2]} );

      const positiveVoteProposalId = tx.logs[0].args.proposalId;
      const negativeVoteProposalId = tx.logs[2].args.proposalId;

      console.log(positiveVoteProposalId, negativeVoteProposalId);
      
      const txVote = await setAllVotesOnProposal({
        guild: dxdGuild,
        proposalId: positiveVoteProposalId,
        account: accounts[5],
      });

      if (constants.ARC_GAS_PRICE > 1)
        expect(txVote.receipt.gasUsed).to.be.below(80000);

      expectEvent(txVote, "VoteAdded", { proposalId: positiveVoteProposalId });
      await time.increase(time.duration.seconds(31));
      const receipt = await dxdGuild.endProposal(positiveVoteProposalId);
      expectEvent(receipt, "ProposalExecuted", { proposalId: positiveVoteProposalId });
      const proposalInfo = await dxdGuild.getProposal(positiveVoteProposalId);
      assert.equal(proposalInfo.state, GUILD_PROPOSAL_STATES.executed);
      assert.equal(proposalInfo.to[0], votingMachine.address);
      assert.equal(proposalInfo.value[0], 0);
    });
  });
});
