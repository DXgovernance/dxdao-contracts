// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import {UD60x18, toUD60x18, fromUD60x18} from "@prb/math/src/UD60x18.sol";
import {SD59x18} from "@prb/math/src/SD59x18.sol";
import "./AccountSnapshot.sol";
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
contract DXDInfluence is OwnableUpgradeable, AccountSnapshot {
    using ArraysUpgradeable for uint256[];

    struct CumulativeStake {
        uint256 linearElement;
        uint256 exponentialElement;
    }

    DXDStake public dxdStake;
    VotingPower public votingPower;

    SD59x18 public linearFactor;
    SD59x18 public exponentialFactor;
    UD60x18 public exponent; // Must be immutable

    mapping(address => mapping(uint256 => CumulativeStake)) public cumulativeStakesSnapshots;
    mapping(uint256 => CumulativeStake) public totalStakeSnapshots;

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
     * @dev Changes the influence formula parameters. The owner modifying the formula parameters must make sure
     * that the parameters are safe, i.e. that the dxd influence space is bounded to positive values. Negative
     * influence values will make balanceOf(), balanceOfAt(), totalSupply() and totalSupplyAt() revert.
     * Influence should also be a monotonically non-decreasing function with respect to time. The longer a user
     * commits to stake, the greater the influence.
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
        CumulativeStake storage lastCumulativeStake = getLastCumulativeStake(_account);
        uint256 currentSnapshotId = _snapshot(_account);

        UD60x18 tc = toUD60x18(_timeCommitment);
        uint256 exponentialElement = fromUD60x18(toUD60x18(_amount).mul(tc.pow(exponent)));

        // Update account's stake data
        CumulativeStake storage cumulativeStake = cumulativeStakesSnapshots[_account][currentSnapshotId];
        cumulativeStake.linearElement = lastCumulativeStake.linearElement + _amount * _timeCommitment;
        cumulativeStake.exponentialElement = lastCumulativeStake.exponentialElement + exponentialElement;

        // Update global stake data
        CumulativeStake storage newTotalStake = totalStakeSnapshots[currentSnapshotId];
        CumulativeStake storage previousTotalStake = totalStakeSnapshots[currentSnapshotId - 1];
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
        CumulativeStake storage lastCumulativeStake = getLastCumulativeStake(_account);
        uint256 currentSnapshotId = _snapshot(_account);

        UD60x18 tc = toUD60x18(_timeCommitment);
        uint256 exponentialElement = fromUD60x18(toUD60x18(_amount).mul(tc.pow(exponent)));

        // Update account's stake data
        CumulativeStake storage cumulativeStake = cumulativeStakesSnapshots[_account][currentSnapshotId];
        cumulativeStake.linearElement = lastCumulativeStake.linearElement - _amount * _timeCommitment;
        cumulativeStake.exponentialElement = lastCumulativeStake.exponentialElement - exponentialElement;

        // Update global stake data
        CumulativeStake storage newTotalStake = totalStakeSnapshots[currentSnapshotId];
        CumulativeStake storage previousTotalStake = totalStakeSnapshots[currentSnapshotId - 1];
        newTotalStake.linearElement = previousTotalStake.linearElement - _amount * _timeCommitment;
        newTotalStake.exponentialElement = previousTotalStake.exponentialElement - exponentialElement;

        // Notify Voting Power contract.
        votingPower.callback();
    }

    /**
     * @dev Returns the last snapshot Id registered for a given account.
     * @param _account Account that has staked.
     */
    function getLastCumulativeStake(address _account) internal view returns (CumulativeStake storage) {
        uint256 currentSnapshotId = getCurrentSnapshotId();
        if (currentSnapshotId != 0) {
            uint256 lastRegisteredSnapshotId = _lastRegisteredSnapshotIdAt(currentSnapshotId, _account);
            return cumulativeStakesSnapshots[_account][lastRegisteredSnapshotId];
        } else {
            return cumulativeStakesSnapshots[_account][0];
        }
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
        CumulativeStake storage currentTotalStake = totalStakeSnapshots[snapshotId];
        return calculateInfluence(currentTotalStake);
    }

    /**
     * @dev Returns the amount of influence owned by `account`.
     */
    function balanceOf(address account) public view returns (uint256) {
        CumulativeStake storage cumulativeStake = cumulativeStakesSnapshots[account][_lastSnapshotId(account)];
        return calculateInfluence(cumulativeStake);
    }

    /**
     * @dev Retrieves the influence balance of `account` at the time `snapshotId` was created.
     */
    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256) {
        uint256 lastSnapshotId = _lastRegisteredSnapshotIdAt(snapshotId, account);
        CumulativeStake storage cumulativeStake = cumulativeStakesSnapshots[account][lastSnapshotId];
        return calculateInfluence(cumulativeStake);
    }

    /**
     * @dev Calculates influence for the given cumulative stake data point.
     * @param _cumulativeStake Accumulated stake information on a specific snapshot.
     */
    function calculateInfluence(CumulativeStake storage _cumulativeStake) internal view returns (uint256) {
        SD59x18 linearElement = SD59x18.wrap(int256(_cumulativeStake.linearElement));
        SD59x18 linearInfluence = linearFactor.mul(linearElement);

        SD59x18 exponentialElement = SD59x18.wrap(int256(_cumulativeStake.exponentialElement));
        SD59x18 exponentialInfluence = exponentialFactor.mul(exponentialElement);

        int256 influence = SD59x18.unwrap(linearInfluence.add(exponentialInfluence));
        require(influence >= 0, "DXDInfluence: negative influence, update formula");
        return uint256(influence);
    }

    /**
     * @dev Returns the number of decimals used (only used for display purposes)
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }
}
