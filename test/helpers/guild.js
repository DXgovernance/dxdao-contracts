import * as helpers from "./index";
const constants = require("./constants");
const ERC20Mock = artifacts.require("ERC20Mock.sol");
const WalletScheme = artifacts.require("WalletScheme.sol");
const PermissionRegistry = artifacts.require("PermissionRegistry.sol");
const DaoCreator = artifacts.require("DaoCreator.sol");
const DxControllerCreator = artifacts.require("DxControllerCreator.sol");
const { BN, time } = require("@openzeppelin/test-helpers");

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

export async function createDAO(
  guild,
  accounts,
  founderToken = [0, 0, 0, 0],
  founderReputation = [10, 10, 10, 10]
) {
  const orgToken = await ERC20Mock.new(accounts[0], new BN("0"));
  const controllerCreator = await DxControllerCreator.new();

  const daoCreator = await DaoCreator.new(controllerCreator.address);

  const walletScheme = await WalletScheme.new();

  const votingMachine = await helpers.setupGenesisProtocol(
    accounts,
    orgToken.address,
    0,
    constants.NULL_ADDRESS
  );

  const org = await helpers.setupOrganizationWithArrays(
    daoCreator,
    [accounts[0], accounts[1], accounts[2], guild.address],
    founderToken,
    founderReputation
  );

  const permissionRegistry = await PermissionRegistry.new(accounts[0], 10);
  await permissionRegistry.initialize();

  await walletScheme.initialize(
    org.avatar.address,
    votingMachine.address,
    votingMachine.params,
    org.controller.address,
    permissionRegistry.address,
    "Wallet Scheme",
    86400,
    5
  );

  await permissionRegistry.setPermission(
    constants.NULL_ADDRESS,
    org.avatar.address,
    constants.ANY_ADDRESS,
    constants.ANY_FUNC_SIGNATURE,
    constants.MAX_UINT_256,
    true
  );
  await time.increase(10);

  await daoCreator.setSchemes(
    org.avatar.address,
    [walletScheme.address],
    [votingMachine.params],
    [
      helpers.encodePermission({
        canGenericCall: true,
        canUpgrade: true,
        canChangeConstraints: true,
        canRegisterSchemes: true,
      }),
    ],
    "metaData"
  );

  return {
    daoCreator,
    walletScheme,
    votingMachine,
    org,
  };
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
