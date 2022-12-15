module.exports = async () => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const deploySalt = process.env.DEPLOY_SALT;

  const create2Deploy = await deploy("Create2Deployer", {
    name: "Create2Deployer",
    from: deployer,
    args: [],
    deterministicDeployment: deploySalt,
  });

  console.log(`Create2Deployer address ${create2Deploy.address}`);
};

module.exports.tags = ["Create2"];

