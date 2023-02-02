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

    /**
     * @dev Changes the influence formula factors.
     * @param _linearFactor Factor that will multiply the linear element of the influence. 18 decimals.
     * @param _exponentialFactor Factor that will multiply the exponential element of the influence. 18 decimals.
     */
    function changeFormula(int256 _linearFactor, int256 _exponentialFactor) external onlyOwner {
        linearFactor = SD59x18.wrap(_linearFactor);
        exponentialFactor = SD59x18.wrap(_exponentialFactor);
    }

    /**
     * @dev Mints influence tokens according to the amount staked and takes a snapshot. The influence value
     * is not stored, only the linear and exponential elements of the formula are updated, which are then used
     * to compute the influence on the fly in the balance and total supply getters.
     * @param _account Account that has staked the tokens.
     * @param _amount Amount of tokens to have been staked.
     * @param _timeCommitment Time that the user commits to lock the tokens.
     */
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

    /**
     * @dev Burns influence tokens according to the amount withdrawn and takes a snapshot. The influence value
     * is not stored, only the linear and exponential elements of the formula are updated, which are then used
     * to compute the influence on the fly in the balance and total supply getters.
     * @param _account Account that has staked the tokens.
     * @param _amount Amount of tokens to have been staked.
     * @param _timeCommitment Time that the user commits to lock the tokens.
     */
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

    /**
     * @dev Returns the last snapshot Id registered for a given account.
     * @param _account Account that has staked.
     */
    function getLastCummulativeStake(address _account) internal view returns (CummulativeStake storage) {
        uint256 lastRegisteredSnapshotId = _lastRegisteredSnapshotIdAt(getCurrentSnapshotId(), _account);
        return cummulativeStakes[_account][lastRegisteredSnapshotId];
    }

    /**
     * @dev Returns the amount of influence in existence.
     */
    function totalSupply() public view returns (uint256) {
        return totalSupplyAt(getCurrentSnapshotId());
    }

    /**
     * @dev Retrieves the influence total supply at the time `snapshotId` was created.
     */
    function totalSupplyAt(uint256 snapshotId) public view returns (uint256) {
        CummulativeStake storage currentTotalStake = totalStake[snapshotId];
        return getInfluence(currentTotalStake);
    }

    /**
     * @dev Returns the amount of influence owned by `account`.
     */
    function balanceOf(address account) public view returns (uint256) {
        CummulativeStake storage cummulativeStake = cummulativeStakes[account][_lastSnapshotId(account)];
        return getInfluence(cummulativeStake);
    }

    /**
     * @dev Retrieves the influence balance of `account` at the time `snapshotId` was created.
     */
    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256) {
        uint256 lastSnapshotId = _lastRegisteredSnapshotIdAt(snapshotId, account);
        CummulativeStake storage cummulativeStake = cummulativeStakes[account][lastSnapshotId];
        return getInfluence(cummulativeStake);
    }

    /**
     * @dev Calculates influence for the given cummulative stake data point.
     * @param _cummulativeStake Accumulated stake information on a specific snapshot.
     */
    function getInfluence(CummulativeStake storage _cummulativeStake) internal view returns (uint256) {
        SD59x18 linearElement = SD59x18.wrap(int256(_cummulativeStake.linearElement));
        SD59x18 linearInfluence = linearFactor.mul(linearElement);

        SD59x18 exponentialElement = SD59x18.wrap(int256(_cummulativeStake.exponentialElement));
        SD59x18 exponentialInfluence = exponentialFactor.mul(exponentialElement);

        SD59x18 influence = linearInfluence.add(exponentialInfluence);
        return uint256(SD59x18.unwrap(influence));
    }

    /**
     * @dev Returns the number of decimals used (only used for display purposes)
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }
}
