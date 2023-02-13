// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "./Create2HashedSenderDeployer.sol";
import "./Create2HashedSaltDeployer.sol";

/*
 * @title Create2Deployer
 * @dev This contract is used to deploy contracts using CREATE2
 * It uses two other contracts to deploy the contracts:
 * - Create2HashedSalt: This contract allows to deploy a contract using CREATE2 with the salt passed as a parameter.
 * - Create2HashedSender: This contract allows to deploy a contract using CREATE2 hashing the sender address of the tx.
 *   The ONLY way to reproduce the address of the contract is to have access to the account used for the deployment.
 *   To enforce that condition we use the tx.origin global variable.
 */

contract Create2Deployer {
    event Deployed(address addr, bytes32 bytecodeHash, uint256 salt, uint256 deploymentType);

    Create2HashedSaltDeployer public hashedSaltDeployer;
    Create2HashedSenderDeployer public hashedSender;

    constructor() {
        hashedSaltDeployer = new Create2HashedSaltDeployer();
        hashedSender = new Create2HashedSenderDeployer();
    }

    function deployPublic(
        bytes memory code,
        bytes memory initializeCallData,
        uint256 salt
    ) public {
        address addr = hashedSaltDeployer.deploy(code, initializeCallData, salt);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), salt, 1);
    }

    function deployPrivate(bytes memory code, bytes memory initializeCallData) public {
        address addr = hashedSender.deploy(code, initializeCallData);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), hashSender(tx.origin), 2);
    }

    function getPublicDeployer() public view returns (address) {
        return address(hashedSaltDeployer);
    }

    function getPrivateDeployer() public view returns (address) {
        return address(hashedSender);
    }

    function getPublicDeploymentAddress(bytes memory code, uint256 salt) public view returns (address) {
        return _calculateCreate2Address(address(hashedSaltDeployer), code, salt);
    }

    function getPrivateDeploymentAddress(bytes memory code, address sender) public view returns (address) {
        return _calculateCreate2Address(address(hashedSender), code, hashSender(sender));
    }

    function hashSender(address sender) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(sender)));
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
