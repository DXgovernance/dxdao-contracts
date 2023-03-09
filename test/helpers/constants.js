export const GAS_LIMIT = process.env.OVERRIDE_GAS_LIMIT || 9000000;
export const GAS_PRICE = process.env.OVERRIDE_GAS_PRICE || 10000000000;

export const MAX_UINT_256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
export const NULL_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const SOME_HASH =
  "0x1000000000000000000000000000000000000000000000000000000000000000";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const NULL_SIGNATURE = "0x00000000";
export const ZERO_DATA = "0x";
export const SOME_ADDRESS = "0x1000000000000000000000000000000000000000";
export const SOME_OTHER_ADDRESS = "0x1100000000000000000000000000000000000000";
export const TEST_VALUE = 666;
export const TEST_TITLE = "Awesome Proposal Title";
export const ERC20_TRANSFER_SIGNATURE = "0xa9059cbb";
export const SOME_TOKEN_URI =
  "http://www.someTokenImplementation.com/tokens/19";
export const MIN_SECONDS_FOR_EXECUTION = 86400;
export const YES_OPTION = "2";
export const NO_OPTION = "1";
export const CREATE2_DEPLOYER = "0x77ea3E69657D9686d0F5a984bE2Cb03424f66F80";

export const WALLET_SCHEME_PROPOSAL_STATES = {
  none: "0",
  submitted: "1",
  rejected: "2",
  passed: "3",
};

export const GUILD_PROPOSAL_STATES = {
  None: "0",
  Submitted: "1",
  Rejected: "2",
  Executed: "3",
  Failed: "4",
};

export const VOTING_MACHINE_PROPOSAL_STATES = {
  None: "0",
  Expired: "1",
  ExecutedInQueue: "2",
  ExecutedInBoost: "3",
  Queued: "4",
  PreBoosted: "5",
  Boosted: "6",
  QuietEndingPeriod: "7",
};

export const VOTING_MACHINE_EXECUTION_STATES = {
  None: "0",
  Failed: "1",
  QueueBarCrossed: "2",
  QueueTimeOut: "3",
  PreBoostedBarCrossed: "4",
  BoostedTimeOut: "5",
  BoostedBarCrossed: "6",
};
