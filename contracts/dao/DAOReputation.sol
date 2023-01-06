// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "../utils/ERC20/ERC20SnapshotRep.sol";

/**
 * @title DAO Reputation
 * @dev An ERC20 token that is non-transferable, owned and controlled by the DAO.
 * Used by the DAO to vote on proposals.
 * It uses a snapshot mechanism to keep track of the reputation at the moment of
 * each modification of the supply of the token (every mint an burn).
 */
contract DAOReputation is ERC20SnapshotRep {

}
