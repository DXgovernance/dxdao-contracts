import { web3 } from "@openzeppelin/test-helpers/src/setup";

const constants = require("./constants");

const { LogDecoder } = require("@maticnetwork/eth-decoder");

const VotingPower = artifacts.require("./VotingPower.sol");
const DXDStake = artifacts.require("DXDStake.sol");
const DXDInfluence = artifacts.require("DXDInfluence.sol");
const ERC20Mock = artifacts.require("./ERC20Mock.sol");
const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const DAOController = artifacts.require("./DAOController.sol");
const DAOReputation = artifacts.require("./DAOReputation.sol");
const VotingMachine = artifacts.require("./VotingMachine.sol");
const WalletScheme = artifacts.require("./WalletScheme.sol");
const ActionMock = artifacts.require("./ActionMock.sol");
const PermissionRegistry = artifacts.require("./PermissionRegistry.sol");
const ERC20VestingFactory = artifacts.require("./ERC20VestingFactory.sol");
const ERC721Factory = artifacts.require("./ERC721Factory.sol");
const ERC20Guild = artifacts.require("./ERC20Guild.sol");

export const logDecoder = new LogDecoder([
  DAOAvatar.abi,
  DAOController.abi,
  DAOReputation.abi,
  VotingMachine.abi,
  WalletScheme.abi,
  PermissionRegistry.abi,
  ERC20VestingFactory.abi,
  ERC721Factory.abi,
  ERC20Guild.abi,
  ActionMock.abi,
]);

export function getValueFromLogs(tx, arg, eventName, index = 0) {
  if (!tx.logs || !tx.logs.length) {
    throw new Error("getValueFromLogs: Transaction has no logs");
  }

  if (eventName !== undefined) {
    for (let i = 0; i < tx.logs.length; i++) {
      if (tx.logs[i].event === eventName) {
        index = i;
        break;
      }
    }
    if (index === undefined) {
      let msg = `getValueFromLogs: There is no event logged with eventName ${eventName}`;
      throw new Error(msg);
    }
  } else {
    if (index === undefined) {
      index = tx.logs.length - 1;
    }
  }
  let result = tx.logs[index].args[arg];
  if (!result) {
    let msg = `getValueFromLogs: This log does not seem to have a field "${arg}": ${tx.logs[index].args}`;
    throw new Error(msg);
  }
  return result;
}

export const deployDao = async function (deployConfig) {
  const reputation = await DAOReputation.new();
  await reputation.initialize("DXDaoReputation", "DXRep");

  const controller = await DAOController.new();

  const avatar = await DAOAvatar.new();
  await avatar.initialize(controller.address);

  for (let i = 0; i < deployConfig.repHolders.length; i++) {
    await reputation.mint(
      deployConfig.repHolders[i].address,
      deployConfig.repHolders[i].amount
    );
  }
  await reputation.transferOwnership(controller.address);

  const votingMachine = await VotingMachine.new(
    deployConfig.votingMachineToken
  );

  const defaultParamsHash = await setDefaultParameters(votingMachine);

  await controller.initialize(
    deployConfig.owner,
    reputation.address,
    defaultParamsHash
  );

  return { controller, avatar, reputation, votingMachine };
};

export const deployDaoV2 = async function (config) {
  if (!Object.keys(config).includes("owner")) {
    throw new Error("deployDaoV2: Invalid config. Config.owner missing");
  }
  const deployConfig = Object.assign(
    constants.GOVERNANCE_V2_CONFIG(web3),
    config
  );

  const reputation = await DAOReputation.new();

  const dxdStake = await DXDStake.new();
  const dxdInfluence = await DXDInfluence.new();

  const dxd = await ERC20Mock.new(
    "DXD Token",
    "DXD",
    web3.utils.toWei("10000", "ether"),
    deployConfig.owner
  );

  const votingPowerToken = await VotingPower.new({ from: deployConfig.owner });

  await reputation.initialize("Reputation", "REP", votingPowerToken.address);

  await dxdStake.initialize(
    dxd.address,
    dxdInfluence.address,
    deployConfig.owner,
    deployConfig.maxTimeCommitment,
    "DXDStake",
    "stDXD",
    {
      from: deployConfig.owner,
    }
  );

  await dxdInfluence.initialize(
    dxdStake.address,
    votingPowerToken.address,
    deployConfig.linearFactor,
    deployConfig.exponentialFactor,
    deployConfig.exponent,
    {
      from: deployConfig.owner,
    }
  );

  await votingPowerToken.initialize(
    "Voting Power Token",
    "VPT",
    reputation.address,
    dxdInfluence.address,
    deployConfig.repTokenWeight,
    deployConfig.stakeTokenWeight,
    deployConfig.minStakingTokensLocked
  );

  const controller = await DAOController.new();
  const avatar = await DAOAvatar.new();
  await avatar.initialize(controller.address);

  for (let i = 0; i < deployConfig.repHolders.length; i++) {
    const addressI = deployConfig.repHolders[i].address;
    const amountI = deployConfig.repHolders[i].amount;
    await reputation.mint(addressI, amountI);
    await dxd.mint(addressI, amountI);
    await dxd.approve(dxdStake.address, amountI, {
      from: deployConfig.repHolders[i].address,
    });
    await dxdStake.stake(amountI, 25, {
      from: deployConfig.repHolders[i].address,
    });
  }
  await reputation.transferOwnership(controller.address);

  const votingMachine = await VotingMachine.new(
    deployConfig.votingMachineToken
  );

  const defaultParamsHash = await setDefaultParameters(votingMachine);

  await controller.initialize(
    deployConfig.owner,
    reputation.address,
    defaultParamsHash
  );

  return {
    controller,
    avatar,
    reputation,
    votingMachine,
    dxdStake,
    dxdInfluence,
    votingPowerToken,
    defaultParamsHash,
  };
};

