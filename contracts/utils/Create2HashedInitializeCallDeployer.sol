// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

/*
 * @title Create2HashedInitializeCallDeployer
 * @dev This contract allows to deploy a contract using CREATE2 hashing the initializeCallData.
 * The ONLY way to reproduce the address of the contract is to deploy and initialize the contract with the same
 * initializeCallData.
 * The salt of the contract is the hash of the initializeCallData.
 * The contract deployed is the bytecode passed on the code parameter.
 */
contract Create2HashedInitializeCallDeployer {
    address public rootDeployer;

    constructor() {
        rootDeployer = msg.sender;
    }

    function deploy(bytes memory code, bytes memory initializeCallData) public returns (address addr) {
        require(msg.sender == rootDeployer, "Create2HashedInitializeCallDeployer: Only rootDeployer owner can deploy");
        require(initializeCallData.length > 0, "Create2HashedInitializeCallDeployer: initializeCallData cant be 0x0");

        uint256 salt = uint256(keccak256(abi.encodePacked(initializeCallData)));
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        addr.call{value: 0}(initializeCallData);
    }
}
