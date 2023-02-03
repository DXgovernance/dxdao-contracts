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
    uint256 public minStakingTokensLocked;

    //tokenAddress    weight
    mapping(address => uint256) public weights;

    //      tokenAddress     Internal snapshot  => token snapshot
    mapping(address => mapping(uint256 => uint256)) snapshots;

    uint256 public constant decimalPlaces = 10;
    uint256 public constant precision = 10**decimalPlaces;

    /// @notice Revert when using other address than stakingToken or repToken
    error VotingPowerToken_InvalidTokenAddress();

    /// @notice Revert both repToken and stakingToken address are the same
    error VotingPowerToken_ReptokenAndStakingTokenCannotBeEqual();

    /// @notice SnapshotId provided is bigger than current snapshotId
    error VotingPowerToken_InvalidSnapshotId();

    /// @notice Revert when weights composition is wrong
    error VotingPowerToken_InvalidTokenWeights();

    error VotingPowerToken_PercentCannotExeedMaxPercent();

    /// @dev Verify if address is one of rep or staking tokens
    modifier onlyInternalTokens(address tokenAddress) {
        if (tokenAddress != address(repToken) && tokenAddress != address(stakingToken)) {
            revert VotingPowerToken_InvalidTokenAddress();
        }
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
        if (_repToken == _stakingToken) revert VotingPowerToken_ReptokenAndStakingTokenCannotBeEqual();
        if (!validateComposition(repWeight, stakingWeight)) revert VotingPowerToken_InvalidTokenWeights();
        repToken = ERC20SnapshotRep(address(_repToken));
        stakingToken = ERC20SnapshotRep(address(_stakingToken));
        setMinStakingTokensLocked(_minStakingTokensLocked);
        setComposition(repWeight, stakingWeight);
        _snapshot();
    }

    /// @dev Set Minimum staking tokens locked to apply staking token weight
    /// @param _minStakingTokensLocked Minimum staking tokens locked to apply weight
    function setMinStakingTokensLocked(uint256 _minStakingTokensLocked) public onlyOwner {
        minStakingTokensLocked = _minStakingTokensLocked;
    }

    /// @dev Update tokens weights
    /// @param repWeight Weight of DAOReputation token
    /// @param stakingWeight Weight of DXDStaking token
    function setComposition(uint256 repWeight, uint256 stakingWeight) public onlyOwner {
        bool valid = validateComposition(repWeight, stakingWeight);
        if (!valid) revert VotingPowerToken_InvalidTokenWeights();
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
            uint256 tokenVotingPowerPercent = getPercent(balance, supply);
            uint256 tokenVotingPowerPercentWeighted = getWeightedVotingPowerPercentage(
                tokenWeight,
                tokenVotingPowerPercent
            );
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
        if (_snapshotId > _getCurrentSnapshotId()) revert VotingPowerToken_InvalidSnapshotId();
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
            uint256 tokenVotingPowerPercent = getPercent(balance, supply);
            uint256 tokenVotingPowerPercentWeighted = getWeightedVotingPowerPercentage(
                tokenWeight,
                tokenVotingPowerPercent
            );
            totalVotingPower += tokenVotingPowerPercentWeighted;
        }
        return totalVotingPower;
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
        if (snapshotId > _getCurrentSnapshotId()) revert VotingPowerToken_InvalidSnapshotId();
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
    /// @param repWeight Weight of repToken
    /// @param stakingWeight Weight of stakingWeight
    /// @return valid Weather composition is valid or not
    function validateComposition(uint256 repWeight, uint256 stakingWeight) internal pure returns (bool valid) {
        if (repWeight + stakingWeight != 100) {
            return false;
        }
        return true;
    }

    /// @dev Calculates the percentage of a `numerator` over a `denominator` multiplyed by precision
    /// i.e getPercent(10, 100) // 10000000 - 10%. (10* p, where p=1_000_000)
    /// @param numerator The part being considered
    /// @param denominator The total amount
    /// @return percent The percentage of the numerator over the denominator * precision
    function getPercent(uint256 numerator, uint256 denominator) public pure returns (uint256 percent) {
        return (numerator * precision * 100) / denominator;
    }

    /// @dev Calculates the weighted voting power percentage by multiplying the voting power
    ///      percentage by the weight percent of the token
    /// @param weightPercent {uint256} Weight percent of the token (0 to 100)
    /// @param votingPowerPercent {uint256} Voting power percentage (0 to 100 * precision)
    /// @return weightedVotingPowerPercentage {uint256} Weighted voting power percentage (0 to 100 * precision)
    function getWeightedVotingPowerPercentage(uint256 weightPercent, uint256 votingPowerPercent)
        public
        pure
        returns (uint256 weightedVotingPowerPercentage)
    {
        uint256 maxPercent = 100 * precision;
        if (votingPowerPercent > maxPercent) revert VotingPowerToken_PercentCannotExeedMaxPercent();
        return (votingPowerPercent * weightPercent) / 100;
    }
}
