pragma solidity ^0.5.11;

import "./GenesisProtocol.sol";

/**
 * @title GenesisProtocol implementation -an organization's voting machine scheme that can pay for its vote gas costs.
 *
 * Allows all organization using the voting machine to send ETH that will eb used for paying a fraction or total gas 
 * costs when voting, each organization can set hwo much percentage of the gas spent pay back depending on how much 
 * rep the voter has.
 */
contract PayableGenesisProtocol is GenesisProtocol {

    struct OrganizationRefunds {
      uint256 balance;
      uint256 voteGas;
      uint256 maxGasPrice;
    }
    
    mapping(address => OrganizationRefunds) public organizationRefunds;
        
    /**
     * @dev Constructor
     */
    constructor(IERC20 _stakingToken)
    public
    // solhint-disable-next-line no-empty-blocks
    GenesisProtocol(_stakingToken) {
    }
    
    /**
    * @dev enables an voting machine to receive ether
    */
    function() external payable {
      if (organizationRefunds[msg.sender].voteGas > 0)
          organizationRefunds[msg.sender].balance = organizationRefunds[msg.sender].balance.add(msg.value);
    }
    
    /**
    * @dev Config the refund for each daostack dao
    */
    function setOrganizationRefund(uint256 _voteGas, uint256 _maxGasPrice) public {
      organizationRefunds[msg.sender].voteGas = _voteGas;
      organizationRefunds[msg.sender].maxGasPrice = _maxGasPrice;
    }

    /**
     * @dev voting function
     *
     * Changed by PayableGenesisProtocol implementation to pay for gas spent in vote
     *
     * @param _proposalId id of the proposal
     * @param _vote NO(2) or YES(1).
     * @param _amount the reputation amount to vote with . if _amount == 0 it will use all voter reputation.
     * @param _voter voter address
     * @return bool true - the proposal has been executed
     *              false - otherwise.
     */
    function vote(bytes32 _proposalId, uint256 _vote, uint256 _amount, address _voter)
    external
    votable(_proposalId)
    returns(bool) {
        Proposal storage proposal = proposals[_proposalId];
        Parameters memory params = parameters[proposal.paramsHash];
        address voter;
        if (params.voteOnBehalf != address(0)) {
            require(msg.sender == params.voteOnBehalf);
            voter = _voter;
        } else {
            voter = msg.sender;
        }
        bool voteResult = internalVote(_proposalId, voter, _vote, _amount);
        
        // Added section by PayableGenesisProtocol to pay for gas spent
        address orgAddress = organizations[proposal.organizationId];
        if (organizationRefunds[orgAddress].voteGas > 0) {
            uint256 gasRefund = organizationRefunds[orgAddress].voteGas
                .mul(tx.gasprice.min(organizationRefunds[orgAddress].maxGasPrice));
            if (organizationRefunds[orgAddress].balance >= gasRefund) {
                msg.sender.transfer(gasRefund);
                organizationRefunds[orgAddress].balance = organizationRefunds[orgAddress].balance.sub(gasRefund);
            }
        }
        return voteResult;
    }

}