export async function getProposalId(tx, contract, eventName) {
  var proposalId;
  await contract
    .getPastEvents(eventName, {
      fromBlock: tx.blockNumber,
      toBlock: "latest",
    })
    .then(function (events) {
      proposalId = events[0].args._proposalId;
    });
  return proposalId;
}

export function testCallFrom(address, number = 1) {
  return new web3.eth.Contract(ActionMock.abi).methods
    .test(address, number)
    .encodeABI();
}
export function testCallWithoutReturnValueFrom(address) {
  return new web3.eth.Contract(ActionMock.abi).methods
    .testWithoutReturnValue(address, 1)
    .encodeABI();
}

// Parameters
export const defaultParameters = {
  queuedVoteRequiredPercentage: 5000,
  queuedVotePeriodLimit: 60,
  boostedVotePeriodLimit: 60,
  preBoostedVotePeriodLimit: 5,
  thresholdConst: 2000,
  quietEndingPeriod: 10,
  daoBounty: web3.utils.toWei("0.1"),
  daoBountyConst: 10,
  boostedVoteRequiredPercentage: 100,
};

export const defaultParametersArray = [
  defaultParameters.queuedVoteRequiredPercentage,
  defaultParameters.queuedVotePeriodLimit,
  defaultParameters.boostedVotePeriodLimit,
  defaultParameters.preBoostedVotePeriodLimit,
  defaultParameters.thresholdConst,
  defaultParameters.quietEndingPeriod,
  defaultParameters.daoBounty,
  defaultParameters.boostedVoteRequiredPercentage,
];

export const setDefaultParameters = async function (votingMachine) {
  await votingMachine.setParameters(defaultParametersArray);

  return await votingMachine.getParametersHash(defaultParametersArray);
};

export function encodeERC20Transfer(to, value) {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "transfer",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "to",
        },
        {
          type: "uint256",
          name: "value",
        },
      ],
    },
    [to, value]
  );
}

export function encodeERC20Approve(to, value) {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "approve",
      type: "function",
      inputs: [
        {
          type: "address",
          name: "to",
        },
        {
          type: "uint256",
          name: "value",
        },
      ],
    },
    [to, value]
  );
}

export function create2Address(creatorAddress, bytecode, saltHex) {
  const parts = [
    "ff",
    creatorAddress.slice(2),
    saltHex.slice(2),
    web3.utils.sha3(bytecode).slice(2),
  ];

  const partsHash = web3.utils.sha3(`0x${parts.join("")}`);
  return `0x${partsHash.slice(-40)}`.toLowerCase();
}

export function encodeGenericCallData(avatar, to, data, value) {
  return new web3.eth.Contract(Controller.abi).methods
    .genericCall(to, data, avatar, value)
    .encodeABI();
}

export function getEventFromTx(tx, eventName) {
  const logDecoder = new LogDecoder([WalletScheme.abi]);
  const logs = logDecoder.decodeLogs(tx.receipt.rawLogs);
  return logs.find(event => event.name === eventName);
}

export function getEventFromLogs(tx, eventName) {
  return tx.logs.find(event => event.event === eventName);
}

export function encodeMaxSecondsForExecution(executionTimeout) {
  const setMaxSecondsForExecutionData = web3.eth.abi.encodeFunctionCall(
    {
      name: "setMaxSecondsForExecution",
      type: "function",
      inputs: [
        {
          type: "uint256",
          name: "_maxSecondsForExecution",
        },
      ],
    },
    [executionTimeout]
  );

  return setMaxSecondsForExecutionData;
}

export function getRandomNumber(min, max = min) {
  // If there is just one argument, the minimum is set to zero, and the maximum is the argument
  if ((min = max)) min = 0;
  else Math.ceil(min);

  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive
}

export function customErrorMessageExistInRawLogs(
  eventDataStringMessage,
  txReceipt
) {
  const encodedErrorSignature = web3.eth.abi
    .encodeFunctionSignature(eventDataStringMessage)
    .substring(2);
  return (
    0 <
    txReceipt.rawLogs.findIndex(rawLog => {
      return rawLog.data.includes(encodedErrorSignature);
    })
  );
}

export { constants };
