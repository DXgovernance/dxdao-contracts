// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import {UD60x18, toUD60x18, fromUD60x18} from "@prb/math/src/UD60x18.sol";
import {SD59x18} from "@prb/math/src/SD59x18.sol";
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

    SD59x18 public linearFactor;
    SD59x18 public exponentialFactor;
    UD60x18 public exponent; // Must be immutable

    mapping(address => mapping(uint256 => CummulativeStake)) public cummulativeStakes;
    mapping(uint256 => CummulativeStake) public totalStake;

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

        linearFactor = SD59x18.wrap(_linearFactor);
        exponentialFactor = SD59x18.wrap(_exponentialFactor);
        exponent = UD60x18.wrap(_exponent);
    }

    function changeFormula(int256 _linearFactor, int256 _exponentialFactor) external onlyOwner {
        linearFactor = SD59x18.wrap(_linearFactor);
        exponentialFactor = SD59x18.wrap(_exponentialFactor);
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

        UD60x18 tc = toUD60x18(_timeCommitment);
        uint256 exponentialElement = fromUD60x18(toUD60x18(_amount).mul(tc.pow(exponent)));

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

        UD60x18 tc = toUD60x18(_timeCommitment);
        uint256 exponentialElement = fromUD60x18(toUD60x18(_amount).mul(tc.pow(exponent)));

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
        return getInfluence(currentTotalStake);
    }

    function balanceOf(address account) public view returns (uint256) {
        CummulativeStake storage cummulativeStake = cummulativeStakes[account][_lastSnapshotId(account)];
        return getInfluence(cummulativeStake);
    }

    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256) {
        uint256 lastSnapshotId = _lastRegisteredSnapshotIdAt(snapshotId, account);
        CummulativeStake storage cummulativeStake = cummulativeStakes[account][lastSnapshotId];
        return getInfluence(cummulativeStake);
    }

    function getInfluence(CummulativeStake storage _cummulativeStake) internal view returns (uint256) {
        SD59x18 linearElement = SD59x18.wrap(int256(_cummulativeStake.linearElement));
        SD59x18 linearInfluence = linearFactor.mul(linearElement);

        SD59x18 exponentialElement = SD59x18.wrap(int256(_cummulativeStake.exponentialElement));
        SD59x18 exponentialInfluence = exponentialFactor.mul(exponentialElement);

        SD59x18 influence = linearInfluence.add(exponentialInfluence);
        return uint256(SD59x18.unwrap(influence));
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }
}
