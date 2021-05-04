import * as helpers from "./helpers";
const constants = require("./helpers/constants");
const OMNGuild = artifacts.require("OMNGuild");
const Realitio = artifacts.require("Realitio");
const { soliditySha3 } = require("web3-utils");
const {
    fixSignature
} = require("./helpers/sign");
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
    createAndSetupGuildToken,
    createProposal,
} = require("./helpers/guild");

require("chai").should();

contract("OMNGuild", function(accounts) {

    const ZERO = new BN("0");
    const TIMELOCK = new BN("60");
    const VOTE_GAS = new BN("50000"); // 50k
    const MAX_GAS_PRICE = new BN("8000000000"); // 8 gwei
    const OMN_REWARD = 6;

    let guildToken,
        omnGuild,
        realitio,
        tokenVault,
        callData,
        genericCallData,
        questionId,
        genericProposal;

    beforeEach(async function() {
        guildToken = await createAndSetupGuildToken(
            accounts.slice(0, 5), [100, 50, 150, 150, 200]
        );
        omnGuild = await OMNGuild.new();
        realitio = await Realitio.new();
        await guildToken.transfer(omnGuild.address, 50, { from: accounts[2] });

        await omnGuild.initialize(
            guildToken.address,  //  _token:
            60*60*24*7,  //  _proposalTime:
            130000,  //  _timeForExecution:
            40,  //  _votesForExecution:
            10,  //  _votesForCreation:
            VOTE_GAS,  //  _voteGas:
            MAX_GAS_PRICE,  //  _maxGasPrice:
            TIMELOCK,  //  _lockTime:
            99999,  //  _maxAmountVotes:
            realitio.address,  //  _realitIO:
        );


        tokenVault = await omnGuild.tokenVault();

        await guildToken.approve(tokenVault, 60);
        await guildToken.approve(tokenVault, 50, { from: accounts[1] });
        await guildToken.approve(tokenVault, 100, { from: accounts[2] });
        await guildToken.approve(tokenVault, 150, { from: accounts[3] });
        await guildToken.approve(tokenVault, 200, { from: accounts[4] });

        await omnGuild.lockTokens(60);
        await omnGuild.lockTokens(50, { from: accounts[1] });
        await omnGuild.lockTokens(100, { from: accounts[2] });
        await omnGuild.lockTokens(150, { from: accounts[3] });
        await omnGuild.lockTokens(200, { from: accounts[4] });

        tokenVault = await omnGuild.tokenVault();
        
        const data = await new web3.eth.Contract(
              OMNGuild.abi
            ).methods.setOMNGuildConfig(
                1100, /// _maxAmountVotes The max amount of votes allowed ot have
                realitio.address, 
                2*OMN_REWARD, /// _successfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a successful  vote
                OMN_REWARD /// _unsuccessfulVoteReward The amount of OMN tokens in wei unit to be reward to a voter after a unsuccessful vote
              ).encodeABI()
        const guildProposalId = await createProposal({
          guild: omnGuild,
          to: [omnGuild.address],
          data: [ data ],
          value: [0],
          description: "setOMNGuildConfig description",
          contentHash: constants.NULL_ADDRESS,
          account: accounts[0],
        });

        await time.increase(time.duration.seconds(60*60*24*7+1000));

        await omnGuild.endProposal(guildProposalId);

        // I.B.1.a
        const latest=(await time.latest()).toNumber();
        questionId = (await realitio.askQuestion(0 /* template_id */ , "Is market with [questionID] valid?", omnGuild.address, 60*60*24*2 /* timeout, */ , latest /* opening_ts */ , 0 /* nonce */ )).receipt.logs[0].args.question_id;

        // I.B.1.b
        await realitio.submitAnswer(questionId, soliditySha3((true)), 0, {
            value: 1
        });
        await realitio.submitAnswer(questionId, soliditySha3((false)), 0, {
            value: 2
        });

    });

    describe("OMNGuild", function() {

        it("vote on and execute a market validation proposal from the omn-guild", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);  // I.B.2.b

            const marketValidationProposalValid = tx.logs[0].args.proposalId;
            const marketValidationProposalInvalid = tx.logs[2].args.proposalId;

            await expectRevert(
                omnGuild.endProposal(marketValidationProposalValid),
                "OMNGuild: Use endMarketValidationProposal to end proposals to validate market"
            );
            await expectRevert(
                omnGuild.endMarketValidationProposal(questionId),
                "OMNGuild: Market valid proposal hasnt ended yet"
            );
            const votes = await omnGuild.methods['votesOf(address)'](accounts[4]); // overloaded function which is not supported by truffle
            const txVote = await omnGuild.setVote(
                marketValidationProposalValid,
                votes, {
                    from: accounts[4]
                });

            expectEvent(txVote, "VoteAdded", {
                proposalId: marketValidationProposalValid
            });

            await time.increase(time.duration.seconds(60*60*24*7+1000));

            if (constants.ARC_GAS_PRICE > 1)
                expect(txVote.receipt.gasUsed).to.be.below(80000);

            await expectRevert(
                omnGuild.endProposal(marketValidationProposalValid),
                "OMNGuild: Use endMarketValidationProposal to end proposals to validate market"
            );
            const receipt = await omnGuild.endMarketValidationProposal(questionId);
            expectEvent(receipt, "ProposalExecuted", {
                proposalId: marketValidationProposalValid
            });
            await expectRevert(
                omnGuild.endMarketValidationProposal(questionId),
                "OMNGuild: Market valid proposal already executed"
            );
            const proposalInfo = await omnGuild.getProposal(marketValidationProposalValid);
            assert.equal(proposalInfo.state, constants.GuildProposalState.Executed);
            assert.equal(proposalInfo.to[0], realitio.address);
            assert.equal(proposalInfo.value[0], 0);
            assert.equal(await realitio.isFinalized(questionId),true);
            assert.equal(await realitio.getFinalAnswer(questionId),  soliditySha3((true)));
        });

        it("test proposal failed/ended", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);

            const marketValidationProposalValid = tx.logs[0].args.proposalId;

            const votes = await omnGuild.methods['votesOf(address)'](accounts[4]); // overloaded function which is not supported by truffle
            const txVote = await omnGuild.setVote(
                marketValidationProposalValid,
                votes, {
                    from: accounts[4]
                });
            await time.increase(time.duration.seconds(60*60*24*7+200000));
            const receipt = await omnGuild.endMarketValidationProposal(questionId);
            expectEvent(receipt, "ProposalEnded", {
                proposalId: marketValidationProposalValid
            });
            const proposalInfo = await omnGuild.getProposal(marketValidationProposalValid);
            assert.equal(proposalInfo.state, constants.GuildProposalState.Failed);

        });
        it("test proposal rejected", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);

            const marketValidationProposalValid = tx.logs[0].args.proposalId;

            await time.increase(time.duration.seconds(60*60*24*7+100000));
            const receipt = await omnGuild.endMarketValidationProposal(questionId);
            expectEvent(receipt, "ProposalRejected", {
                proposalId: marketValidationProposalValid
            });
            const proposalInfo = await omnGuild.getProposal(marketValidationProposalValid);
            assert.equal(proposalInfo.state, constants.GuildProposalState.Rejected);

        });

        it("test changing vote I.B.3.c: Voters CANNOT change vote once they've voted", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);
            const marketValidationProposalValid = tx.logs[0].args.proposalId;
            const marketValidationProposalInvalid = tx.logs[2].args.proposalId;

            const txVote = await omnGuild.setVote(
                marketValidationProposalValid,
                1, {
                    from: accounts[4]
                });

            await expectRevert(
                omnGuild.setVote(
                marketValidationProposalInvalid,
                1, {
                    from: accounts[4]
                }),
                "OMNGuild: Already voted"
            );
        });

        it("claim rewards for successful vote", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);  // I.B.2.b

            const marketValidationProposalValid = tx.logs[0].args.proposalId;
            const marketValidationProposalInvalid = tx.logs[2].args.proposalId;

            const txVote = await omnGuild.setVote(
                marketValidationProposalValid,
                10, {
                    from: accounts[4]
                });
            expectEvent(txVote, "VoteAdded", {
                proposalId: marketValidationProposalValid
            });
            await expectRevert(
                omnGuild.claimMarketValidationVoteRewards([marketValidationProposalValid],accounts[4]),
                "OMNGuild: Proposal to claim should be executed or rejected"
            );

            await time.increase(time.duration.seconds(60*60*24*7+1000));

            const receipt = await omnGuild.endMarketValidationProposal(questionId);
            expectEvent(receipt, "ProposalExecuted", {
                proposalId: marketValidationProposalValid
            });
            const proposalInfo = await omnGuild.getProposal(marketValidationProposalValid);
            assert.equal(await realitio.isFinalized(questionId),true);
            assert.equal(await realitio.getFinalAnswer(questionId),  soliditySha3((true)));

            assert.equal(await guildToken.balanceOf(accounts[4]),0);
            await omnGuild.claimMarketValidationVoteRewards([marketValidationProposalValid],accounts[4]);
            assert.equal(await guildToken.balanceOf(accounts[4]),2*OMN_REWARD); // I.B.3.d.i.3
            await expectRevert(
                omnGuild.claimMarketValidationVoteRewards([marketValidationProposalValid],accounts[4]),
                "OMNGuild: Vote reward already claimed"
            );
        });
        it("claim rewards for unsuccessful vote", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);  // I.B.2.b

            const marketValidationProposalValid = tx.logs[0].args.proposalId;
            const marketValidationProposalInvalid = tx.logs[2].args.proposalId;

            const txVote = await omnGuild.setVote(
                marketValidationProposalValid,
                10, {
                    from: accounts[3]
                });
            expectEvent(txVote, "VoteAdded", {
                proposalId: marketValidationProposalValid
            });
            const txVote_ = await omnGuild.setVote(
                marketValidationProposalInvalid,
                9, {
                    from: accounts[4]
                });
            expectEvent(txVote_, "VoteAdded", {
                proposalId: marketValidationProposalInvalid
            });
            await expectRevert(
                omnGuild.claimMarketValidationVoteRewards([marketValidationProposalInvalid],accounts[4]),
                "OMNGuild: Proposal to claim should be executed or rejected"
            );

            await time.increase(time.duration.seconds(60*60*24*7+1000));

            const receipt = await omnGuild.endMarketValidationProposal(questionId);
            expectEvent(receipt, "ProposalExecuted", {
                proposalId: marketValidationProposalValid
            });
            assert.equal(await realitio.isFinalized(questionId),true);
            assert.equal(await realitio.getFinalAnswer(questionId),  soliditySha3((true)));
            assert.equal(await guildToken.balanceOf(accounts[4]),0);
            await omnGuild.claimMarketValidationVoteRewards([marketValidationProposalInvalid],accounts[4]);
            assert.equal(await guildToken.balanceOf(accounts[4]),OMN_REWARD); // I.B.3.d.i.3
            await expectRevert(
                omnGuild.claimMarketValidationVoteRewards([marketValidationProposalInvalid],accounts[4]),
                "OMNGuild: Vote reward already claimed"
            );
        });
        it("test setVotes prevents voting twice", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);  // I.B.2.b

            const marketValidationProposalValid = tx.logs[0].args.proposalId;
            const marketValidationProposalInvalid = tx.logs[2].args.proposalId;

            await expectRevert (omnGuild.setVotes(
                    [marketValidationProposalValid,
                    marketValidationProposalValid],
                    [10,9], 
                    { from: accounts[3] }),
                "OMNGuild: Already voted");
        });
        it("test setVotes prevents changing vote", async function() {
            const tx = await omnGuild.createMarketValidationProposal(questionId);  // I.B.2.b

            const marketValidationProposalValid = tx.logs[0].args.proposalId;
            const marketValidationProposalInvalid = tx.logs[2].args.proposalId;
            await expectRevert (omnGuild.setVotes(
                    [marketValidationProposalValid,
                    marketValidationProposalInvalid],
                    [10,9], 
                    { from: accounts[3] }),
                "OMNGuild: Already voted");
        });
//        it("test createProprosals", async function() {

    });
});
