import * as helpers from "./index";
const constants = require("./constants");
const ERC20Mock = artifacts.require("ERC20Mock.sol");

export async function createAndSetupGuildToken(accounts, balances) {
  const [firstAccount, ...restOfAccounts] = accounts;
  const [, ...restOfBalances] = balances;
  const totalSupply = balances.reduce((a, b) => a + b, 0);
  const guildToken = await ERC20Mock.new(firstAccount, totalSupply);

  await Promise.all(
    restOfAccounts.map((account, idx) => {
      return guildToken.transfer(account, restOfBalances[idx]);
    })
  );

  return guildToken;
}

export async function createProposal({
  guild,
  actions,
  title = constants.TEST_TITLE,
  contentHash = constants.SOME_HASH,
  account,
}) {
  const callsTo = [],
    callsData = [],
    callsValue = [];

  actions.map(action => {
    action.to.map(to => callsTo.push(to));
    action.data.map(data => callsData.push(data));
    action.value.map(value => callsValue.push(value));
  });

  const tx = await guild.createProposal(
    callsTo,
    callsData,
    callsValue,
    actions.length,
    title,
    contentHash,
    { from: account }
  );
  return helpers.getValueFromLogs(tx, "proposalId", "ProposalStateChanged");
}

export async function setAllVotesOnProposal({
  guild,
  proposalId,
  action,
  account,
}) {
  const votingPower = await guild.votingPowerOf(account);
  return guild.setVote(proposalId, action, votingPower, { from: account });
}

export async function setXVotesOnProposal({
  guild,
  proposalId,
  votes,
  account,
}) {
  return guild.setVote(proposalId, votes, { from: account });
}

export const GUILD_PROPOSAL_STATES = {
  submitted: 0,
  rejected: 1,
  executed: 2,
  failed: 3,
};

export const addGuildsToRegistry = async ({
  guildRegistry,
  address,
  account,
}) => {
  return guildRegistry.addGuild(address, {
    from: account,
  });
};
