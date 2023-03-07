import { constants, expectRevert } from "@openzeppelin/test-helpers";
import { assert } from "chai";

const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const Create2Deployer = artifacts.require("./Create2Deployer.sol");
const ActionMock = artifacts.require("./ActionMock.sol");

contract("Create2Deployer", function (accounts) {
  let create2Deployer;
  before(async () => {
    create2Deployer = await Create2Deployer.at(
      (
        await hre.run("create2DeployerDeploy")
      ).contractAddress
    );
  });

  it("Deploy same contract with initializeCall using all deployment methods", async () => {
    const actionMock = await ActionMock.new();

    const senderDeployment = accounts[1];
    const avatarOwner = accounts[3];

    // As hash for the public deployment we use exactly the same used for the private deployment to try to reproduce the same address
    const senderHashed = await create2Deployer.hashSender(senderDeployment);

    // We will also use the same initialization data for both deployments, setting the owner of the avatar to the same address
    const initializeData = web3.eth.abi.encodeFunctionCall(
      DAOAvatar.abi.find(x => x.name === "initialize"),
      [avatarOwner]
    );

    const expectedHashedSenderDeploymentAddress =
      await create2Deployer.getHashedSenderDeployAddress(
        DAOAvatar.bytecode,
        actionMock.address
      );
    const expectedHashedOriginDeploymentAddress =
      await create2Deployer.getHashedOriginDeployAddress(
        DAOAvatar.bytecode,
        senderDeployment
      );
    const expectedHashedSaltDeploymentAddress =
      await create2Deployer.getHashedSaltDeployAddress(
        DAOAvatar.bytecode,
        senderHashed
      );
    const expectedHashedInitializeCallDeploymentAddress =
      await create2Deployer.getHashedInitializeCallDeployAddress(
        DAOAvatar.bytecode,
        initializeData
      );

    const deployWithHashedSenderData = web3.eth.abi.encodeFunctionCall(
      create2Deployer.abi.find(x => x.name === "deployWithHashedSender"),
      [DAOAvatar.bytecode, initializeData]
    );
    const hashedSenderDeploymentTx = await actionMock.executeCall(
      create2Deployer.address,
      deployWithHashedSenderData,
      0,
      { from: senderDeployment }
    );

    const hashedOriginDeploymentTx =
      await create2Deployer.deployWithHashedOrigin(
        DAOAvatar.bytecode,
        initializeData,
        { from: senderDeployment }
      );
    const hashedSaltDeploymentTx = await create2Deployer.deployWithHashedSalt(
      DAOAvatar.bytecode,
      initializeData,
      senderHashed
    );
    const hashedInitializeCallDeploymentTx =
      await create2Deployer.deployWithHashedInitializeCall(
        DAOAvatar.bytecode,
        initializeData
      );

    const daoAvatarDeployedWithHashedSender = await DAOAvatar.at(
      web3.eth.abi.decodeParameters(
        ["address", "bytes32", "uint256", "uint256"],
        hashedSenderDeploymentTx.receipt.rawLogs[2].data
      )[0]
    );
    const daoAvatarDeployedWithHashedOrigin = await DAOAvatar.at(
      hashedOriginDeploymentTx.logs[0].args.addr
    );
    const daoAvatarDeployedWithHashedSalt = await DAOAvatar.at(
      hashedSaltDeploymentTx.logs[0].args.addr
    );
    const daoAvatarDeployedWithHashedInitializeCall = await DAOAvatar.at(
      hashedInitializeCallDeploymentTx.logs[0].args.addr
    );

    // We check that the addresses are the same as the ones we expected
    assert.equal(
      expectedHashedSenderDeploymentAddress,
      daoAvatarDeployedWithHashedSender.address
    );
    assert.equal(
      expectedHashedOriginDeploymentAddress,
      daoAvatarDeployedWithHashedOrigin.address
    );
    assert.equal(
      expectedHashedSaltDeploymentAddress,
      daoAvatarDeployedWithHashedSalt.address
    );
    assert.equal(
      expectedHashedInitializeCallDeploymentAddress,
      daoAvatarDeployedWithHashedInitializeCall.address
    );

    const hasDuplicates = arr => new Set(arr).size !== arr.length;

    assert(
      !hasDuplicates([
        expectedHashedSenderDeploymentAddress,
        expectedHashedOriginDeploymentAddress,
        expectedHashedSaltDeploymentAddress,
        expectedHashedInitializeCallDeploymentAddress,
      ])
    );

    // We check that the owner of the avatar is the same as the one we set in the initialization data
    assert.equal(await daoAvatarDeployedWithHashedSender.owner(), avatarOwner);
    assert.equal(await daoAvatarDeployedWithHashedOrigin.owner(), avatarOwner);
    assert.equal(await daoAvatarDeployedWithHashedSalt.owner(), avatarOwner);
    assert.equal(
      await daoAvatarDeployedWithHashedInitializeCall.owner(),
      avatarOwner
    );
  });

  it("Deploy same contract without initializeCall using all deployment methods", async () => {
    const actionMock = await ActionMock.new();

    const senderDeployment = accounts[2];

    // As hash for the public deployment we use exactly the same used for the private deployment to try to reproduce the same address
    const senderHashed = await create2Deployer.hashSender(senderDeployment);

    // Initialization data is empty
    const initializeData = "0x";

    const expectedHashedSenderDeploymentAddress =
      await create2Deployer.getHashedSenderDeployAddress(
        DAOAvatar.bytecode,
        actionMock.address
      );
    const expectedHashedOriginDeploymentAddress =
      await create2Deployer.getHashedOriginDeployAddress(
        DAOAvatar.bytecode,
        senderDeployment
      );
    const expectedHashedSaltDeploymentAddress =
      await create2Deployer.getHashedSaltDeployAddress(
        DAOAvatar.bytecode,
        senderHashed
      );

    const deployWithHashedSenderData = web3.eth.abi.encodeFunctionCall(
      create2Deployer.abi.find(x => x.name === "deployWithHashedSender"),
      [DAOAvatar.bytecode, initializeData]
    );
    const hashedSenderDeploymentTx = await actionMock.executeCall(
      create2Deployer.address,
      deployWithHashedSenderData,
      0,
      { from: senderDeployment }
    );

    const hashedOriginDeploymentTx =
      await create2Deployer.deployWithHashedOrigin(
        DAOAvatar.bytecode,
        initializeData,
        { from: senderDeployment }
      );
    const hashedSaltDeploymentTx = await create2Deployer.deployWithHashedSalt(
      DAOAvatar.bytecode,
      initializeData,
      senderHashed
    );

    // Cant deploy with hashed initializeCall if initializeCallData is empty
    await expectRevert(
      create2Deployer.deployWithHashedInitializeCall(
        DAOAvatar.bytecode,
        initializeData
      ),
      "Create2HashedInitializeCallDeployer: initializeCallData cant be 0x"
    );

    const daoAvatarDeployedWithHashedSender = await DAOAvatar.at(
      web3.eth.abi.decodeParameters(
        ["address", "bytes32", "uint256", "uint256"],
        hashedSenderDeploymentTx.receipt.rawLogs[0].data
      )[0]
    );
    const daoAvatarDeployedWithHashedOrigin = await DAOAvatar.at(
      hashedOriginDeploymentTx.logs[0].args.addr
    );
    const daoAvatarDeployedWithHashedSalt = await DAOAvatar.at(
      hashedSaltDeploymentTx.logs[0].args.addr
    );

    // We check that the addresses are the same as the ones we expected
    assert.equal(
      expectedHashedSenderDeploymentAddress,
      daoAvatarDeployedWithHashedSender.address
    );
    assert.equal(
      expectedHashedOriginDeploymentAddress,
      daoAvatarDeployedWithHashedOrigin.address
    );
    assert.equal(
      expectedHashedSaltDeploymentAddress,
      daoAvatarDeployedWithHashedSalt.address
    );

    const hasDuplicates = arr => new Set(arr).size !== arr.length;

    assert(
      !hasDuplicates([
        expectedHashedSenderDeploymentAddress,
        expectedHashedOriginDeploymentAddress,
        expectedHashedSaltDeploymentAddress,
      ])
    );

    // We check that the owner of the avatar is the same as the one we set in the initialization data
    assert.equal(
      await daoAvatarDeployedWithHashedSender.owner(),
      constants.ZERO_ADDRESS
    );
    assert.equal(
      await daoAvatarDeployedWithHashedOrigin.owner(),
      constants.ZERO_ADDRESS
    );
    assert.equal(
      await daoAvatarDeployedWithHashedSalt.owner(),
      constants.ZERO_ADDRESS
    );
  });

  it("Fail deployment of same contract with wrong initializeCall using all deployment methods", async () => {
    const actionMock = await ActionMock.new();

    const senderDeployment = accounts[3];
    const avatarOwner = constants.ZERO_ADDRESS;

    // As hash for the public deployment we use exactly the same used for the private deployment to try to reproduce the same address
    const senderHashed = await create2Deployer.hashSender(senderDeployment);

    // We will also use the same initialization data for both deployments, setting the owner of the avatar to the same address
    const initializeData = web3.eth.abi.encodeFunctionCall(
      DAOAvatar.abi.find(x => x.name === "initialize"),
      [avatarOwner]
    );

    const expectedHashedSenderDeploymentAddress =
      await create2Deployer.getHashedSenderDeployAddress(
        DAOAvatar.bytecode,
        actionMock.address
      );
    const expectedHashedOriginDeploymentAddress =
      await create2Deployer.getHashedOriginDeployAddress(
        DAOAvatar.bytecode,
        senderDeployment
      );
    const expectedHashedSaltDeploymentAddress =
      await create2Deployer.getHashedSaltDeployAddress(
        DAOAvatar.bytecode,
        senderHashed
      );
    const expectedHashedInitializeCallDeploymentAddress =
      await create2Deployer.getHashedInitializeCallDeployAddress(
        DAOAvatar.bytecode,
        initializeData
      );

    const deployWithHashedSenderData = web3.eth.abi.encodeFunctionCall(
      create2Deployer.abi.find(x => x.name === "deployWithHashedSender"),
      [DAOAvatar.bytecode, initializeData]
    );
    await actionMock.executeCall(
      create2Deployer.address,
      deployWithHashedSenderData,
      0,
      { from: senderDeployment }
    );

    await expectRevert(
      create2Deployer.deployWithHashedOrigin(
        DAOAvatar.bytecode,
        initializeData,
        { from: senderDeployment }
      ),
      "Create2HashedOriginDeployer: initializeCallData failed"
    );
    await expectRevert(
      create2Deployer.deployWithHashedSalt(
        DAOAvatar.bytecode,
        initializeData,
        senderHashed
      ),
      "Create2HashedSaltDeployer: initializeCallData failed"
    );
    await expectRevert(
      create2Deployer.deployWithHashedInitializeCall(
        DAOAvatar.bytecode,
        initializeData
      ),
      "Create2HashedInitializeCallDeployer: initializeCallData failed"
    );

    assert.equal(
      "0x",
      await web3.eth.getCode(expectedHashedSenderDeploymentAddress)
    );
    assert.equal(
      "0x",
      await web3.eth.getCode(expectedHashedOriginDeploymentAddress)
    );
    assert.equal(
      "0x",
      await web3.eth.getCode(expectedHashedSaltDeploymentAddress)
    );
    assert.equal(
      "0x",
      await web3.eth.getCode(expectedHashedInitializeCallDeploymentAddress)
    );
  });
});
