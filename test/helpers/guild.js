import * as helpers from "./index";
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const WalletScheme = artifacts.require("WalletScheme.sol");
const DaoCreator = artifacts.require("DaoCreator.sol");
const DxControllerCreator = artifacts.require("DxControllerCreator.sol");
const { BN } = require("@openzeppelin/test-helpers");

export async function createAndSetupGuildToken(accounts, balances) {
  const [ firstAccount, ...restOfAccounts ] = accounts;
  const [ firstBalance, ...restOfBalances ] = balances;
  const guildToken = await ERC20Mock.new(firstAccount, firstBalance);

  await Promise.all(restOfAccounts.map((account, idx) => {
    return guildToken.transfer(account, restOfBalances[ idx ]);
  }));

  return guildToken;
}

export async function createDAO(guild, accounts, founderToken=  [ 0, 0, 0, 0 ], founderReputation= [10, 10, 10, 10]) {
  const orgToken = await ERC20Mock.new(accounts[0], new BN('0'));
  const controllerCreator = await DxControllerCreator.new();

  const daoCreator = await DaoCreator.new(
    controllerCreator.address,
  );

  const walletScheme = await WalletScheme.new();

  const votingMachine = await helpers.setupGenesisProtocol(
    accounts, orgToken.address, 0, helpers.NULL_ADDRESS
  );

  const org = await helpers.setupOrganizationWithArrays(
    daoCreator,
    [ accounts[ 0 ], accounts[ 1 ], accounts[ 2 ], guild.address ],
    founderToken,
    founderReputation
  );

  await walletScheme.initialize(
    org.avatar.address,
    votingMachine.address,
    votingMachine.params,
    org.controller.address
  );

  await daoCreator.setSchemes(
    org.avatar.address,
    [ walletScheme.address],
    [ votingMachine.params],
    [ helpers.encodePermission({
      canGenericCall: true,
      canUpgrade: true,
      canChangeConstraints: true,
      canRegisterSchemes: true
    }) ],
    "metaData"
  );

  return {
    daoCreator,
    walletScheme,
    votingMachine,
    org,
  };
}

export async function createProposal({guild, to, data, value, description, contentHash, extraTime, account}) {
  const tx = await guild.createProposal(
    to,
    data,
    value,
    description,
    contentHash,
    extraTime,
    {from: account}
  );

  // Return proposal ID
  return helpers.getValueFromLogs(tx, "proposalId", "ProposalCreated");
}

export async function setAllVotesOnProposal({guild, proposalId, account}) {
  const tokenAddress = await guild.token();
  const token = await ERC20Mock.at(tokenAddress);
  const votes = await token.balanceOf(account);
  return guild.setVote(
    proposalId,
    votes,
    {from: account}
  );
}

export async function setXVotesOnProposal({guild, proposalId, votes, account}) {
  return guild.setVote(
    proposalId,
    votes,
    {from: account}
  );
}
