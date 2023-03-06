// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

/**
    @title Create2HashedSenderDeployer
    @dev This contract allows to deploy a contract using CREATE2 hashing the sender address of the transaction.
    The ONLY way to reproduce the address of the contract is to have access to the account used for the deployment.
    The salt of the contract is the hash of the sender address.
    The contract deployed is the bytecode passed on the code parameter.
    The contract can also be initialized with a call to the contract right after being deployed.
*/
contract Create2HashedSenderDeployer {
    address public immutable rootDeployer;

    constructor() {
        rootDeployer = msg.sender;
    }

    function deploy(
        bytes memory code,
        bytes memory initializeCallData,
        address sender
    ) public returns (address addr) {
        require(msg.sender == rootDeployer, "Create2HashedSenderDeployer: Only rootDeployer owner can deploy");

        uint256 salt = uint256(keccak256(abi.encodePacked(sender)));
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        if (initializeCallData.length > 0) {
            (bool success, ) = addr.call{value: 0}(initializeCallData);
            require(success, "Create2HashedSenderDeployer: initializeCallData failed");
        }
    }
}
