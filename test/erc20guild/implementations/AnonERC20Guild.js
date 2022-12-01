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

const { BN, time } = require("@openzeppelin/test-helpers");

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

  beforeEach(async function () {
    const semaphoreDeployments = await hre.run("deploy-semaphore", {
      logs: false,
    });

    function generateIdentities(privateKey, amount) {
      let identities = [];
      for (let i = 0; i < amount; i++) {
        identities[i] = {
          privateCommitment: new Identity(privateKey + i),
          publicCommitment: "",
        };
        identities[i].publicCommitment =
          identities[i].privateCommitment.getCommitment();
      }
      return identities;
    }

    repHolders = [
      {
        address: accounts[0],
        identities: generateIdentities("privateKey0String", 6),
      },
      {
        address: accounts[1],
        identities: generateIdentities("privateKey1String", 2),
      },
      {
        address: accounts[2],
        identities: generateIdentities("privateKey2String", 2),
      },
    ];

    guildToken = await ERC721AnonRep.new();
    guildToken.initialize("Test ERC721AnonRep Token", "TESRT", {
      from: accounts[0],
    });

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

    await guildToken.transferOwnership(anonERC20Guild.address);
  });

  describe("ZK votes", () => {
    it("Should execute a proposal with anonymous votes", async () => {
      const accountToBurn = accounts[2];
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

      const tokensToBurn = [],
        commitmentsToBurn = [];

      for (let i = 0; i < 2; i++) {
        tokensToBurn.push(
          (await guildToken.tokenOfOwnerByIndex(accountToBurn, i)).toString()
        );
        commitmentsToBurn.push(repHolders[2].identities[i].publicCommitment);
      }

      // burn tokensEncodedCall
      const burnCallData = await new web3.eth.Contract(
        anonERC20Guild.abi
      ).methods
        .burnRep(accountToBurn, tokensToBurn, commitmentsToBurn)
        .encodeABI();

      // create proposal to burn tokens
      const burnProposalId = await createProposal({
        guild: anonERC20Guild,
        options: [
          {
            to: [anonERC20Guild.address],
            data: [burnCallData],
            value: [0],
          },
          {
            to: [accounts[1]],
            data: ["0x0"],
            value: [0],
          },
        ],
        account: accounts[0],
      });

      const voteCommitments = await guildToken.getVoteCommitments();
      const burnProposalGroup = new Group(20);
      voteCommitments.forEach(voteCommitment => {
        burnProposalGroup.addMember(BigInt(voteCommitment));
      });

      const burnProposalGroupId = await anonERC20Guild.proposalGroupIds(
        burnProposalId
      );
      const option = "1";
      for (let i = 0; i < repHolders[0].identities.length; i++) {
        const identity = repHolders[0].identities[i];
        const voteFromAccount1Proof = await generateProof(
          identity.privateCommitment,
          burnProposalGroup,
          BigInt(burnProposalGroupId),
          option,
          {
            wasmFilePath,
            zkeyFilePath,
          }
        );
        const solidityProof = packToSolidityProof(voteFromAccount1Proof.proof);

        await anonERC20Guild.setVote(
          burnProposalId,
          option,
          voteFromAccount1Proof.publicSignals.merkleRoot,
          voteFromAccount1Proof.publicSignals.nullifierHash,
          solidityProof
        );
      }

      await time.increase(proposalTime);

      // execute burn proposal
      await anonERC20Guild.endProposal(burnProposalId);

      assert.equal(
        (await anonERC20Guild.getProposal(burnProposalId)).state,
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

      // voting power at snapshotId2 after burn
      const votingPower2 = await anonERC20Guild.votingPowerOfAt(
        accountToBurn,
        snapshotId2
      );

      expect(votingPower2).to.be.bignumber.equal("0");
    });
  });
});
