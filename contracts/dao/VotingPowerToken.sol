// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "../utils/ERC20/ERC20SnapshotRep.sol";

contract VotingPowerToken is ERC20SnapshotUpgradeable, OwnableUpgradeable {
    // The ERC20 rep token that will be used as source of voting power
    ERC20SnapshotRep public repToken;

    // staking token
    ERC20SnapshotRep public stakingToken;

    /// @notice Minimum staking tokens locked to apply weight
    uint256 minStakingTokensLocked;

    //tokenAddress    weight
    mapping(address => uint256) public weights;

    //      token address     Internal snapshot  => token snapshot
    mapping(address => mapping(uint256 => uint256)) snapshots;

    uint256 public constant precision = 10_000_000;

    function initialize(
        address _repToken,
        address _stakingToken,
        uint256 repWeight,
        uint256 stakingWeight,
        uint256 _minStakingTokensLocked
    ) public virtual initializer {
        __Ownable_init();
        require(_repToken != _stakingToken, "Rep token and staking token cannot be the same.");
        require(_minStakingTokensLocked > 0, "Minimum staking tokens locked must be greater than zero.");

        repToken = ERC20SnapshotRep(address(_repToken));
        stakingToken = ERC20SnapshotRep(address(_stakingToken));
        setConfig(repWeight, stakingWeight, minStakingTokensLocked);
        _snapshot();
    }

    /// @dev Update trepWeightokens weight
    /// @param  repWeight Weight of DAOReputation token
    /// @param stakingWeight Weight of DXDStaking token
    function updateComposition(uint256 repWeight, uint256 stakingWeight) public onlyOwner {
        require(repWeight > 0 && stakingWeight > 0, "Weights must be greater than zero.");
        require(repWeight + stakingWeight == 100, "Weights sum must be equal to 100");

        if (stakingToken.totalSupply() < minStakingTokensLocked) {
            weights[address(repToken)] = 100;
        } else {
            weights[address(repToken)] = repWeight;
            weights[address(stakingToken)] = stakingWeight;
        }
    }

    /// @dev Set VPToken config
    /// @param _repWeight New DAOReputation token weight
    /// @param _stakingWeight New DXDStaking token weight
    /// @param _minStakingTokensLocked Minimum staking tokens locked to apply weight
    function setConfig(uint256 _repWeight, uint256 _stakingWeight, uint256 _minStakingTokensLocked) public onlyOwner {
        minStakingTokensLocked = _minStakingTokensLocked;
        updateComposition(_repWeight, _stakingWeight);
    }

    /// @dev callback to be executed from rep and dxdStake tokens after mint/burn
    /// It stores a reference to the rep/stake token snapshotId from internal snapshotId
    function callback() external {
        require(
            msg.sender == address(repToken) || msg.sender == address(stakingToken),
            "Callback can be called only from DAOReputation and DXDStaking tokens"
        );

        _snapshot();
        ERC20SnapshotRep token = ERC20SnapshotRep(msg.sender);
        snapshots[msg.sender][_getCurrentSnapshotId()] = token.getCurrentSnapshotId();
    }

    /// @dev Get the voting power percentage of `_holder` at certain `_snapshotId`
    /// @param _holder Account we want to get voting power from
    /// @param _snapshotId VPToken SnapshotId we want get votingPower from
    /// @return votingPower The votingPower of `_holder`
    function getVotingPowerPercentageOfAt(
        address _holder,
        uint256 _snapshotId
    ) public view returns (uint256 votingPower) {
        // Token Snapshot
        uint256 repSnapshotId = snapshots[address(repToken)][_snapshotId];
        uint256 stakingSnapshotId = snapshots[address(stakingToken)][_snapshotId];

        // Token balances
        uint256 repBalance = repToken.balanceOfAt(_holder, repSnapshotId);
        uint256 stakingBalance = stakingToken.balanceOfAt(_holder, stakingSnapshotId);

        // Token weights
        uint256 repWeight = weights[address(repToken)];
        uint256 stakingWeight = weights[address(stakingToken)];

        // Token supplies
        uint256 repSupply = repToken.totalSupplyAt(repSnapshotId);
        uint256 stakingSupply = stakingToken.totalSupplyAt(stakingSnapshotId);

        // Token percentages
        uint256 repPercent = getPercentageOfFrom(repBalance, repSupply);
        uint256 stakingPercent = getPercentageOfFrom(stakingBalance, stakingSupply);

        // Tokens weighted
        uint256 repPercentWeighted = getValueFromPercentage(repWeight, repPercent);
        uint256 stakingPercentWeighted = getValueFromPercentage(stakingWeight, stakingPercent);

        return repPercentWeighted + stakingPercentWeighted;
    }

    function getPercentageOfFrom(uint256 balance, uint256 totalSupply) public pure returns (uint256) {
        return ((balance * precision) * 100) / totalSupply;
    }

    function getValueFromPercentage(uint256 percentage, uint256 value) public pure returns (uint256) {
        uint256 v = (percentage * precision) / 100;
        return (v * value) / precision;
    }

    /// @dev Get the current VPToken snapshotId
    /// @return snapshotId Current VPToken snapshotId
    function getCurrentSnapshotId() public view returns (uint256 snapshotId) {
        return _getCurrentSnapshotId();
    }

    /// @dev Get the external token snapshotId for given VPToken snapshotId
    /// @param tokenAddress Address of the external token (rep/dxd) we want to get snapshotId from
    /// @param tokenSnapshotId SnapshotId from VPToken
    /// @return snapshotId SnapshotId from `tokenAddress` stored at VPToken `tokenSnapshotId`
    function getTokenSnapshotIdFromVPSnapshot(
        address tokenAddress,
        uint256 tokenSnapshotId
    ) public view returns (uint256 snapshotId) {
        // TODO: validate token address
        // TODO: tokenSnapshotId is valid?
        return snapshots[tokenAddress][tokenSnapshotId];
    }
}
