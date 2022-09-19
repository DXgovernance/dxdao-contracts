pragma solidity ^0.8.8;

interface DXDVotingMachineCallbacksInterface {
    function mintReputation(
        uint256 _amount,
        address _beneficiary,
        bytes32 _proposalId
    ) external returns (bool);

    function burnReputation(
        uint256 _amount,
        address _owner,
        bytes32 _proposalId
    ) external returns (bool);

    function stakingTokenTransfer(
        address _stakingToken,
        address _beneficiary,
        uint256 _amount,
        bytes32 _proposalId
    ) external returns (bool);

    function getTotalReputationSupply(bytes32 _proposalId) external view returns (uint256);

    function reputationOf(address _owner, bytes32 _proposalId) external view returns (uint256);

    function balanceOfStakingToken(address _stakingToken, bytes32 _proposalId) external view returns (uint256);
}
