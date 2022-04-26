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

export async function setVotesOnProposal({
  guild,
  proposalId,
  action,
  account,
  votingPower = 0,
}) {
  if (votingPower === 0) votingPower = await guild.votingPowerOf(account);
  return guild.setVote(proposalId, action, votingPower, { from: account });
}
