// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "../utils/ERC20/ERC20SnapshotRep.sol";

contract VotingPowerToken is ERC20SnapshotUpgradeable, OwnableUpgradeable {

    // The ERC20 rep token that will be used as source of voting power
    IERC20Upgradeable public repToken;

    // staking token
    IERC20Upgradeable public stakingToken;

    uint256 minStakingTokensLocked;

        //tokenAddress    weight
    mapping(address => uint256) public weights;

            // token           //snapshot          // holder     // balance
   mapping(address => mapping(uint256 => mapping( address => uint256 ))) balances;

            // token            // snapshot    // totalSupply
   mapping(address => mapping(uint256 => uint256)) totalSupplies;



    function initialize(
        address _repToken,
        address _stakingToken,
        uint256 repWeight,
        uint256 stakingWeight,
        uint256 _minStakingTokensLocked
    ) public virtual initializer {
       require(repToken != stakingToken, "Rep token and staking token cannot be the same.");
       require(_minStakingTokensLocked > 0, "Minimum staking tokens locked must be greater than zero.");

        repToken = ERC20SnapshotRep(_repToken);
        stakingToken = ERC20SnapshotRep(_stakingToken);
        setConfig(repWeight, stakingWeight, minStakingTokensLocked);
        updateComposition(repWeight, stakingWeight);
        _snapshot();
    }


    /// @dev Update tokens weight
    function updateComposition(  
        uint256 repWeight,
        uint256 stakingWeight
    ) {
        require(repWeight > 0 && stakingWeight > 0, "Weights must be greater than zero.");
        require(repWeight + stakingWeight == 100, "Weights sum must be equal to 100");

        if (stakingToken.totalSupplyAt(stakingToken._getCurrentSnapshotId()) < minStakingTokensLocked){
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
    ){
        minStakingTokensLocked = _minStakingTokensLocked;
        updateComposition(_repWeight, _stakingWeight);
    }

    /// @dev 
    function callback(address _tokenHolder){
        ERC20SnapshotRep token = ERC20SnapshotRep(msg.sender);
        _snapshot();
        votingPower[_token][_getCurrentSnapshotId()][_tokenHolder] = token.totalSupply();
        totalSupplies[_token][_getCurrentSnapshotId()] = token.totalSupply();
    }

    function votingPowerOfAt(address _holder, uint256 _snapshotId) public view returns (uint256) {
        uint256 repBalance = balances[address(repToken)][_snapshotId][_holder];
        uint256 stakingBalance = balances[address(stakingToken)][_snapshotId][_holder];
        uint256 repWeight = weights[address(repToken)];
        uint256 stakingWeight = weights[address(stakingToken)];

        uint256 repSupply = totalSupplies[address(repToken)][_snapshotId];
        uint256 stakingSupply = totalSupplies[address(stakingToken)][_snapshotId];




        uint256 repPercent =  (repSupply * 100) / totalAmount;
        uint256 stakingPercent =  (repSupply * 100) / totalAmount;



        uint256 totalWeight = repWeight + stakingWeight;
        return (repBalance * repWeight + stakingBalance * stakingWeight) / totalWeight;
    }
    

    function calculatePercentage(uint256 balance, uint256 totalSupply){
        return (balance * 100) / totalSupply;
    }

}
