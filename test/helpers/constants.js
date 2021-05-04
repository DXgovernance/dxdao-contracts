export const GAS_LIMIT = process.env.OVERRIDE_GAS_LIMIT || 9000000;
export const GAS_PRICE = process.env.OVERRIDE_GAS_PRICE || 10000000000;

export const MAX_UINT_256 = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
export const NULL_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const SOME_HASH = "0x1000000000000000000000000000000000000000000000000000000000000000";
export const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
export const SOME_ADDRESS = "0x1000000000000000000000000000000000000000";
export const ANY_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
export const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";
export const TEST_VALUE = 666;
export const TEST_TITLE = "Awesome Proposal Title";
export const ERC20_TRANSFER_SIGNATURE = "0xa9059cbb";

export const WalletSchemeProposalState = {
  submitted: 0,
  rejected: 1,
  executionSuccedd: 2,
  executionFailed: 3
};

export const GuildProposalState = {
  Submitted: 0,
  Rejected: 1,
  Executed: 2,
  Failed: 3
};
