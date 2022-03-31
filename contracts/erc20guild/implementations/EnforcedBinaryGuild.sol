// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.8;

import "../ERC20Guild.sol";
import "../../utils/Arrays.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

/*
  @title EnforcedBinaryGuild
  @author github:mprasanjith
  @dev An ERC20Guild which enforces all proposals to have a "No" action (which does nothing).
*/
contract EnforcedBinaryGuild is ERC20Guild {
    using SafeMathUpgradeable for uint256;
    using Arrays for uint256[];

    // @dev Create a proposal with an static call data and extra information, and a "No" action enforced.
    // @param to The receiver addresses of each call to be executed
    // @param data The data to be executed on each call to be executed
    // @param value The ETH value to be sent on each call to be executed
    // @param totalActions The amount of actions that would be offered to the voters
    // @param title The title of the proposal
    // @param contentHash The content hash of the content reference of the proposal for the proposal to be executed
    function createProposal(
        address[] memory to,
        bytes[] memory data,
        uint256[] memory value,
        uint256 totalActions,
        string memory title,
        string memory contentHash
    ) public virtual override returns (bytes32) {
        require(
            (to.length == data.length) && (to.length == value.length),
            "EnforcedBinaryGuild: Wrong length of to, data or value arrays"
        );
        require(to.length > 0, "EnforcedBinaryGuild: to, data, value arrays cannot be empty");

        address[] memory _to = new address[](to.length + 1);
        bytes[] memory _data = new bytes[](data.length + 1);
        uint256[] memory _value = new uint256[](value.length + 1);

        for (uint256 i = 0; i < to.length; i++) {
            _to[i] = to[i];
            _data[i] = data[i];
            _value[i] = value[i];
        }

        _to[_to.length - 1] = address(0);
        _data[_data.length - 1] = "";
        _value[_value.length - 1] = 0;
        totalActions += 1;

        return _createProposal(_to, _data, _value, totalActions, title, contentHash);
    }
}
