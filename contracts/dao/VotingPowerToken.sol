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

    uint256 minStakingTokensLocked;

    //tokenAddress    weight
    mapping(address => uint256) public weights;

    //      token address     Internal snapshot  => token snapshot
    mapping(address => mapping(uint256 => uint256)) snapshots;

    uint256 public constant presition = 10_000_000;

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

    /// @dev Update tokens weight
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

    /// @dev Set config
    function setConfig(
        uint256 _repWeight,
        uint256 _stakingWeight,
        uint256 _minStakingTokensLocked
    ) public onlyOwner {
        minStakingTokensLocked = _minStakingTokensLocked;
        updateComposition(_repWeight, _stakingWeight);
    }

    /// @dev
    function callback(address _tokenHolder) external {
        require(
            msg.sender == address(repToken) || msg.sender == address(stakingToken),
            "Callback can be called only from DAOReputation and DXDStaking tokens"
        );

        _snapshot();
        ERC20SnapshotRep token = ERC20SnapshotRep(msg.sender);
        snapshots[msg.sender][_getCurrentSnapshotId()] = token.getCurrentSnapshotId();
    }

    function getVotingPowerPercentageOfAt(address _holder, uint256 _snapshotId) public view returns (uint256) {
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
        uint256 repPercent = getPercentageOfFrom(repBalance, repSupply, presition);
        uint256 stakingPercent = getPercentageOfFrom(stakingBalance, stakingSupply, presition);

        // Tokens weighted
        uint256 repPercentWeighted = getValueFromPercentage(repWeight, repPercent);
        uint256 stakingPercentWeighted = getValueFromPercentage(stakingWeight, stakingPercent);

        return repPercentWeighted + stakingPercentWeighted;
    }

    function getPercentageOfFrom(
        uint256 balance,
        uint256 totalSupply,
        uint256 p
    ) public pure returns (uint256) {
        return ((balance * p) * 100) / totalSupply;
    }

    function getValueFromPercentage(uint256 percentage, uint256 value) public pure returns (uint256) {
        uint256 v = (percentage * presition) / 100;
        return (v * value) / presition;
    }

    /// @dev Get the current snapshotId
    function getCurrentSnapshotId() public view returns (uint256) {
        return _getCurrentSnapshotId();
    }

    function getTokenSnapshotIdFromVPSnapshot(address tokenAddress, uint256 tokenSnapshotId)
        public
        view
        returns (uint256)
    {
        // TODO: validate token address
        // TODO: tokenSnapshotId is valid?
        return snapshots[tokenAddress][tokenSnapshotId];
    }
}

