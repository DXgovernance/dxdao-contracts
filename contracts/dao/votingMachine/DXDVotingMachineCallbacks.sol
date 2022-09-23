// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../DAOController.sol";
import "../DAOAvatar.sol";
import "../DAOReputation.sol";
import "hardhat/console.sol";

contract DXDVotingMachineCallbacks {
    address public votingMachine;

    DAOAvatar public avatar;

    modifier onlyVotingMachine() {
        require(msg.sender == address(votingMachine), "DXDVotingMachineCallbacks: only VotingMachine");

        _;
    }

    mapping(bytes32 => uint256) public proposalSnapshots;

    function mintReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32
    ) external onlyVotingMachine returns (bool success) {
        DAOController(avatar.owner()).mintReputation(_amount, _beneficiary);
        return success;
    }

    function burnReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32
    ) external onlyVotingMachine returns (bool success) {
        DAOController(avatar.owner()).burnReputation(_amount, _beneficiary);
        return success;
    }

    function stakingTokenTransfer(
        IERC20 _stakingToken,
        address _beneficiary,
        uint256 _amount,
        bytes32
    ) external onlyVotingMachine returns (bool success) {
        (success, ) = DAOController(avatar.owner()).avatarCall(
            address(_stakingToken),
            abi.encodeWithSignature("transferFrom(address,address,uint256)", avatar, _beneficiary, _amount),
            avatar,
            0
        );
    }

    function getReputation() public view returns (DAOReputation) {
        return DAOController(avatar.owner()).getDaoReputation();
    }

    function getNativeReputationTotalSupply() public view returns (uint256) {
        return getReputation().totalSupply();
    }

    function balanceOfStakingToken(IERC20 _stakingToken, bytes32) external view returns (uint256) {
        return _stakingToken.balanceOf(address(avatar));
    }

    function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256) {
        return getReputation().totalSupplyAt(proposalSnapshots[_proposalId]);
    }

    function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256) {
        return getReputation().balanceOfAt(_owner, proposalSnapshots[_proposalId]);
    }
}
