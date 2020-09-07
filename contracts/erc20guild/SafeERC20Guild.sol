// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.5.17;
pragma experimental ABIEncoderV2;

import "./ERC20GuildPermissioned.sol";
import "./ERC20GuildSnapshot.sol";

/// @title SafeERC20Guild
/// @author github:AugustoL
/// @notice This smart contract has not be audited.
/// @dev Extends the ERC20GuildLockable to save snapshots of the lockable votes per proposal.
/// Saves a snapshot of the votes each time a lock or release happens.
/// Proposals can be voted by voters using their locked tokens at the time of proposal creation.
contract SafeERC20Guild is ERC20GuildSnapshot, ERC20GuildPermissioned {

  constructor() public ERC20GuildSnapshot() ERC20GuildPermissioned() {}

}
