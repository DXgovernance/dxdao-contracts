// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./AccountSnapshot.sol";
import "../utils/ERC20/ERC20SnapshotRep.sol";

// solhint-disable max-line-length
/**
 * @title VotingPower
 * @dev This contract provides a function to determine the balance (or voting power) of a specific holder based
 *      on the relative "weights" of two different ERC20SnapshotRep tokens: a DAOReputation token and a DXDInfluence token.
 *      The contract also includes the capability to manage the weights of the underlying tokens, determining the
 *      percentage that each token should represent of the total balance amount at the moment of getting user balance.
 *      Additionally, the contract sets a minimum requirement for the amount of DXDInfluence tokens that must be locked
 *      in order to apply weight to the DXDInfluence token.
 */

// solhint-enable max-line-length
contract VotingPower is OwnableUpgradeable, AccountSnapshot {
    /// @notice The reputation token that will be used as source of voting power
    address public reputation;

    /// @notice The influence token that will be used as source of voting power
    address public influence;

    //      tokenAddress   snapshot  weight
    mapping(address => mapping(uint256 => uint256)) public weights;

    struct TokensSnapshot {
        uint128 reputation;
        uint128 influence;
    }

    //      tokenAddress     Internal snapshot  => token snapshot
    mapping(uint256 => TokensSnapshot) public snapshots;

    string public name;
    string public symbol;
    uint256 public constant decimals = 18;
    uint256 public constant precision = 10**decimals;

    /// @notice Revert when using other address than influence or reputation
    error VotingPower_InvalidTokenAddress();

    /// @notice Revert both reputation and influence address are the same
    error VotingPower_ReputationTokenAndInfluenceTokenCannotBeEqual();

    /// @notice SnapshotId provided is bigger than current snapshotId
    error VotingPower_InvalidSnapshotId();

    /// @notice Revert when weights composition is wrong
    error VotingPower_InvalidTokenWeights();

    error VotingPower_PercentCannotExeedMaxPercent();

    /// @notice Minimum staking tokens locked to apply weight (snapshoted)
    mapping(uint256 => uint256) internal minStakingTokensLocked;

    address public constant WEIGHTS_SLOT = address(0x1);
    address public constant MIN_STAKED_SLOT = address(0x2);

    /// @dev Verify if address is one of reputation or influence tokens
    modifier onlyInternalTokens(address tokenAddress) {
        if (tokenAddress != reputation && tokenAddress != influence) {
            revert VotingPower_InvalidTokenAddress();
        }
        _;
    }

    function initialize(
        string memory _name,
        string memory _symbol,
        address _reputation,
        address _dxdInfluence,
        uint256 repWeight,
        uint256 stakingWeight,
        uint256 _minStakingTokensLocked
    ) public virtual initializer {
        __Ownable_init();
        if (_reputation == _dxdInfluence) revert VotingPower_ReputationTokenAndInfluenceTokenCannotBeEqual();
        reputation = _reputation;
        influence = _dxdInfluence;
        name = _name;
        symbol = _symbol;
        setMinStakingTokensLocked(_minStakingTokensLocked);
        setComposition(repWeight, stakingWeight);
    }

    /// @dev Set Minimum staking tokens locked to apply staking token weight.
    ///      If staking token totalSupply is under _minStakingTokensLocked, influence token weight will be 0.
    /// @param _minStakingTokensLocked Minimum staking tokens locked to apply weight
    function setMinStakingTokensLocked(uint256 _minStakingTokensLocked) public onlyOwner {
        uint256 snapshotId = _snapshot(MIN_STAKED_SLOT);
        minStakingTokensLocked[snapshotId] = _minStakingTokensLocked;
        snapshots[snapshotId] = TokensSnapshot({
            reputation: snapshots[snapshotId - 1].reputation,
            influence: snapshots[snapshotId - 1].influence
        });
    }

    /// @dev Update tokens weights
    /// @param repWeight Weight of DAOReputation token
    /// @param stakingWeight Weight of DXDStaking token
    function setComposition(uint256 repWeight, uint256 stakingWeight) public onlyOwner {
        if (repWeight + stakingWeight != 100) {
            revert VotingPower_InvalidTokenWeights();
        }
        uint256 snapshotId = _snapshot(WEIGHTS_SLOT);
        weights[reputation][snapshotId] = repWeight;
        weights[influence][snapshotId] = stakingWeight;
        snapshots[snapshotId] = TokensSnapshot({
            reputation: snapshots[snapshotId - 1].reputation,
            influence: snapshots[snapshotId - 1].influence
        });
    }

    /// @dev function to be executed from rep and dxdStake tokens after mint/burn
    /// It stores a reference to the rep/stake token snapshotId from internal snapshotId
    function callback() external onlyInternalTokens(msg.sender) {
        uint256 snapshotId = _snapshot();
        snapshots[snapshotId] = TokensSnapshot({
            reputation: uint128(ERC20SnapshotRep(reputation).getCurrentSnapshotId()),
            influence: uint128(ERC20SnapshotRep(influence).getCurrentSnapshotId())
        });
    }

    /// @dev Get the balance (voting power percentage) of `account` at current snapshotId
    ///      Balance is expressed as percentage in base 1e+18
    ///      1% == 1000000000000000000 | 0.5% == 500000000000000000
    /// @param account Account we want to get voting power from
    /// @return votingPowerPercentage The votingPower of `account` (0 to 100*precision)
    function balanceOf(address account) public view returns (uint256 votingPowerPercentage) {
        return _calculateVotingPower(account, getCurrentSnapshotId());
    }

    /// @dev Get the balance (voting power percentage) of `account` at certain `_snapshotId`.
    ///      Balance is expressed as percentage in base 1e+18
    ///      1% == 1000000000000000000 | 0.5% == 500000000000000000
    /// @param account Account we want to get voting power from
    /// @param snapshotId VPToken SnapshotId we want get votingPower from
    /// @return votingPowerPercentage The votingPower of `account` (0 to 100*precision)
    function balanceOfAt(address account, uint256 snapshotId) public view returns (uint256 votingPowerPercentage) {
        return _calculateVotingPower(account, snapshotId);
    }

    /// @dev Internal function to calculate voting power (balance) of `account` at certain `_snapshotId`
    /// @param account Account we want to get voting power from
    /// @param snapshotId VPToken SnapshotId we want get votingPower from
    /// @return votingPower The votingPower of `account` (0 to 100*precision)
    function _calculateVotingPower(address account, uint256 snapshotId) internal view returns (uint256 votingPower) {
        if (snapshotId > getCurrentSnapshotId()) revert VotingPower_InvalidSnapshotId();
        address[2] memory tokens = [reputation, influence];
        votingPower = 0;

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 tokenSnapshotId = (tokens[i] == reputation)
                ? snapshots[snapshotId].reputation
                : snapshots[snapshotId].influence;
            // Skipping calculation if snapshotId is 0. No minting was done
            if (tokenSnapshotId == 0) continue;
            uint256 tokenWeight = getWeightOfAt(tokens[i], snapshotId);
            // Skipping calculation if weight is 0
            if (tokenWeight == 0) continue;
            uint256 balance = ERC20SnapshotRep(tokens[i]).balanceOfAt(account, tokenSnapshotId);
            // Skipping calculation if user has no balance
            if (balance == 0) continue;
            uint256 supply = ERC20SnapshotRep(tokens[i]).totalSupplyAt(tokenSnapshotId);
            // Get token voting power percent weighted
            uint256 tokenVotingPowerPercentWeighted = (balance * tokenWeight * precision) / supply;
            votingPower += tokenVotingPowerPercentWeighted;
        }
        return votingPower;
    }

    /// @dev Internal function to return weight of `token` at `snapshotId` from
    ///      global config without any minimum tokens locked logic involved.
    /// @param token Address of the token we want to get weight from
    /// @param weight Weight percentage value (0 to 100)
    function _getWeightOfAt(address token, uint256 snapshotId) internal view returns (uint256 weight) {
        return weights[token][snapshotAt(snapshotId, WEIGHTS_SLOT)];
    }

    /// @dev Get token weight from weights config mapping.
    ///      If influence supply > minStakingTokensLocked at given snapshotId, repWeight will default to 100%.
    ///      If not it will return internal weights config for given `token`
    /// @param token Address of the token we want to get weight from
    /// @param snapshotId VotingPower snapshotId
    /// @return weight Weight percentage value (0 to 100)
    function getWeightOfAt(address token, uint256 snapshotId) public view returns (uint256 weight) {
        uint256 influenceSnapshotId = snapshots[snapshotId].influence;
        if (ERC20SnapshotRep(influence).totalSupplyAt(influenceSnapshotId) < getMinStakingTokensLockedAt(snapshotId)) {
            if (token == reputation) return 100;
            else return 0;
        } else {
            return _getWeightOfAt(token, snapshotId);
        }
    }

    /// @dev Get token weight from weights config mapping.
    ///      If influence supply > minStakingTokensLocked at the time of execution repWeight will default to 100%.
    ///      If not it will return internal weights config for given `token`
    /// @param token Address of the token we want to get weight from
    /// @return weight Weight percentage value (0 to 100)
    function getWeightOf(address token) public view returns (uint256 weight) {
        return getWeightOfAt(token, getCurrentSnapshotId());
    }

    /// @dev Returns the last snapshotId stored for given `slot` based on `_snapshotId`
    /// @param  _snapshotId VotingPower Snapshot ID
    /// @param  slot Address used to emit snapshot. One of: WEIGHTS_SLOT, MIN_STAKED_SLOT
    /// @return snapshotId SnapshotId
    function snapshotAt(uint256 _snapshotId, address slot) internal view returns (uint256 snapshotId) {
        return _lastRegisteredSnapshotIdAt(_snapshotId, slot);
    }

    /// @dev Returns global minStakingTokensLocked at `snapshotId`
    /// @param  snapshotId VotingPower Snapshot ID
    /// @return _minStakingTokensLocked Minimum staking tokens locked to apply staking weight
    function getMinStakingTokensLockedAt(uint256 snapshotId) public view returns (uint256 _minStakingTokensLocked) {
        return minStakingTokensLocked[snapshotAt(snapshotId, MIN_STAKED_SLOT)];
    }

    /// @dev Returns global minStakingTokensLocked at currentSnapshotId
    /// @return _minStakingTokensLocked Minimum staking tokens locked to apply staking weight
    function getMinStakingTokensLocked() public view returns (uint256 _minStakingTokensLocked) {
        return getMinStakingTokensLockedAt(getCurrentSnapshotId());
    }

    /// @dev Returns the total supply
    /// @return supply 100% expressed in base 1e+18.
    function totalSupply() external pure returns (uint256 supply) {
        return 100 * precision;
    }

    /// @dev Returns the total supply
    /// @param snapshotId Snapshot ID to get supply at. Since VotingPower is expressed as percent this won't be used.
    /// @return supply 100% expressed in base 1e+18.
    function totalSupplyAt(uint256 snapshotId) external pure returns (uint256 supply) {
        return 100 * precision;
    }

    /// @dev Disabled transfer tokens, not needed in VotingPower
    function transfer(address to, uint256 amount) external pure returns (bool) {
        revert("VotingPower: Cannot call transfer function");
    }

    /// @dev Disabled allowance function, not needed in VotingPower
    function allowance(address owner, address spender) external pure returns (uint256) {
        revert("VotingPower: Cannot call allowance function");
    }

    /// @dev Disabled approve function, not needed in VotingPower
    function approve(address spender, uint256 amount) external pure returns (bool) {
        revert("VotingPower: Cannot call approve function");
    }

    /// @dev Disabled transferFrom function, not needed in VotingPower
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external pure returns (bool) {
        revert("VotingPower: Cannot call transferFrom function");
    }
}
