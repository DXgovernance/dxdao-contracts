// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import {UD60x18, uUNIT, wrap, unwrap} from "@prb/math/src/UD60x18.sol";
import "./DataSnapshot.sol";
import "./DXDStake.sol";

interface VotingPower {
    function callback() external;
}

/**
 * @title DXDInfluence
 * @dev Keeps track of the time commitment of accounts that have staked. The more DXD is staked and
 * the more time the DXD tokens are staked, the more influence the user will have on the DAO.
 * DXDInfluence notifies the Voting Power contract of any stake changes.
 */
contract DXDInfluence is OwnableUpgradeable, DataSnapshot {
    using ArraysUpgradeable for uint256[];

    struct CummulativeStake {
        uint256 linearElement;
        uint256 exponentialElement;
    }

    DXDStake public dxdStake;
    VotingPower public votingPower;
    mapping(uint256 => uint256) public snapshotTimes; // snapshotTimes[snapshotId]

    int256 public linearFactor;
    int256 public exponentialFactor;
    UD60x18 public exponent; // Must be immutable

    mapping(address => mapping(uint256 => CummulativeStake)) public cummulativeStakes;
    mapping(uint256 => CummulativeStake) public totalStake;

    /// @notice Error when trying to transfer influence
    error Influence__NoTransfer();

    constructor() {}

    function initialize(
        address _dxdStake,
        address _votingPower,
        int256 _linearFactor,
        int256 _exponentialFactor,
        uint256 _exponent
    ) external initializer {
        __Ownable_init();

        _transferOwnership(_dxdStake);
        dxdStake = DXDStake(_dxdStake);
        votingPower = VotingPower(_votingPower);

        linearFactor = _linearFactor;
        exponentialFactor = _exponentialFactor;
        exponent = wrap(_exponent);
    }

    function changeFormula(int256 _linearFactor, int256 _exponentialFactor) external onlyOwner {
        linearFactor = _linearFactor;
        exponentialFactor = _exponentialFactor;
    }

    /// @dev Stakes tokens from the user.
    /// @param _account Account that has staked the tokens.
    /// @param _amount Amount of tokens to have been staked.
    /// @param _timeCommitment Amount of tokens to have been staked.
    function mint(
        address _account,
        uint256 _amount,
        uint256 _timeCommitment
    ) external onlyOwner {
        uint256 currentSnapshotId = _snapshot(_account);
        snapshotTimes[currentSnapshotId] = block.timestamp; // Not needed now, but may be useful in future upgrades.
        CummulativeStake storage lastCummulativeStake = getLastCummulativeStake(_account);

        UD60x18 tc = wrap(_timeCommitment * uUNIT);
        uint256 exponentialElement = unwrap(wrap(_amount * uUNIT).mul(tc.pow(exponent))) / uUNIT;

        // Update account's stake data
        CummulativeStake storage cummulativeStake = cummulativeStakes[msg.sender][currentSnapshotId];
        cummulativeStake.linearElement = lastCummulativeStake.linearElement + _amount * _timeCommitment;
        cummulativeStake.exponentialElement = lastCummulativeStake.exponentialElement + exponentialElement;

        // Update global stake data
        CummulativeStake storage newTotalStake = totalStake[currentSnapshotId];
        CummulativeStake storage previousTotalStake = totalStake[currentSnapshotId - 1];
        newTotalStake.linearElement = previousTotalStake.linearElement + _amount * _timeCommitment;
        newTotalStake.exponentialElement = previousTotalStake.exponentialElement + exponentialElement;

        // Notify Voting Power contract.
        votingPower.callback();
    }

    /// @dev Stakes tokens from the user.
    /// @param _account Account that has staked the tokens.
    /// @param _amount Amount of tokens to have been staked.
    /// @param _timeCommitment Amount of tokens to have been staked.
    function burn(
        address _account,
        uint256 _amount,
        uint256 _timeCommitment
    ) external onlyOwner {
        uint256 currentSnapshotId = _snapshot(_account);
        snapshotTimes[currentSnapshotId] = block.timestamp; // Not needed now, but may be useful in future upgrades.
        CummulativeStake storage lastCummulativeStake = getLastCummulativeStake(_account);

        UD60x18 tc = wrap(_timeCommitment * uUNIT);
        uint256 exponentialElement = unwrap(wrap(_amount * uUNIT).mul(tc.pow(exponent))) / uUNIT;

        // Update account's stake data
        CummulativeStake storage cummulativeStake = cummulativeStakes[msg.sender][currentSnapshotId];
        cummulativeStake.linearElement = lastCummulativeStake.linearElement - _amount * _timeCommitment;
        cummulativeStake.exponentialElement = lastCummulativeStake.exponentialElement - exponentialElement;

        // Update global stake data
        CummulativeStake storage newTotalStake = totalStake[currentSnapshotId];
        CummulativeStake storage previousTotalStake = totalStake[currentSnapshotId - 1];
        newTotalStake.linearElement = previousTotalStake.linearElement - _amount * _timeCommitment;
        newTotalStake.exponentialElement = previousTotalStake.exponentialElement - exponentialElement;

        // Notify Voting Power contract.
        votingPower.callback();
    }

    function getLastCummulativeStake(address _account) internal view returns (CummulativeStake storage) {
        uint256 lastRegisteredSnapshotId = _lastRegisteredSnapshotIdAt(getCurrentSnapshotId(), _account);
        return cummulativeStakes[_account][lastRegisteredSnapshotId];
    }

    function totalSupply() public view returns (uint256) {
        return totalSupplyAt(getCurrentSnapshotId());
    }

    function totalSupplyAt(uint256 snapshotId) public view returns (uint256) {
        CummulativeStake storage currentTotalStake = totalStake[snapshotId];

        int256 linearInfluence = linearFactor * int256(currentTotalStake.linearElement);
        int256 exponentialInfluence = exponentialFactor * int256(currentTotalStake.exponentialElement);
        uint256 totalInfluence = uint256(linearInfluence + exponentialInfluence);

        return totalInfluence;
    }

    function balanceOf(address account) public view returns (uint256) {
        CummulativeStake storage cummulativeStake = cummulativeStakes[account][_lastSnapshotId(account)];

        int256 linearInfluence = linearFactor * int256(cummulativeStake.linearElement);
        int256 exponentialInfluence = exponentialFactor * int256(cummulativeStake.exponentialElement);
        uint256 influence = uint256(linearInfluence + exponentialInfluence);

        return influence;
    }

    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256) {
        uint256 lastSnapshotId = _lastRegisteredSnapshotIdAt(snapshotId, account);
        CummulativeStake storage cummulativeStake = cummulativeStakes[account][lastSnapshotId];

        int256 linearInfluence = linearFactor * int256(cummulativeStake.linearElement);
        int256 exponentialInfluence = exponentialFactor * int256(cummulativeStake.exponentialElement);
        uint256 influence = uint256(linearInfluence + exponentialInfluence);

        return influence;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }
}
