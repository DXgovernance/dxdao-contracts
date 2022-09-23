const constants = require("./constants");

const { LogDecoder } = require("@maticnetwork/eth-decoder");

const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const DAOController = artifacts.require("./DAOController.sol");
const DAOReputation = artifacts.require("./DAOReputation.sol");
const DXDVotingMachine = artifacts.require("./DXDVotingMachine.sol");
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
  DXDVotingMachine.abi,
  WalletScheme.abi,
  PermissionRegistry.abi,
  ERC20VestingFactory.abi,
  ERC721Factory.abi,
  ERC20Guild.abi,
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
  await controller.initialize(deployConfig.owner, reputation.address);

  const avatar = await DAOAvatar.new();
  await avatar.initialize(controller.address);

  for (let i = 0; i < deployConfig.repHolders.length; i++) {
    await reputation.mint(
      deployConfig.repHolders[i].address,
      deployConfig.repHolders[i].amount
    );
  }
  await reputation.transferOwnership(controller.address);

  const votingMachine = await DXDVotingMachine.new(
    deployConfig.votingMachineToken
  );

  return { controller, avatar, reputation, votingMachine };
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

export { constants };
