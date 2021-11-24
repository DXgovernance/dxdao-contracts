pragma solidity 0.5.15;


contract AugurUniverseMock {

    uint256 public forkTime;
    address public winningChildUniverse;
    address public reputationToken;

    constructor(address _reputationToken) public {
        reputationToken = _reputationToken;
    }

    function() external payable {
    }

    function setFork(address _winningChildUniverse, uint256 _forkTime) public {
        require(forkTime == 0);
        forkTime = _forkTime;
        winningChildUniverse = _winningChildUniverse;
    }

    function getForkEndTime() public view returns(uint256) {
        return forkTime;
    }
    function getWinningChildUniverse() public view returns(address) {
        return winningChildUniverse;
    }
    function getReputationToken() public view returns(address) {
        return reputationToken;
    }
}