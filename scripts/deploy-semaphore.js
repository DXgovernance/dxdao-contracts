const { task, types } = require("hardhat/config");

task("deploy-semaphore", "Deploy a Greeter contract")
  .addOptionalParam(
    "semaphore",
    "Semaphore contract address",
    undefined,
    types.address
  )
  .addOptionalParam("logs", "Print the logs", true, types.boolean)
  .setAction(async ({ logs }, { run }) => {
    const { address: verifierAddress } = await run("deploy:verifier", {
      logs,
      merkleTreeDepth: 20,
    });

    const { address: semaphoreAddress } = await run("deploy:semaphore", {
      logs,
      verifiers: [
        {
          merkleTreeDepth: 20,
          contractAddress: verifierAddress,
        },
      ],
    });
    if (logs) {
      console.log(`Verifier contract has been deployed to: ${verifierAddress}`);
      console.log(
        `Semaphore contract has been deployed to: ${semaphoreAddress}`
      );
    }

    return {
      verifierAddress,
      semaphoreAddress,
    };
  });
