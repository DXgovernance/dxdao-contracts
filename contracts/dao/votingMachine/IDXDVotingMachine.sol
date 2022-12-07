// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

interface IDXDVotingMachine {
    function propose(
        uint256,
        bytes32 _paramsHash,
        address _proposer,
        address _organization
    ) external returns (bytes32);
}
