// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface VotingPower {
    function callback(address _account) external;
}

/**
 * @title DXDInfluence
 * @dev Keeps track of the time commitment of accounts that have staked. The more DXD is staked and
 * the more time the DXD tokens are staked, the more influence the user will have on the DAO.
 * DXDInfluence notifies the Voting Power contract of any stake changes.
 */
contract DXDInfluence is OwnableUpgradeable, ERC20SnapshotUpgradeable {
    using ArraysUpgradeable for uint256[];

    ERC20SnapshotUpgradeable public dxdStake;
    VotingPower public votingPower;
    mapping(address => uint256[]) public stakeTimes; // stakeTimes[account]
    mapping(uint256 => uint256) public snapshotTimes; // snapshotTimes[snapshotId]
    mapping(uint256 => uint256) public totalSupplies; // nonRegisteredTotalSupplies[snapshotId]

    /// @notice Error when trying to transfer influence
    error Influence__NoTransfer();

    constructor() {}

    function initialize(
        address _dxdStake,
        string memory name,
        string memory symbol
    ) external initializer {
        __ERC20_init(name, symbol);
        __Ownable_init();

        _transferOwnership(_dxdStake);
        dxdStake = ERC20SnapshotUpgradeable(_dxdStake);
    }

    /// @dev Not allow the transfer of tokens
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        revert Influence__NoTransfer();
    }

    function changeVotingPowerContract(VotingPower _newVotingPower) external onlyOwner {
        votingPower = _newVotingPower;
    }

    /// @dev Stakes tokens from the user.
    /// @param account Account that has staked the tokens.
    /// @param amount Amount of tokens to have been staked.
    function mint(address account, uint256 amount) external onlyOwner {
        uint256 influenceUpdate;
        if (stakeTimes[account].length > 0) {
            uint256 lastStakeTime = stakeTimes[account][stakeTimes[account].length - 1];
            influenceUpdate = dxdStake.balanceOf(account) * (block.timestamp - lastStakeTime);
        }
        _mint(account, influenceUpdate);
        _snapshot();
        stakeTimes[account].push(block.timestamp);

        uint256 currentSnapshotId = _getCurrentSnapshotId();
        snapshotTimes[currentSnapshotId] = block.timestamp;
        if (snapshotTimes[currentSnapshotId - 1] > 0) {
            uint256 previousSupply = totalSupplies[currentSnapshotId - 1];
            uint256 supplyUpdate = dxdStake.totalSupply() * (block.timestamp - snapshotTimes[currentSnapshotId - 1]);
            totalSupplies[currentSnapshotId] = previousSupply + supplyUpdate;
        }

        // Notify Voting Power contract.
        votingPower.callback(msg.sender);
    }

    function totalSupply() public view virtual override returns (uint256) {
        return totalSupplies[_getCurrentSnapshotId()];
    }

    function totalSupplyAt(uint256 snapshotId) public view virtual override returns (uint256) {
        return totalSupplies[snapshotId];
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return balanceOfAt(account, _getCurrentSnapshotId());
    }

    function balanceOfAt(address account, uint256 snapshotId) public view virtual override returns (uint256) {
        uint256 registeredBalance = super.balanceOfAt(account, snapshotId);

        uint256 snapshotTime = snapshotTimes[snapshotId];
        uint256 index = stakeTimes[account].findUpperBound(snapshotTime);

        uint256 nonRegisteredTime = snapshotTimes[snapshotId] - stakeTimes[account][index];
        uint256 nonRegisteredBalance = dxdStake.balanceOfAt(account, snapshotId) * nonRegisteredTime;

        return registeredBalance + nonRegisteredBalance;
    }

    /// @dev Get the current snapshotId
    function getCurrentSnapshotId() external view returns (uint256) {
        return _getCurrentSnapshotId();
    }
}
