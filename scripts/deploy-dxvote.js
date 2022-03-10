/* eslint-disable no-case-declarations */
require("@nomiclabs/hardhat-web3");

const contentHash = require("content-hash");
const IPFS = require("ipfs");
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ANY_FUNC_SIGNATURE = "0xaaaaaaaa";

const { encodePermission } = require("../test/helpers/permissions");
const moment = require("moment");
const { default: BigNumber } = require("bignumber.js");

task("deploy-dxvote", "Deploy dxvote in localhost network")
  .addParam("deployconfig", "The deploy config json in string format")
  .setAction(async ({ deployconfig }) => {
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    const deploymentConfig = JSON.parse(deployconfig);

    const DxAvatar = await hre.artifacts.require("DxAvatar");
    const DxReputation = await hre.artifacts.require("DxReputation");
    const DxController = await hre.artifacts.require("DxController");
    const ContributionReward = await hre.artifacts.require(
      "ContributionReward"
    );
    const Redeemer = await hre.artifacts.require("Redeemer");
    const WalletScheme = await hre.artifacts.require("WalletScheme");
    const PermissionRegistry = await hre.artifacts.require(
      "PermissionRegistry"
    );
    const DXDVotingMachine = await hre.artifacts.require("DXDVotingMachine");
    const ERC20Mock = await hre.artifacts.require("ERC20Mock");
    const Multicall = await hre.artifacts.require("Multicall");
    const DXdaoNFT = await hre.artifacts.require("DXdaoNFT");
    const DXDVestingFactory = await hre.artifacts.require("DXDVestingFactory");

    async function waitBlocks(blocks) {
      const toBlock = (await web3.eth.getBlock("latest")).number + blocks;
      while ((await web3.eth.getBlock("latest")).number < toBlock) {
        console.log("Waiting to block", toBlock, "...");
        await sleep(1000);
      }
      return;
    }
    const accounts = await web3.eth.getAccounts();
    const fromBlock = (await web3.eth.getBlock("latest")).number;

    // Get initial REP holders
    let founders = [],
      initialRep = [];
    deploymentConfig.reputation.map(initialRepHolder => {
      founders.push(initialRepHolder.address);
      initialRep.push(initialRepHolder.amount.toString());
    });

    let networkContracts = {
      fromBlock: 0,
      avatar: null,
      reputation: null,
      token: null,
      controller: null,
      permissionRegistry: null,
      schemes: {},
      utils: {},
      votingMachines: {
        dxd: {},
      },
    };

    // Deploy Multicall
    let multicall;
    console.log("Deploying Multicall...");
    multicall = await Multicall.new();
    console.log("Multicall deployed to:", multicall.address);
    await waitBlocks(1);
    networkContracts.utils.multicall = multicall.address;

    // Deploy and mint Reputation
    let reputation;

    console.log("Deploying DxReputation...");
    reputation = await DxReputation.new();
    console.log("DX Reputation deployed to:", reputation.address);
    await waitBlocks(1);

    await reputation.mintMultiple(founders, initialRep);
    await waitBlocks(1);

    networkContracts.fromBlock = fromBlock;
    networkContracts.reputation = reputation.address;

    // Deploy DXD
    let votingMachineToken;
    const totalDXD = deploymentConfig.votingMachineToken.reduce(function (
      prev,
      cur
    ) {
      return new BigNumber(prev).add(cur.amount.toString());
    },
    0);
    votingMachineToken = await ERC20Mock.new(accounts[0], totalDXD.toString());
    networkContracts.votingMachines.dxd.token = votingMachineToken.address;

    // Deploy Avatar
    let avatar;
    console.log(
      "Deploying DxAvatar...",
      votingMachineToken.address,
      reputation.address
    );
    avatar = await DxAvatar.new(
      "DXdao",
      votingMachineToken.address,
      reputation.address
    );

    console.log("DXdao Avatar deployed to:", avatar.address);
    networkContracts.avatar = avatar.address;
    networkContracts.token = votingMachineToken.address;
    await waitBlocks(1);

    // Distribute DXD
    console.log("Distirbuting DXD...");
    await deploymentConfig.votingMachineToken.map(
      async votingMachineTokenHolder => {
        await votingMachineToken.transfer(
          votingMachineTokenHolder.address,
          votingMachineTokenHolder.amount,
          { from: accounts[0] }
        );
      }
    );

    // Deploy Controller and transfer avatar to controller
    let controller;
    console.log("Deploying DxController...");
    controller = await DxController.new(avatar.address);
    console.log("DXdao Controller deployed to:", controller.address);
    await avatar.transferOwnership(controller.address);
    await reputation.transferOwnership(controller.address);
    networkContracts.controller = controller.address;
    await waitBlocks(1);

    // Deploy DXDVotingMachine
    let votingMachine;
    console.log("Deploying DXDVotingMachine...");
    votingMachine = await DXDVotingMachine.new(votingMachineToken.address);
    console.log("DXDVotingMachine deployed to:", votingMachine.address);
    networkContracts.votingMachines.dxd.address = votingMachine.address;
    networkContracts.votingMachines.dxd.token = votingMachineToken.address;
    await waitBlocks(1);
    await votingMachineToken.approve(votingMachine.address, MAX_UINT_256, {
      from: accounts[0],
    });
    await votingMachineToken.approve(votingMachine.address, MAX_UINT_256, {
      from: accounts[1],
    });
    await votingMachineToken.approve(votingMachine.address, MAX_UINT_256, {
      from: accounts[2],
    });

    // Deploy PermissionRegistry
    let permissionRegistry;

    console.log("Deploying PermissionRegistry...");
    permissionRegistry = await PermissionRegistry.new(accounts[0], 1);

    // Only allow the functions mintReputation, burnReputation, genericCall, registerScheme and unregisterScheme to be
    // called to in the controller contract from a scheme that calls the controller.
    // This permissions makes the other functions inaccessible
    const notAllowedControllerFunctions = [
      controller.contract._jsonInterface.find(
        method => method.name === "mintTokens"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "unregisterSelf"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "addGlobalConstraint"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "removeGlobalConstraint"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "upgradeController"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "sendEther"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "externalTokenTransfer"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "externalTokenTransferFrom"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "externalTokenApproval"
      ).signature,
      controller.contract._jsonInterface.find(
        method => method.name === "metaData"
      ).signature,
    ];
    for (var i = 0; i < notAllowedControllerFunctions.length; i++) {
      await permissionRegistry.setAdminPermission(
        NULL_ADDRESS,
        avatar.address,
        controller.address,
        notAllowedControllerFunctions[i],
        MAX_UINT_256,
        false
      );
    }

    await permissionRegistry.setAdminPermission(
      NULL_ADDRESS,
      avatar.address,
      controller.address,
      ANY_FUNC_SIGNATURE,
      0,
      true
    );

    console.log("Permission Registry deployed to:", permissionRegistry.address);
    networkContracts.permissionRegistry = permissionRegistry.address;
    await waitBlocks(1);

    // Deploy ContributionReward Scheme
    console.log("Deploying ContributionReward scheme");
    const contributionReward = await ContributionReward.new();
    const redeemer = await Redeemer.new();
    const contributionRewardParamsHash = await votingMachine.getParametersHash(
      [
        deploymentConfig.contributionReward.queuedVoteRequiredPercentage.toString(),
        deploymentConfig.contributionReward.queuedVotePeriodLimit.toString(),
        deploymentConfig.contributionReward.boostedVotePeriodLimit.toString(),
        deploymentConfig.contributionReward.preBoostedVotePeriodLimit.toString(),
        deploymentConfig.contributionReward.thresholdConst.toString(),
        deploymentConfig.contributionReward.quietEndingPeriod.toString(),
        deploymentConfig.contributionReward.proposingRepReward.toString(),
        deploymentConfig.contributionReward.votersReputationLossRatio.toString(),
        deploymentConfig.contributionReward.minimumDaoBounty.toString(),
        deploymentConfig.contributionReward.daoBountyConst.toString(),
        0,
      ],
      NULL_ADDRESS,
      { from: accounts[0], gasPrice: 0 }
    );
    await votingMachine.setParameters(
      [
        deploymentConfig.contributionReward.queuedVoteRequiredPercentage.toString(),
        deploymentConfig.contributionReward.queuedVotePeriodLimit.toString(),
        deploymentConfig.contributionReward.boostedVotePeriodLimit.toString(),
        deploymentConfig.contributionReward.preBoostedVotePeriodLimit.toString(),
        deploymentConfig.contributionReward.thresholdConst.toString(),
        deploymentConfig.contributionReward.quietEndingPeriod.toString(),
        deploymentConfig.contributionReward.proposingRepReward.toString(),
        deploymentConfig.contributionReward.votersReputationLossRatio.toString(),
        deploymentConfig.contributionReward.minimumDaoBounty.toString(),
        deploymentConfig.contributionReward.daoBountyConst.toString(),
        0,
      ],
      NULL_ADDRESS
    );
    await contributionReward.setParameters(
      contributionRewardParamsHash,
      votingMachine.address
    );
    const contributionRewardVotingmachineParamsHash =
      await contributionReward.getParametersHash(
        contributionRewardParamsHash,
        votingMachine.address
      );
    await controller.registerScheme(
      contributionReward.address,
      contributionRewardVotingmachineParamsHash,
      encodePermission({
        canGenericCall: true,
        canUpgrade: false,
        canRegisterSchemes: false,
      }),
      avatar.address
    );

    networkContracts.daostack = {
      [contributionReward.address]: {
        contractToCall: controller.address,
        creationLogEncoding: [
          [
            {
              name: "_descriptionHash",
              type: "string",
            },
            {
              name: "_reputationChange",
              type: "int256",
            },
            {
              name: "_rewards",
              type: "uint256[5]",
            },
            {
              name: "_externalToken",
              type: "address",
            },
            {
              name: "_beneficiary",
              type: "address",
            },
          ],
        ],
        name: "ContributionReward",
        newProposalTopics: [
          [
            "0xcbdcbf9aaeb1e9eff0f75d74e1c1e044bc87110164baec7d18d825b0450d97df",
            "0x000000000000000000000000519b70055af55a007110b4ff99b0ea33071c720a",
          ],
        ],
        redeemer: redeemer.address,
        supported: true,
        type: "ContributionReward",
        voteParams: contributionRewardVotingmachineParamsHash,
        votingMachine: votingMachine.address,
      },
    };

    // Deploy Wallet Schemes
    for (var s = 0; s < deploymentConfig.walletSchemes.length; s++) {
      const schemeConfiguration = deploymentConfig.walletSchemes[s];

      console.log(`Deploying ${schemeConfiguration.name}...`);
      const newScheme = await WalletScheme.new();
      console.log(
        `${schemeConfiguration.name} deployed to: ${newScheme.address}`
      );

      let schemeParamsHash = await votingMachine.getParametersHash(
        [
          schemeConfiguration.queuedVoteRequiredPercentage.toString(),
          schemeConfiguration.queuedVotePeriodLimit.toString(),
          schemeConfiguration.boostedVotePeriodLimit.toString(),
          schemeConfiguration.preBoostedVotePeriodLimit.toString(),
          schemeConfiguration.thresholdConst.toString(),
          schemeConfiguration.quietEndingPeriod.toString(),
          schemeConfiguration.proposingRepReward.toString(),
          schemeConfiguration.votersReputationLossRatio.toString(),
          schemeConfiguration.minimumDaoBounty.toString(),
          schemeConfiguration.daoBountyConst.toString(),
          0,
        ],
        NULL_ADDRESS,
        { from: accounts[0], gasPrice: 0 }
      );

      await votingMachine.setParameters(
        [
          schemeConfiguration.queuedVoteRequiredPercentage.toString(),
          schemeConfiguration.queuedVotePeriodLimit.toString(),
          schemeConfiguration.boostedVotePeriodLimit.toString(),
          schemeConfiguration.preBoostedVotePeriodLimit.toString(),
          schemeConfiguration.thresholdConst.toString(),
          schemeConfiguration.quietEndingPeriod.toString(),
          schemeConfiguration.proposingRepReward.toString(),
          schemeConfiguration.votersReputationLossRatio.toString(),
          schemeConfiguration.minimumDaoBounty.toString(),
          schemeConfiguration.daoBountyConst.toString(),
          0,
        ],
        NULL_ADDRESS
      );

      console.log("Initializing scheme...");
      await newScheme.initialize(
        avatar.address,
        votingMachine.address,
        schemeConfiguration.doAvatarGenericCalls,
        controller.address,
        permissionRegistry.address,
        schemeConfiguration.name,
        schemeConfiguration.maxSecondsForExecution,
        schemeConfiguration.maxRepPercentageChange
      );

      console.log("Setting scheme permissions...");
      for (var p = 0; p < schemeConfiguration.permissions.length; p++) {
        const permission = schemeConfiguration.permissions[p];
        if (networkContracts.schemes && networkContracts.schemes[permission.to])
          permission.to = networkContracts.schemes[permission.to];
        else if (permission.to === "ITSELF") permission.to = newScheme.address;
        else if (permission.to === "DXDVotingMachine")
          permission.to = networkContracts.votingMachines.dxd.address;

        await permissionRegistry.setAdminPermission(
          permission.asset === "DXD"
            ? networkContracts.votingMachines.dxd.address
            : permission.asset,
          schemeConfiguration.doAvatarGenericCalls
            ? avatar.address
            : newScheme.address,
          permission.to,
          permission.functionSignature,
          permission.value.toString(),
          permission.allowed
        );
      }

      if (schemeConfiguration.boostedVoteRequiredPercentage > 0) {
        console.log(
          "Setting boosted vote required percentage in voting machine..."
        );
        await controller.genericCall(
          votingMachine.address,
          web3.eth.abi.encodeFunctionCall(
            {
              name: "setBoostedVoteRequiredPercentage",
              type: "function",
              inputs: [
                {
                  type: "address",
                  name: "_scheme",
                },
                {
                  type: "bytes32",
                  name: "_paramsHash",
                },
                {
                  type: "uint256",
                  name: "_boostedVotePeriodLimit",
                },
              ],
            },
            [
              newScheme.address,
              schemeParamsHash,
              schemeConfiguration.boostedVoteRequiredPercentage,
            ]
          ),
          avatar.address,
          0
        );
      }

      console.log("Registering scheme in controller...");
      await controller.registerScheme(
        newScheme.address,
        schemeParamsHash,
        encodePermission(schemeConfiguration.controllerPermissions),
        avatar.address
      );

      networkContracts.schemes[schemeConfiguration.name] = newScheme.address;
    }

    // Distribute ETH
    console.log("Distirbuting ETH...");
    await deploymentConfig.ethTransfers.map(async ethTransfer => {
      await web3.eth.sendTransaction({
        to: ethTransfer.address,
        value: ethTransfer.amount,
        from: accounts[0],
      });
    });

    // Deploy dxDaoNFT if it is not set
    let dxDaoNFT;
    console.log("Deploying DXdaoNFT...");
    dxDaoNFT = await DXdaoNFT.new();
    networkContracts.utils.dxDaoNFT = dxDaoNFT.address;

    // Deploy DXDVestingFactory if it is not set
    let dxdVestingFactory;
    console.log("Deploying DXDVestingFactory...");
    dxdVestingFactory = await DXDVestingFactory.new(
      networkContracts.votingMachines.dxd.token,
      avatar.address
    );
    networkContracts.utils.dxdVestingFactory = dxdVestingFactory.address;

    // Transfer all ownership and power to the dao
    console.log("Transfering ownership...");
    // Set the permission delay in the permission registry
    await permissionRegistry.setTimeDelay(
      deploymentConfig.permissionRegistryDelay
    );
    await permissionRegistry.transferOwnership(avatar.address);
    await dxDaoNFT.transferOwnership(avatar.address);
    await controller.unregisterScheme(accounts[0], avatar.address);

    const startTime = moment().unix();
    const ipfs = await IPFS.create();
    let proposals = [];
    for (let i = 0; i < deploymentConfig.actions.length; i++) {
      const action = deploymentConfig.actions[i];

      if (action.time)
        await network.provider.send("evm_increaseTime", [
          startTime + action.time - moment().unix(),
        ]);

      switch (action.type) {
        case "proposal":
          const { cid } = await ipfs.add(
            JSON.stringify({
              description: action.data.description,
              title: action.data.title,
              tags: action.data.tags,
              url: "",
            })
          );

          console.log("Submitting proposal");
          const proposalCreationTx =
            action.data.scheme === "ContributionReward"
              ? await (
                  await ContributionReward.at(
                    networkContracts.schemes[contributionReward.address]
                  )
                ).proposeContributionReward(
                  avatar.address,
                  contentHash.fromIpfs(cid.toString()),
                  action.data.reputationChange,
                  action.data.rewards,
                  action.data.externalToken,
                  action.data.beneficiary,
                  { from: action.from }
                )
              : await (
                  await WalletScheme.at(
                    networkContracts.schemes[action.data.scheme]
                  )
                ).proposeCalls(
                  action.data.to,
                  action.data.callData,
                  action.data.value,
                  action.data.title,
                  contentHash.fromIpfs(cid.toString()),
                  { from: action.from }
                );
          proposals.push(proposalCreationTx.receipt.logs[0].args._proposalId);
          break;
        case "vote":
          console.log("Adding vote");
          await votingMachine.vote(
            proposals[action.data.proposal],
            action.data.decision,
            action.data.amount,
            action.from,
            { from: action.from }
          );
          break;
        case "stake":
          console.log("Adding stake");
          await votingMachine.stake(
            proposals[action.data.proposal],
            action.data.decision,
            action.data.amount,
            { from: action.from }
          );
          break;
        case "execute":
          console.log("Executing proposal");
          try {
            await votingMachine.execute(proposals[action.data.proposal], {
              from: action.from,
            });
          } catch (error) {
            console.log(`Execution of proposal ${action.data.proposal} failed`);
          }
          break;
        case "redeem":
          console.log("Executing redeem");
          await votingMachine.redeem(
            proposals[action.data.proposal],
            action.from,
            { from: action.from }
          );
          break;
        default:
          break;
      }
    }

    const timeInhardhat = (await web3.eth.getBlock("latest")).timestamp;

    // Increase time to local time
    await hre.network.provider.request({
      method: "evm_increaseTime",
      params: [moment().unix() - timeInhardhat],
    });

    // Deployment Finished
    console.log("Contracts deployed:", networkContracts);

    return networkContracts;
  });
