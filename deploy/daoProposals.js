module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer, tokenHolder } = await getNamedAccounts();

  function testCallFrom(address, number = 1) {
    return new web3.eth.Contract(ActionMock.abi).methods
      .test(address, number)
      .encodeABI();
  }

  const SOME_HASH =
    "0x1000000000000000000000000000000000000000000000000000000000000000";
  const TEST_TITLE = "Awesome Proposal Title";

  const ActionMock = await hre.artifacts.require("ActionMock");
  const actionMockDeployed = await deploy("ActionMock", {
    name: "ActionMock",
    from: deployer,
    args: [],
  });
  const actionMock = await ActionMock.at(actionMockDeployed.address);

  const Controller = await hre.artifacts.require("DAOController");
  const controllerDeployed = await deployments.get("DAOController");
  const controller = await Controller.at(controllerDeployed.address);

  const avatarDeployed = await deployments.get("DAOAvatar");

  const AvatarScheme = await hre.artifacts.require("AvatarScheme");
  const avatarSchemeDeployed = await deployments.get("AvatarScheme");
  const avatarScheme = await AvatarScheme.at(avatarSchemeDeployed.address);

  const PermissionRegistry = await hre.artifacts.require("PermissionRegistry");
  const permissionRegistryDeployed = await deployments.get(
    "PermissionRegistry"
  );
  const permissionRegistry = await PermissionRegistry.at(
    permissionRegistryDeployed.address
  );
  await permissionRegistry.setETHPermission(
    avatarSchemeDeployed.address,
    actionMockDeployed.address,
    web3.eth.abi.encodeFunctionSignature("test(address,uint256)"),
    0,
    true
  );

  const callData = testCallFrom(avatarDeployed.address);
  const callDataMintRep = await controller.contract.methods
    .mintReputation(10, tokenHolder)
    .encodeABI();

  await avatarScheme.proposeCalls(
    [actionMock.address, controllerDeployed.address],
    [callData, callDataMintRep],
    [0, 0],
    2,
    TEST_TITLE,
    SOME_HASH
  );
  // const proposalId = await helpers.getValueFromLogs(tx, "_proposalId");
  // await org.votingMachine.vote(proposalId, constants.YES_OPTION, 0, {
  //   from: accounts[2],
  // });
  // const organizationProposal = await avatarScheme.getProposal(proposalId);
  // assert.equal(
  //   organizationProposal.state,
  //   constants.WALLET_SCHEME_PROPOSAL_STATES.passed
  // );
};

module.exports.tags = ["DAOProposals"];
module.exports.dependencies = [
  "AvatarScheme",
  "DAOAvatar",
  "Controller",
  "PermissionRegistry",
];

