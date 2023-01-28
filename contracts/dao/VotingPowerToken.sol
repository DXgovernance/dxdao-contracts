// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "../utils/ERC20/ERC20SnapshotRep.sol";
import "hardhat/console.sol";

contract VotingPowerToken is ERC20SnapshotUpgradeable, OwnableUpgradeable {
    // The ERC20 rep token that will be used as source of voting power
    ERC20SnapshotRep public repToken;

    // staking token
    ERC20SnapshotRep public stakingToken;

    /// @notice Minimum staking tokens locked to apply weight
    uint256 minStakingTokensLocked;

    //tokenAddress    weight
    mapping(address => uint256) public weights;

    //      tokenAddress     Internal snapshot  => token snapshot
    mapping(address => mapping(uint256 => uint256)) snapshots;

    uint256 public constant precision = 100_000_000;

    /// @dev Verify if address is one of rep or staking tokens
    modifier onlyInternalTokens(address _add) {
        require(_add == address(repToken) || _add == address(stakingToken), "VotingPowerToken: Invalid token address");
        _;
    }

    function initialize(
        address _repToken,
        address _stakingToken,
        uint256 repWeight,
        uint256 stakingWeight,
        uint256 _minStakingTokensLocked
    ) public virtual initializer {
        __Ownable_init();
        require(_repToken != _stakingToken, "Rep token and staking token cannot be the same.");
        // Validate weights before setting internal tokens
        validateComposition(repWeight, stakingWeight);
        repToken = ERC20SnapshotRep(address(_repToken));
        stakingToken = ERC20SnapshotRep(address(_stakingToken));
        setConfig(repWeight, stakingWeight, _minStakingTokensLocked);
        _snapshot();
    }

    /// @dev Set VPToken config
    /// @param _repWeight New DAOReputation token weight
    /// @param _stakingWeight New DXDStaking token weight
    /// @param _minStakingTokensLocked Minimum staking tokens locked to apply weight
    function setConfig(
        uint256 _repWeight,
        uint256 _stakingWeight,
        uint256 _minStakingTokensLocked
    ) public onlyOwner {
        minStakingTokensLocked = _minStakingTokensLocked;
        setComposition(_repWeight, _stakingWeight);
    }

    /// @dev Update tokens weights
    /// @param repWeight Weight of DAOReputation token
    /// @param stakingWeight Weight of DXDStaking token
    function setComposition(uint256 repWeight, uint256 stakingWeight) public onlyOwner {
        validateComposition(repWeight, stakingWeight);
        weights[address(repToken)] = repWeight;
        weights[address(stakingToken)] = stakingWeight;
    }

    /// @dev function to be executed from rep and dxdStake tokens after mint/burn
    /// It stores a reference to the rep/stake token snapshotId from internal snapshotId
    function callback() external onlyInternalTokens(msg.sender) {
        _snapshot();
        snapshots[address(repToken)][_getCurrentSnapshotId()] = ERC20SnapshotRep(address(repToken))
            .getCurrentSnapshotId();
        snapshots[address(stakingToken)][_getCurrentSnapshotId()] = ERC20SnapshotRep(address(stakingToken))
            .getCurrentSnapshotId();
    }

    /// @dev Get the voting power percentage of `_holder` at current snapshotId
    /// @param _holder Account we want to get voting power from
    /// @return votingPowerPercentage The votingPower of `_holder` (0 to 100*precision)
    function getVotingPowerPercentageOf(address _holder) public view returns (uint256 votingPowerPercentage) {
        address[2] memory tokens = [address(repToken), address(stakingToken)];
        uint256 totalVotingPower = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            address tokenAddress = tokens[i];
            uint256 tokenWeight = getTokenWeight(tokenAddress);
            // Skipping calculation if weight is 0
            if (tokenWeight == 0) continue;
            uint256 balance = ERC20SnapshotRep(tokenAddress).balanceOf(_holder);
            uint256 supply = ERC20SnapshotRep(tokenAddress).totalSupply();
            uint256 tokenVotingPowerPercent = _getVotingPower(balance, supply);
            uint256 tokenVotingPowerPercentWeighted = _getWeightedPercentage(tokenWeight, tokenVotingPowerPercent);
            totalVotingPower += tokenVotingPowerPercentWeighted;
        }

        return totalVotingPower;
    }

    /// @dev Get the voting power percentage of `_holder` at certain `_snapshotId`
    /// @param _holder Account we want to get voting power from
    /// @param _snapshotId VPToken SnapshotId we want get votingPower from
    /// @return votingPowerPercentage The votingPower of `_holder` (0 to 100*precision)
    function getVotingPowerPercentageOfAt(address _holder, uint256 _snapshotId)
        public
        view
        returns (uint256 votingPowerPercentage)
    {
        require(_snapshotId <= _getCurrentSnapshotId(), "Invalid snapshot ID");
        address[2] memory tokens = [address(repToken), address(stakingToken)];
        uint256 totalVotingPower = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            address tokenAddress = tokens[i];
            uint256 tokenSnapshotId = getTokenSnapshotIdFromVPSnapshot(tokenAddress, _snapshotId);
            // Skipping calculation if snapshotId is 0. No minting was done
            if (tokenSnapshotId == 0) continue;
            uint256 tokenWeight = getTokenWeight(tokenAddress);
            // Skipping calculation if weight is 0
            if (tokenWeight == 0) continue;
            uint256 balance = ERC20SnapshotRep(tokenAddress).balanceOfAt(_holder, tokenSnapshotId);
            uint256 supply = ERC20SnapshotRep(tokenAddress).totalSupplyAt(tokenSnapshotId);
            uint256 tokenVotingPowerPercent = _getVotingPower(balance, supply);
            uint256 tokenVotingPowerPercentWeighted = _getWeightedPercentage(tokenWeight, tokenVotingPowerPercent);
            totalVotingPower += tokenVotingPowerPercentWeighted;
        }
        return totalVotingPower;
    }

    /// @dev Returns votingPowerPercentage * precision
    /// i.e _getVotingPower(20, 200) // 10000000 (10% * p, where p=1_000_000)
    /// @param balance Acccount token balance
    /// @param totalSupply Token total supply
    /// @return votingPowerPercentagePowered Voting power percentage * precision
    function _getVotingPower(uint256 balance, uint256 totalSupply)
        public
        pure
        returns (uint256 votingPowerPercentagePowered)
    {
        require(balance <= totalSupply, "Invalid balance or totalSupply");
        return (balance * precision * 100) / totalSupply;
    }

    /// @dev Returns weighted percentage of votingPowerPercentagePowered
    /// @param weightPercent Weight percent of the token (0 to 100)
    /// @param votingPowerPercentPoweredByPrecision Voting power percentage (o to 100*precision)
    /// @return weightedVotingPowerPercentage weighted percentage of votingPowerPercentagePowered (0 to 100*precision)
    function _getWeightedPercentage(uint256 weightPercent, uint256 votingPowerPercentPoweredByPrecision)
        public
        pure
        returns (uint256 weightedVotingPowerPercentage)
    {
        require(weightPercent <= 100, "Invalid weightPercent");
        require(votingPowerPercentPoweredByPrecision <= 100 * precision, "Invalid weightPercent");
        return (votingPowerPercentPoweredByPrecision * weightPercent) / 100;
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
    function getTokenSnapshotIdFromVPSnapshot(address tokenAddress, uint256 tokenSnapshotId)
        public
        view
        onlyInternalTokens(tokenAddress)
        returns (uint256 snapshotId)
    {
        require(snapshotId <= _getCurrentSnapshotId(), "Invalid snapshot ID");
        return snapshots[tokenAddress][tokenSnapshotId];
    }

    /// @dev Get token weight from weights config mapping.
    /// @param token Address of the token we want to get weight from
    /// @param weight Weight percentage value (0 to 100)
    function getConfigTokenWeight(address token) public view returns (uint256 weight) {
        return weights[token];
    }

    /// @dev Get token weight from weights config mapping.
    /// If stakingToken supply > minStakingTokensLocked at the time of execution repWeight will default to 100%.
    /// If not it will retun internal weights config for given `token`
    /// @param token Address of the token we want to get weight from
    /// @param weight Weight percentage value (0 to 100)
    function getTokenWeight(address token) public view onlyInternalTokens(token) returns (uint256 weight) {
        if (stakingToken.totalSupply() < minStakingTokensLocked) {
            if (token == address(repToken)) return 100;
            else return 0;
        } else {
            return getConfigTokenWeight(token);
        }
    }

    /// @dev Perform a validation of token weights
    function validateComposition(uint256 repWeight, uint256 stakingWeight) internal {
        require(repWeight > 0 || stakingWeight > 0, "At least one token weight must be greater than zero");
        require(repWeight <= 100 && stakingWeight <= 100, "Weights cannot be bigger than 100");
        require(repWeight + stakingWeight == 100, "Weights sum must be equal to 100");
    }
}
