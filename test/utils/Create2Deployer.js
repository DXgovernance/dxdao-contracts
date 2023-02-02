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

    const expectedPrivateDeploymentAddress =
      await create2Deployer.getPrivateDeploymentAddress(
        DAOAvatar.bytecode,
        senderDeployment
      );
    const expectedPublicDeploymentAddress =
      await create2Deployer.getPublicDeploymentAddress(
        DAOAvatar.bytecode,
        senderHashed
      );

    const privateDeploymentAddress = await create2Deployer.deployPrivate(
      DAOAvatar.bytecode,
      initializeData,
      { from: accounts[1] }
    );
    const publicDeploymentAddress = await create2Deployer.deployPublic(
      DAOAvatar.bytecode,
      initializeData,
      senderHashed
    );

    const daoAvatarPrivate = await DAOAvatar.at(
      privateDeploymentAddress.logs[0].args.addr
    );
    const daoAvatarPublic = await DAOAvatar.at(
      publicDeploymentAddress.logs[0].args.addr
    );

    // We check that the addresses are the same as the ones we expected
    assert.equal(expectedPrivateDeploymentAddress, daoAvatarPrivate.address);
    assert.equal(expectedPublicDeploymentAddress, daoAvatarPublic.address);

    // We check that the owner of the avatar is the same as the one we set in the initialization data
    assert.equal(await daoAvatarPrivate.owner(), avatarOwner);
    assert.equal(await daoAvatarPublic.owner(), avatarOwner);
  });
});
