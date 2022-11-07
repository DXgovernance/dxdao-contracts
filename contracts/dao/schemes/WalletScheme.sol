// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Scheme.sol";

/**
 * @title WalletScheme.
 * @dev An implementation of Scheme where the scheme has only 2 options and execute calls form the scheme itself.
 * Option 1 will execute all the calls that where submitted in the proposeCalls.
 * Option 2 will mark the proposal as rejected and execute empty calls
 */
contract WalletScheme is Scheme {
    using SafeMath for uint256;
    using Address for address;

    /**
     * @dev Receive function that allows the wallet to receive ETH when the controller address is not set
     */
    receive() external payable {}

    /**
     * @dev Propose calls to be executed, the calls have to be allowed by the permission registry
     * @param _to - The addresses to call
     * @param _callData - The abi encode data for the calls
     * @param _value value(ETH) to transfer with the calls
     * @param _totalOptions The amount of options to be voted on
     * @param _title title of proposal
     * @param _descriptionHash proposal description hash
     * @return proposalId id which represents the proposal
     */
    function proposeCalls(
        address[] calldata _to,
        bytes[] calldata _callData,
        uint256[] calldata _value,
        uint256 _totalOptions,
        string calldata _title,
        string calldata _descriptionHash
    ) public override returns (bytes32 proposalId) {
        require(_totalOptions == 2, "WalletScheme: The total amount of options should be 2");

        for (uint256 i = _to.length.div(2); i < _to.length; i++) {
            require(
                _to[i] == address(0) && _callData[i].length == 0 && _value[i] == 0,
                "WalletScheme: The second half of the calls should be empty"
            );
        }

        return super.proposeCalls(_to, _callData, _value, _totalOptions, _title, _descriptionHash);
    }

    /**
     * @dev Get the scheme type
     */
    function getSchemeType() external view override returns (string memory) {
        return "WalletScheme_v1";
    }
}
