// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "./Create2HashedSaltDeployer.sol";
import "./Create2HashedSenderDeployer.sol";
import "./Create2HashedOriginDeployer.sol";
import "./Create2HashedInitializeCallDeployer.sol";

/**
    @title Create2Deployer
    @dev A contract for deploying contracts using CREATE2 opcode, which allows for deterministic deployment of contracts.
    This contract uses four other contracts for deploying:
    - Create2HashedSaltDeployer: allows to deploy a contract using CREATE2 with the salt passed as a parameter.
    - Create2HashedSenderDeployer: allows to deploy a contract using CREATE2 hashing the sender address of the transaction.
    - Create2HashedOriginDeployer: allows to deploy a contract using CREATE2 hashing the origin ethereum account address of the transaction.
    - Create2HashedInitializeCallDeployer: allows to deploy a contract using CREATE2 hashing the initialization call data of the contract.
    The contract deployed is the bytecode passed on the code parameter.
    The contract can also be initialized with a call to the contract right after being deployed.
*/

contract Create2Deployer {
    event Deployed(address addr, bytes32 bytecodeHash, uint256 salt, uint256 deploymentType);

    Create2HashedSaltDeployer public hashedSaltDeployer;
    Create2HashedSenderDeployer public hashedSenderDeployer;
    Create2HashedOriginDeployer public hashedOriginDeployer;
    Create2HashedInitializeCallDeployer public hashedInitializeCallDeployer;

    constructor() {
        hashedSaltDeployer = new Create2HashedSaltDeployer();
        hashedSenderDeployer = new Create2HashedSenderDeployer();
        hashedOriginDeployer = new Create2HashedOriginDeployer();
        hashedInitializeCallDeployer = new Create2HashedInitializeCallDeployer();
    }

    function deployWithHashedSalt(
        bytes memory code,
        bytes memory initializeCallData,
        uint256 salt
    ) public {
        address addr = hashedSaltDeployer.deploy(code, initializeCallData, salt);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), salt, 1);
    }

    function deployWithHashedSender(bytes memory code, bytes memory initializeCallData) public {
        address addr = hashedSenderDeployer.deploy(code, initializeCallData, msg.sender);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), hashSender(msg.sender), 2);
    }

    function deployWithHashedOrigin(bytes memory code, bytes memory initializeCallData) public {
        address addr = hashedOriginDeployer.deploy(code, initializeCallData);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), hashSender(tx.origin), 3);
    }

    function deployWithHashedInitializeCall(bytes memory code, bytes memory initializeCallData) public {
        address addr = hashedInitializeCallDeployer.deploy(code, initializeCallData);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), hashInitializeCallData(initializeCallData), 4);
    }

    function getHashedSaltDeployAddress(bytes memory code, uint256 salt) public view returns (address) {
        return _calculateCreate2Address(address(hashedSaltDeployer), code, salt);
    }

    function getHashedSenderDeployAddress(bytes memory code, address sender) public view returns (address) {
        return _calculateCreate2Address(address(hashedSenderDeployer), code, hashSender(sender));
    }

    function getHashedOriginDeployAddress(bytes memory code, address origin) public view returns (address) {
        return _calculateCreate2Address(address(hashedOriginDeployer), code, hashSender(origin));
    }

    function getHashedInitializeCallDeployAddress(bytes memory code, bytes memory initializeCallData)
        public
        view
        returns (address)
    {
        return
            _calculateCreate2Address(
                address(hashedInitializeCallDeployer),
                code,
                hashInitializeCallData(initializeCallData)
            );
    }

    function hashSender(address sender) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(sender)));
    }

    function hashInitializeCallData(bytes memory initializeCallData) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(initializeCallData)));
    }

    function _calculateCreate2Address(
        address deployer,
        bytes memory code,
        uint256 salt
    ) internal pure returns (address) {
        return
            address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(deployer), salt, keccak256(code)))))
            );
    }
}
