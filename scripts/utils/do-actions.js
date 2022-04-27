/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");
const { default: BigNumber } = require("bignumber.js");

const contentHash = require("content-hash");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

export async function doActions(
  actions,
  tokens,
  addresses,
  avatar,
  guilds,
  ipfs
) {
  // Execute a set of actions once all contracts are deployed
  let proposals = {
    dxvote: [],
  };
  for (const i in actions) {
    const action = actions[i];
    console.log({ proposals });
    if (action.time)
      await network.provider.send("evm_increaseTime", [action.time]);
    console.log("Executing action:", action);

    switch (action.type) {
      case "approve":
        await tokens[action.data.asset].approve(
          addresses[action.data.address] || action.data.address,
          action.data.amount,
          { from: action.from }
        );
        break;

      case "transfer":
        action.data.asset === NULL_ADDRESS
          ? await web3.eth.sendTransaction({
              to: addresses[action.data.address] || action.data.address,
              value: action.data.amount,
              from: action.from,
            })
          : await tokens[action.data.asset].transfer(
              addresses[action.data.address] || action.data.address,
              action.data.amount,
              { from: action.from }
            );
        break;

      case "proposal":
        const proposalDescriptionHash = (
          await ipfs.add(
            JSON.stringify({
              description: action.data.description,
              title: action.data.title,
              tags: action.data.tags,
              url: "",
            })
          )
        ).cid.toString();
        const proposalCreationTx =
          action.data.scheme === "ContributionReward"
            ? await (
                await ContributionReward.at(contributionReward.address)
              ).proposeContributionReward(
                avatar.address,
                contentHash.fromIpfs(proposalDescriptionHash),
                action.data.reputationChange,
                action.data.rewards,
                action.data.externalToken,
                action.data.beneficiary,
                { from: action.from }
              )
            : await (
                await WalletScheme.at(addresses[action.data.scheme])
              ).proposeCalls(
                action.data.to.map(_to => addresses[_to] || _to),
                action.data.callData,
                action.data.value,
                action.data.title,
                contentHash.fromIpfs(proposalDescriptionHash),
                { from: action.from }
              );
        proposals.dxvote.push(
          proposalCreationTx.receipt.logs[0].args._proposalId
        );
        break;
      case "vote":
        await votingMachine.vote(
          proposals.dxvote[action.data.proposal],
          action.data.decision,
          action.data.amount,
          action.from,
          { from: action.from }
        );
        break;
      case "stake":
        await votingMachine.stake(
          proposals.dxvote[action.data.proposal],
          action.data.decision,
          action.data.amount,
          { from: action.from }
        );
        break;
      case "execute":
        try {
          await votingMachine.execute(proposals.dxvote[action.data.proposal], {
            from: action.from,
            gas: 9000000,
          });
        } catch (error) {
          console.log("Execution of proposal failed", error);
        }
        break;
      case "redeem":
        await votingMachine.redeem(
          proposals.dxvote[action.data.proposal],
          action.from,
          { from: action.from }
        );
        break;
      case "guild-createProposal":
        const guildProposalDescriptionHash = (
          await ipfs.add(
            JSON.stringify({ description: action.data.proposalBody, url: "" })
          )
        ).cid.toString();
        const guildProposalCreationTx = await guilds[
          action.data.guildName
        ].createProposal(
          action.data.to.map(_to => addresses[_to] || _to),
          action.data.callData,
          action.data.value,
          action.data.totalActions,
          action.data.title,
          contentHash.fromIpfs(guildProposalDescriptionHash).toString(),
          { from: action.from }
        );
        console.log(guildProposalCreationTx.receipt.logs[0].args.proposalId);
        proposals[action.data.guildName].push(
          guildProposalCreationTx.receipt.logs[0].args.proposalId
        );
        break;
      case "guild-lockTokens":
        await guilds[action.data.guildName].lockTokens(action.data.amount, {
          from: action.from,
        });
        break;
      case "guild-withdrawTokens":
        await guilds[action.data.guildName].withdrawTokens(action.data.amount, {
          from: action.from,
        });
        break;
      case "guild-voteProposal":
        await guilds[action.data.guildName].setVote(
          proposals[action.data.guildName][action.data.proposal],
          action.data.action,
          action.data.votingPower
        );
        break;
      case "guild-endProposal":
        await guilds[action.data.guildName].endProposal(
          proposals[action.data.guildName][action.data.proposal],
          { from: action.from }
        );
        break;
      default:
        break;
    }
  }
}
