// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "./Create2PrivateDeployer.sol";
import "./Create2PublicDeployer.sol";

/*
 * @title Create2Deployer
 * @dev This contract is used to deploy contracts using CREATE2
 * It uses two other contracts to deploy the contracts:
 * - Create2PublicDeployer: This contract allows to deploy a contract using CREATE2 with the salt passed as a parameter.
 * - Create2PrivateDeployer: This contract allows to deploy a contract using CREATE2 and a private salt.
 *   By private we meant that the ONLY way to reproduce the address of the contract is to have access to teh account used for teh deployment.
 *   To enforce that condition we use the tx.origin global variable.
 */

contract Create2Deployer {
    event Deployed(address addr, bytes32 bytecodeHash, uint256 salt);

    Create2PublicDeployer public publicDeployer;
    Create2PrivateDeployer public privateDeployer;

    constructor() {
        publicDeployer = new Create2PublicDeployer();
        privateDeployer = new Create2PrivateDeployer();
    }

    function deployPublic(
        bytes memory code,
        bytes memory initializeCallData,
        uint256 salt
    ) public {
        address addr = publicDeployer.deploy(code, initializeCallData, salt);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), salt);
    }

    function deployPrivate(bytes memory code, bytes memory initializeCallData) public {
        address addr = privateDeployer.deploy(code, initializeCallData);
        emit Deployed(addr, keccak256(abi.encodePacked(code)), hashSender(tx.origin));
    }

    function getPublicDeployer() public view returns (address) {
        return address(publicDeployer);
    }

    function getPrivateDeployer() public view returns (address) {
        return address(privateDeployer);
    }

    function getPublicDeploymentAddress(bytes memory code, uint256 salt) public view returns (address) {
        return _calculateCreate2Address(address(publicDeployer), code, salt);
    }

    function getPrivateDeploymentAddress(bytes memory code, address sender) public view returns (address) {
        return _calculateCreate2Address(address(privateDeployer), code, hashSender(sender));
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
