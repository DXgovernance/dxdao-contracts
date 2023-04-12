// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleClaim is Ownable {
    bytes32 public immutable merkleRoot;
    ERC20 public immutable token;
    uint256 public immutable claimDeadline;

    mapping(address => bool) public hasClaimed;

    /// @notice Thrown if address has already claimed
    error AlreadyClaimed();
    /// @notice Thrown if address/amount are not part of Merkle tree
    error NotInMerkle();
    /// @notice Thrown if not on claim period and claimDeadline reached
    error ClaimDeadlineReached();
    /// @notice Thrown if not on endClaim period and claimDeadline not reached
    error ClaimDeadlineNotReached();

    /// @notice Creates a new MerkleClaim contract
    /// @param _token address of the token to be claimed
    /// @param _merkleRoot of claimees
    constructor(
        address _owner,
        address _token,
        bytes32 _merkleRoot,
        uint256 _claimDeadline
    ) {
        // Claim deadline needs to be at least in one year
        require(
            (block.timestamp + 365 days) <= _claimDeadline,
            "MerkleClaim: claimDeadline needs to be at least in a year"
        );
        _transferOwnership(_owner);
        claimDeadline = _claimDeadline;
        token = ERC20(_token);
        merkleRoot = _merkleRoot;
    }

    /// @notice Emitted after a successful token claim
    /// @param to recipient of claim
    /// @param amount of tokens claimed
    event Claim(address indexed to, uint256 amount);

    /// @notice Allows claiming tokens if address is part of merkle tree
    /// @param to address of claimee
    /// @param amount of tokens owed to claimee
    /// @param proof merkle proof to prove address and amount are in tree
    function claim(
        address to,
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        // Throw if not on claim period and claimDeadline reached
        if (block.timestamp > claimDeadline) revert ClaimDeadlineReached();

        // Throw if address has already claimed tokens
        if (hasClaimed[to]) revert AlreadyClaimed();

        // Verify merkle proof, or revert if not in tree
        bytes32 leaf = keccak256(abi.encodePacked(to, amount));
        bool isValidLeaf = MerkleProof.verify(proof, merkleRoot, leaf);
        if (!isValidLeaf) revert NotInMerkle();

        // Set address to claimed
        hasClaimed[to] = true;

        // Send tokens to address
        token.transfer(to, amount);

        // Emit claim event
        emit Claim(to, amount);
    }

    /// @notice Allows the owner to end the claim period and transfer all remaining tokens to owner
    function endClaim() external onlyOwner {
        // Throw if not on endClaim period and claimDeadline not reached
        if (block.timestamp <= claimDeadline) revert ClaimDeadlineNotReached();

        token.transfer(owner(), token.balanceOf(address(this)));
    }
}
