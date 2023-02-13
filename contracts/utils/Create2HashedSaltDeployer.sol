// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

/*
 * @title Create2HashedSaltDeployer
 * @dev This contract allows to deploy a contract using CREATE2 with the salt passed as a parameter.
 * The contract deployed is the bytecode passed on the code parameter.
 * The contract can also be initialized with a call to teh contract right after being deployed
 */
contract Create2HashedSaltDeployer {
    address public rootDeployer;

    constructor() {
        rootDeployer = msg.sender;
    }

    function deploy(
        bytes memory code,
        bytes memory initializeCallData,
        uint256 salt
    ) public returns (address addr) {
        require(msg.sender == rootDeployer, "Create2HashedSaltDeployer: Only rootDeployer owner can deploy");

        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        if (initializeCallData.length > 0) {
            addr.call{value: 0}(initializeCallData);
        }
    }
}
