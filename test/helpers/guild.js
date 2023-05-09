import * as helpers from "./index";
const constants = require("./constants");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const ERC721Token = artifacts.require("ERC721Token.sol");

export async function createAndSetupGuildToken(accounts, balances) {
  const [firstAccount, ...restOfAccounts] = accounts;
  const [, ...restOfBalances] = balances;
  const totalSupply = balances.reduce((a, b) => a + b, 0);
  const guildToken = await ERC20Mock.new(
    "Test Token",
    "TT",
    totalSupply,
    firstAccount
  );

  await Promise.all(
    restOfAccounts.map((account, idx) => {
      return guildToken.transfer(account, restOfBalances[idx]);
    })
  );

  return guildToken;
}

export async function createAndSetupNFT(accounts) {
  const nft = await ERC721Token.new("Non fungible", "NFT");

  await Promise.all(
    accounts.map((account, idx) => {
      return nft.mint(account, idx);
    })
  );

  return guildToken;
}

export async function createProposal({
  guild,
  options,
  title = constants.TEST_TITLE,
  contentHash = constants.SOME_HASH,
  account,
}) {
  const callsTo = [],
    callsData = [],
    callsValue = [];

  options.map(option => {
    option.to.map(to => callsTo.push(to));
    option.data.map(data => callsData.push(data));
    option.value.map(value => callsValue.push(value));
  });

  const tx = await guild.createProposal(
    callsTo,
    callsData,
    callsValue,
    options.length,
    title,
    contentHash,
    { from: account }
  );
  return helpers.getValueFromLogs(tx, "proposalId", "ProposalStateChanged");
}

export async function setVotesOnProposal({
  guild,
  proposalId,
  option,
  account,
  votingPower = 0,
}) {
  if (votingPower === 0) votingPower = await guild.votingPowerOf(account);
  return guild.setVote(proposalId, option, votingPower, { from: account });
}

export async function setNFTVotesOnProposal({
  guild,
  proposalId,
  option,
  account,
  tokenIds,
}) {
  return guild.setVote(proposalId, option, tokenIds, { from: account });
}
