// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC1271Upgradeable.sol";
import "../ERC20GuildUpgradeable.sol";

/*
  @title ERC20GuildWithERC1271
  @author github:AugustoL
  @dev The guild can sign EIP1271 messages, to do this the guild needs to call itself and allow 
    the signature to be verified with and extra signature of any account with voting power.
*/
contract ERC20GuildWithERC1271 is ERC20GuildUpgradeable, IERC1271Upgradeable {
    using SafeMathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    // The EIP1271 hashes that were signed by the ERC20Guild
    // Once a hash is signed by the guild it can be verified with a signature from any voter with balance
    mapping(bytes32 => bool) public EIP1271SignedHashes;

    // @dev Set a hash of an call to be validated using EIP1271
    // @param _hash The EIP1271 hash to be added or removed
    // @param isValid If the hash is valid or not
    function setEIP1271SignedHash(bytes32 _hash, bool isValid) external virtual {
        require(msg.sender == address(this), "ERC20GuildWithERC1271: Only callable by the guild");
        EIP1271SignedHashes[_hash] = isValid;
    }

    // @dev Gets the validity of a EIP1271 hash
    // @param _hash The EIP1271 hash
    function getEIP1271SignedHash(bytes32 _hash) external view virtual returns (bool) {
        return EIP1271SignedHashes[_hash];
    }

    // @dev Get if the hash and signature are valid EIP1271 signatures
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue) {
        return
            ((votingPowerOf(hash.recover(signature)) > 0) && EIP1271SignedHashes[hash])
                ? this.isValidSignature.selector
                : bytes4(0);
    }
}
