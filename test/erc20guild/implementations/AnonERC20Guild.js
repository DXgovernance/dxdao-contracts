import { web3 } from "@openzeppelin/test-helpers/src/setup";
import { assert, expect } from "chai";
import { constants } from "../../helpers";
const { createProposal } = require("../../helpers/guild");

const { Identity } = require("@semaphore-protocol/identity");
const { Group } = require("@semaphore-protocol/group");
const {
  generateProof,
  packToSolidityProof,
} = require("@semaphore-protocol/proof");

const { BN, time, expectRevert } = require("@openzeppelin/test-helpers");

const AnonERC20Guild = artifacts.require("AnonERC20Guild.sol");
const ERC721AnonRep = artifacts.require("ERC721AnonRep.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");

require("chai").should();

const proposalTime = 240;
const votingPowerPercentageForProposalExecution = 5000; // 50%
const votingPowerPercentageForProposalCreation = 1000; // 10%
const wasmFilePath = "test/utils/semaphore/semaphore.wasm";
const zkeyFilePath = "test/utils/semaphore/semaphore.zkey";

contract("AnonERC20Guild", function (accounts) {
  let guildToken, anonERC20Guild, permissionRegistry, repHolders;

  function generateIdentities(privateKey, amount) {
    let identities = [];
    for (let i = 0; i < amount; i++) {
      const newIdentity = new Identity(privateKey + i);
      identities[i] = {
        privateCommitment: newIdentity,
        publicCommitment: newIdentity.getCommitment(),
      };
    }
    return identities;
  }

  async function setVoteForRepHolder(
    repHolder,
    proposalId,
    option,
    voteAmount
  ) {
    // Generate the  group of commitments that is stored on chain to generate the proof off chain
    const voteCommitments = await guildToken.getVoteCommitments();
    const burnProposalGroup = new Group(20);
    voteCommitments.forEach(voteCommitment => {
      burnProposalGroup.addMember(BigInt(voteCommitment));
    });

    // Get the proposal group id to be used to generate the proof
    const proposalGroupId = await anonERC20Guild.proposalGroupIds(proposalId);

    for (let i = 0; i < voteAmount; i++) {
      const identity = repHolder.identities[i];

      // This zk proof can be sued to prove that 1 identity connected to a REP NFT voted for option 1
      const voteFromAccount1Proof = await generateProof(
        identity.privateCommitment,
        burnProposalGroup,
        BigInt(proposalGroupId),
        option,
        {
          wasmFilePath,
          zkeyFilePath,
        }
      );
      const solidityProof = packToSolidityProof(voteFromAccount1Proof.proof);

      // The solidity proof is posted anonymously somewhere

      // This is where the anonymity can be compromised,
      // the proof sharing should protect the location, time and amount of proofs shared at the same time

      // The solidity proof is validated by the vote executor and executes the vote
      const setVoteTx = await anonERC20Guild.setVote(
        proposalId,
        option,
        voteFromAccount1Proof.publicSignals.merkleRoot,
        voteFromAccount1Proof.publicSignals.nullifierHash,
        solidityProof
      );
      assert(setVoteTx.receipt.gasUsed < 350000);

      expectRevert(
        anonERC20Guild.setVote(
          proposalId,
          option,
          voteFromAccount1Proof.publicSignals.merkleRoot,
          voteFromAccount1Proof.publicSignals.nullifierHash,
          solidityProof
        ),
        "Semaphore__YouAreUsingTheSameNillifierTwice()"
      );
    }
  }

  beforeEach(async function () {
    const semaphoreDeployments = await hre.run("deploy-semaphore", {
      logs: false,
    });

    guildToken = await ERC721AnonRep.new();
    guildToken.initialize("Test ERC721AnonRep Token", "TESRT", {
      from: accounts[0],
    });

    // Each NFT token will be connected to an semaphore identity.
    // The identity is generated from a private key and a public commitment is stored on chain
    // The private key is used to generate a zk proof that the identity voted for a proposal
    repHolders = [
      {
        address: accounts[0],
        identities: generateIdentities("privateKeyString_0", 4),
      },
      {
        address: accounts[1],
        identities: generateIdentities("privateKeyString_1", 2),
      },
      {
        address: accounts[2],
        identities: generateIdentities("privateKeyString_2", 2),
      },
      {
        address: accounts[3],
        identities: generateIdentities("privateKeyString_3", 2),
      },
      {
        address: accounts[4],
        identities: generateIdentities("privateKeyString_4", 2),
      },
    ];
    await Promise.all(
      repHolders.map(repHolder => {
        guildToken.mintMultiple(
          repHolder.identities.map(() => repHolder.address),
          repHolder.identities.map(identity => identity.publicCommitment),
          { from: accounts[0] }
        );
      })
    );

    anonERC20Guild = await AnonERC20Guild.new();
    permissionRegistry = await PermissionRegistry.new();
    await permissionRegistry.initialize();

    await anonERC20Guild.initialize(
      guildToken.address,
      proposalTime,
      proposalTime / 2,
      votingPowerPercentageForProposalExecution,
      votingPowerPercentageForProposalCreation,
      "AnonERC20 Guild",
      permissionRegistry.address,
      semaphoreDeployments.semaphoreAddress
    );

    // The guild token ownership is transferred to the guild contract
    // Now the guild is the only one that can mint/burn NFT REP tokens
    await guildToken.transferOwnership(anonERC20Guild.address);
  });

  describe("ZK votes", () => {
    it("Should execute a proposal with anonymous votes", async () => {
      const accountToBurn = accounts[2];
      const accountToMint = accounts[5];
      const initialVotingPowerAcc = new BN(2);

      const proposalId1 = await createProposal({
        guild: anonERC20Guild,
        options: [
          {
            to: [accounts[1]],
            data: ["0x0"],
            value: [0],
          },
        ],
        account: accounts[0],
      });

      const snapshotId1 = new BN(
        await anonERC20Guild.getProposalSnapshotId(proposalId1)
      );

      // voting power at snapshotId1
      const votingPower1 = await anonERC20Guild.votingPowerOfAt(
        accountToBurn,
        snapshotId1
      );
      expect(votingPower1).to.be.bignumber.equal(initialVotingPowerAcc);

      const tokensToBurn = [];

      // We get the token address to burn and the corresponding commitment
      for (let i = 0; i < 2; i++) {
        tokensToBurn.push(
          (await guildToken.tokenOfOwnerByIndex(accountToBurn, i)).toString()
        );
      }

      // burn tokensEncodedCall
      const burnCallData = await new web3.eth.Contract(guildToken.abi).methods
        .burnMultiple(
          tokensToBurn,
          tokensToBurn.map(() => accountToBurn)
        )
        .encodeABI();

      //Mint
      repHolders.push({
        address: accountToMint,
        identities: generateIdentities("privateKey3String", 2),
      });
      const mintCallData = await new web3.eth.Contract(guildToken.abi).methods
        .mintMultiple(
          repHolders[3].identities.map(() => accountToMint),
          repHolders[3].identities.map(identity => identity.publicCommitment)
        )
        .encodeABI();

      // create proposal to burn/mint rep tokens
      const changeREPProposalId = await createProposal({
        guild: anonERC20Guild,
        options: [
          {
            to: [guildToken.address, guildToken.address],
            data: [burnCallData, mintCallData],
            value: [0, 0],
          },
          {
            to: [constants.ZERO_ADDRESS, constants.ZERO_ADDRESS],
            data: [constants.ZERO_DATA, constants.ZERO_DATA],
            value: [0, 0],
          },
        ],
        account: accounts[0],
      });

      await setVoteForRepHolder(repHolders[2], changeREPProposalId, "2", 2);
      assert.equal(
        await anonERC20Guild.getProposalTotalVotesOfOption(
          changeREPProposalId,
          "2"
        ),
        "2"
      );
      assert.equal(
        await anonERC20Guild.getProposalTotalVotesOfOption(
          changeREPProposalId,
          "1"
        ),
        "0"
      );

      await setVoteForRepHolder(repHolders[0], changeREPProposalId, "1", 3);
      await setVoteForRepHolder(repHolders[1], changeREPProposalId, "1", 2);
      await setVoteForRepHolder(repHolders[3], changeREPProposalId, "1", 2);

      assert.equal(
        await anonERC20Guild.getProposalTotalVotesOfOption(
          changeREPProposalId,
          "2"
        ),
        "2"
      );
      assert.equal(
        await anonERC20Guild.getProposalTotalVotesOfOption(
          changeREPProposalId,
          "1"
        ),
        "7"
      );
      assert.equal(
        await anonERC20Guild.getProposalTotalVotes(changeREPProposalId),
        "9"
      );

      await time.increase(proposalTime);

      // execute burn proposal
      await anonERC20Guild.endProposal(changeREPProposalId);

      assert.equal(
        (await anonERC20Guild.getProposal(changeREPProposalId)).state,
        constants.GUILD_PROPOSAL_STATES.Executed
      );
      const proposalId3 = await createProposal({
        guild: anonERC20Guild,
        options: [
          {
            to: [accounts[1]],
            data: ["0x0"],
            value: [0],
          },
        ],
        account: accounts[0],
      });

      const snapshotId2 = new BN(
        await anonERC20Guild.getProposalSnapshotId(proposalId3)
      );

      // Check voting power in the next proposal
      expect(
        await anonERC20Guild.votingPowerOfAt(accountToBurn, snapshotId2)
      ).to.be.bignumber.equal("0");
      expect(
        await anonERC20Guild.votingPowerOfAt(accountToMint, snapshotId2)
      ).to.be.bignumber.equal("2");
    });
  });
});
