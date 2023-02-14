const DAOAvatar = artifacts.require("./DAOAvatar.sol");
const Create2Deployer = artifacts.require("./Create2Deployer.sol");

contract("Create2Deployer", function (accounts) {
  it("Test deployment", async () => {
    const create2Deployer = await Create2Deployer.at(
      (
        await hre.run("create2DeployerDeploy")
      ).contractAddress
    );

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

    const hashedSenderDeploymentTx =
      await create2Deployer.deployWithHashedSender(
        DAOAvatar.bytecode,
        initializeData,
        { from: accounts[1] }
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
      hashedSenderDeploymentTx.logs[0].args.addr
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
      expectedHashedSaltDeploymentAddress,
      daoAvatarDeployedWithHashedSalt.address
    );
    assert.equal(
      expectedHashedInitializeCallDeploymentAddress,
      daoAvatarDeployedWithHashedInitializeCall.address
    );

    // We check that the owner of the avatar is the same as the one we set in the initialization data
    assert.equal(await daoAvatarDeployedWithHashedSender.owner(), avatarOwner);
    assert.equal(await daoAvatarDeployedWithHashedSalt.owner(), avatarOwner);
    assert.equal(
      await daoAvatarDeployedWithHashedInitializeCall.owner(),
      avatarOwner
    );
  });
});
