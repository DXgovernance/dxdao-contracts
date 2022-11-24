/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const IPFS = require("ipfs-core");
const contentHash = require("content-hash");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

const doActions = async function (actions, networkContracts) {
  const ipfs = await IPFS.create();

  const ContributionReward = await hre.artifacts.require("ContributionReward");
  const WalletScheme = await hre.artifacts.require("WalletScheme");
  const DXDVotingMachine = await hre.artifacts.require("DXDVotingMachine");
  const ERC20Guild = await hre.artifacts.require("ERC20Guild");
  const ERC20 = await hre.artifacts.require("ERC20");

  // Execute a set of actions once all contracts are deployed
  let proposals = {
    dao: [],
  };
  for (const i in actions) {
    const action = actions[i];
    if (action.timestamp)
      await hre.network.provider.request({
        method: "evm_increaseTime",
        params: [
          action.timestamp - (await web3.eth.getBlock("latest")).timestamp,
        ],
      });
    else if (action.increaseTime)
      await network.provider.request({
        method: "evm_increaseTime",
        params: [action.increaseTime],
      });

    console.log("Executing action:", action);

    // TO DO: Add guildRegistry actions

    switch (action.type) {
      case "raw":
        await web3.eth.sendTransaction(action.transaction);
        break;

      case "approve":
        await (
          await ERC20.at(networkContracts.addresses[action.data.asset])
        ).approve(
          networkContracts.addresses[action.data.address] ||
            action.data.address,
          action.data.amount,
          { from: action.from }
        );
        break;

      case "transfer":
        action.data.asset === NULL_ADDRESS
          ? await web3.eth.sendTransaction({
              to:
                networkContracts.addresses[action.data.address] ||
                action.data.address,
              value: action.data.amount,
              from: action.from,
            })
          : await (
              await ERC20.at(networkContracts.addresses[action.data.asset])
            ).transfer(
              networkContracts.addresses[action.data.address] ||
                action.data.address,
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
                networkContracts.addresses["AVATAR"],
                contentHash.fromIpfs(proposalDescriptionHash),
                action.data.reputationChange,
                action.data.rewards,
                action.data.externalToken,
                action.data.beneficiary,
                { from: action.from }
              )
            : await (
                await WalletScheme.at(
                  networkContracts.addresses[action.data.scheme]
                )
              ).proposeCalls(
                action.data.to.map(
                  _to => networkContracts.addresses[_to] || _to
                ),
                action.data.callData,
                action.data.value,
                action.data.title,
                contentHash.fromIpfs(proposalDescriptionHash),
                { from: action.from }
              );
        proposals.dao.push(proposalCreationTx.receipt.logs[0].args._proposalId);
        break;
      case "vote":
        await (
          await DXDVotingMachine.at(
            networkContracts.addresses["DXDVotingMachine"]
          )
        ).vote(
          proposals.dao[action.data.proposal],
          action.data.decision,
          action.data.amount,
          action.from,
          { from: action.from }
        );
        break;
      case "stake":
        await (
          await DXDVotingMachine.at(
            networkContracts.addresses["DXDVotingMachine"]
          )
        ).stake(
          proposals.dao[action.data.proposal],
          action.data.decision,
          action.data.amount,
          { from: action.from }
        );
        break;
      case "execute":
        try {
          await (
            await DXDVotingMachine.at(
              networkContracts.addresses["DXDVotingMachine"]
            )
          ).execute(proposals.dao[action.data.proposal], {
            from: action.from,
            gas: 9000000,
          });
        } catch (error) {
          console.log("Execution of proposal failed", error);
        }
        break;
      case "redeem":
        await (
          await DXDVotingMachine.at(
            networkContracts.addresses["DXDVotingMachine"]
          )
        ).redeem(proposals.dao[action.data.proposal], action.from, {
          from: action.from,
        });
        break;
      case "guild-createProposal":
        const guildProposalDescriptionHash = (
          await ipfs.add(
            JSON.stringify({
              description: action.data.description,
              url: "",
              voteOptions: action.data.voteOptions,
            })
          )
        ).cid.toString();
        const guildProposalCreationTx = await (
          await ERC20Guild.at(networkContracts.addresses[action.data.guildName])
        ).createProposal(
          action.data.to.map(_to => networkContracts.addresses[_to] || _to),
          action.data.callData,
          action.data.value,
          action.data.totalOptions,
          action.data.title,
          guildProposalDescriptionHash,
          { from: action.from }
        );
        if (!proposals[action.data.guildName])
          proposals[action.data.guildName] = [];
        proposals[action.data.guildName].push(
          guildProposalCreationTx.receipt.logs[0].args.proposalId
        );
        break;
      case "guild-lockTokens":
        await (
          await ERC20Guild.at(networkContracts.addresses[action.data.guildName])
        ).lockTokens(action.data.amount, {
          from: action.from,
        });
        break;
      case "guild-withdrawTokens":
        await (
          await ERC20Guild.at(networkContracts.addresses[action.data.guildName])
        ).withdrawTokens(action.data.amount, {
          from: action.from,
        });
        break;
      case "guild-voteProposal":
        await (
          await ERC20Guild.at(networkContracts.addresses[action.data.guildName])
        ).setVote(
          proposals[action.data.guildName][action.data.proposal],
          action.data.action,
          action.data.votingPower
        );
        break;
      case "guild-endProposal":
        await (
          await ERC20Guild.at(networkContracts.addresses[action.data.guildName])
        ).endProposal(proposals[action.data.guildName][action.data.proposal], {
          from: action.from,
        });
        break;
      default:
        break;
    }
  }

  const stop = async () => {
    try {
      await ipfs.stop();
    } catch (e) {
      console.log(e.message);
    }
    process.exit();
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  process.on("SIGHUP", stop);
  process.on("uncaughtException", stop);

  return;
};

module.exports = {
  doActions,
};
