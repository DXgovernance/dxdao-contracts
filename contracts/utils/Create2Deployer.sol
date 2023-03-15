// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

contract Create2Deployer {
    error Create2Deployer__InitializedFailed();

    event Deployed(address addr, bytes32 bytecodeHash, uint256 salt);

    function deploy(bytes memory code, uint256 salt) public {
        address addr;
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        emit Deployed(addr, keccak256(abi.encodePacked(code)), salt);
    }

    function deployAndInitialize(
        bytes memory code,
        uint256 salt,
        bytes memory initializeCallData
    ) public {
        address addr;
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        (bool initializeSuccess, ) = addr.call{value: 0}(initializeCallData);

        if (!initializeSuccess) {
            revert Create2Deployer__InitializedFailed();
        }
        emit Deployed(addr, keccak256(abi.encodePacked(code)), salt);
    }
}
