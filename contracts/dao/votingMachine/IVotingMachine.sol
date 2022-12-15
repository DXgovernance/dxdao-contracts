// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

interface IVotingMachine {
    function propose(
        uint256,
        bytes32 paramsHash,
        address proposer,
        address organization
    ) external returns (bytes32);
}
