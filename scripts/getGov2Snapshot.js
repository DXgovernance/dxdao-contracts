const Web3 = require("web3");
const XLSX = require("xlsx");
const BN = Web3.utils.BN;

// Get network to use from arguments
const repTokenAddressMainnet = "0x7a927a93f221976aae26d5d077477307170f0b7c";
const repTokenAddressGnosis = "0xED77eaA9590cfCE0a126Bab3D8A6ada9A393d4f6";

const votingMachineMainnet1Address =
  "0x332b8c9734b4097de50f302f7d9f273ffdb45b84";
const votingMachineMainnet2Address =
  "0x1C18bAd5a3ee4e96611275B13a8ed062B4a13055";
const votingMachineGnosisAddress = "0xDA309aDF1c84242Bb446F7CDBa96B570E901D4CF";

const mainnetRepMapping = "0x458c390a29c6bed4aec37499b525b95eb0de217d";

const DxReputation = artifacts.require("DxReputation");
const VotingMachine = artifacts.require("GenesisProtocol");

const proposalExecutionBlockPlus24hrMainnet = 11968801; // https://etherscan.io/block/11968801
const proposalExecutionBlockPlus24hrGnosis = 14835000; // https://gnosisscan.io/block/14835000

const proposalExecutionBlockPlus6MonthsMainnet = 13149795; // https://etherscan.io/block/13149795
const proposalExecutionBlockPlus6MonthsGnosis = 17897300; // https://gnosisscan.io/block/17897300

const executionProposalTimestampPlusSixMonths = 1630643138; // (Sep-03-2021 01:25:38 AM +UTC)
const executionProposalTimestamp = 1614745538; // (March-03-2021 01:25:38 AM +UTC)

const blockDeployedRepMainnet = 7850172; // https://etherscan.io/tx/0x010194bde4fc1191633bc7855a5bcbef3f6cac17bf7733558b3949a158d56bac
const blockDeployedRepGnosis = 13060714; // https://gnosisscan.io/tx/0xaae7ae6ff43cb9feb5c7640060191dd8b86a2e1248c3932b51c20540742c16e1

const web3Mainnet = new Web3(
  "https://mainnet.infura.io/v3/6ad6d4a4ec79442eacfa967652729d1c"
);
const web3Gnosis = new Web3("https://gnosischain-rpc.gateway.pokt.network");

/*
  This script logs the eligible addresses to receive 8000 DXD in the Gov 2.0 signal proposal with
  the proposal id 0xf57b8345b7bcafdff729e2441900b5340251bcc83a4a4c48c6b273eed7ecb717.

  The conditions to be eligible are:
  - Have voted at least 3 times before 24 hours after the signal proposal execution.
  OR 
  - Have minted REP before 6 months after the signal proposal execution.
*/
async function main() {
  const DXRepMainnet = new web3Mainnet.eth.Contract(
    DxReputation.abi,
    repTokenAddressMainnet
  );
  const DXRepGnosis = new web3Gnosis.eth.Contract(
    DxReputation.abi,
    repTokenAddressGnosis
  );
  const votingMachineMainnet1 = new web3Mainnet.eth.Contract(
    VotingMachine.abi,
    votingMachineMainnet1Address
  );
  const votingMachineMainnet2 = new web3Mainnet.eth.Contract(
    VotingMachine.abi,
    votingMachineMainnet2Address
  );
  const votingMachineGnosis = new web3Gnosis.eth.Contract(
    VotingMachine.abi,
    votingMachineGnosisAddress
  );

  // Get all the REP mint and burn events that happened before 6 months after the  signal proposal execution
  const DXRepMainnetEvents = await DXRepMainnet.getPastEvents(
    ["Mint", "Burn"],
    {
      fromBlock: blockDeployedRepMainnet,
      toBlock: proposalExecutionBlockPlus6MonthsMainnet,
    }
  );
  const DXRepGnosisEvents = await DXRepGnosis.getPastEvents(["Mint", "Burn"], {
    fromBlock: blockDeployedRepGnosis,
    toBlock: proposalExecutionBlockPlus6MonthsGnosis,
  });

  // Get all the vote events that happened before 24 hours after the  signal proposal execution
  const votingMachineMainnet1VoteEvents =
    await votingMachineMainnet1.getPastEvents("VoteProposal", {
      fromBlock: blockDeployedRepMainnet,
      toBlock: proposalExecutionBlockPlus24hrMainnet,
    });
  const votingMachineMainnet2VoteEvents =
    await votingMachineMainnet2.getPastEvents("VoteProposal", {
      fromBlock: blockDeployedRepMainnet,
      toBlock: proposalExecutionBlockPlus24hrMainnet,
    });
  const votingMachineGnosisEvents = await votingMachineGnosis.getPastEvents(
    "VoteProposal",
    {
      fromBlock: blockDeployedRepGnosis,
      toBlock: proposalExecutionBlockPlus24hrGnosis,
    }
  );
  const allVoteEvents = votingMachineMainnet1VoteEvents
    .concat(votingMachineMainnet2VoteEvents)
    .concat(votingMachineGnosisEvents)
    .map(voteEvent => {
      voteEvent.voter = voteEvent.returnValues._voter;
      voteEvent.proposalId = voteEvent.returnValues._proposalId;
      voteEvent.vote = voteEvent.returnValues._vote;
      return voteEvent;
    });

  let mainnetRep = await processRepEvents(
    allVoteEvents,
    DXRepMainnetEvents,
    web3Mainnet
  );
  let gnosisRep = await processRepEvents(
    allVoteEvents,
    DXRepGnosisEvents,
    web3Gnosis
  );

  // Get the addresses that signaled the change of their REP address for gnosis REP
  const mappingLogs = await web3Mainnet.eth.getPastLogs({
    fromBlock: 10911798,
    address: mainnetRepMapping,
  });
  for (let i = 0; i < mappingLogs.length; i++) {
    if (
      mappingLogs[i].topics[2] ===
      "0xac3e2276e49f2e2937cb1feecb361dd733fd0de8711789aadbd4013a2e0dac14"
    ) {
      const fromAddress = web3.eth.abi.decodeParameter(
        "address",
        mappingLogs[i].topics[1]
      );
      const toAddress = web3.eth.abi.decodeLog(
        [
          {
            type: "string",
            name: "value",
            indexed: false,
          },
        ],
        mappingLogs[i].data
      ).value;
      if (
        web3.utils.isAddress(toAddress) &&
        mainnetRep[fromAddress] &&
        mainnetRep[fromAddress].amount.gt(0) &&
        fromAddress !== toAddress
      ) {
        console.log(
          "REP mapping from",
          fromAddress,
          "to",
          toAddress,
          "on tx",
          mappingLogs[i].transactionHash
        );

        // If toAddress already has REP, add the amount and update the first mint time and tx
        if (mainnetRep[toAddress]) {
          mainnetRep[toAddress].amount = mainnetRep[toAddress].amount.add(
            mainnetRep[fromAddress].amount
          );
          mainnetRep[toAddress].firstMintTime =
            mainnetRep[toAddress].firstMintTime <
            mainnetRep[fromAddress].firstMintTime
              ? mainnetRep[toAddress].firstMintTime
              : mainnetRep[fromAddress].firstMintTime;
          mainnetRep[toAddress].firstMintTx =
            mainnetRep[toAddress].firstMintTime <
            mainnetRep[fromAddress].firstMintTime
              ? mainnetRep[toAddress].firstMintTx
              : mainnetRep[fromAddress].firstMintTx;
          mainnetRep[toAddress].totalVotes =
            mainnetRep[toAddress].totalVotes +
            mainnetRep[fromAddress].totalVotes;
        } else {
          mainnetRep[toAddress] = mainnetRep[fromAddress];
        }

        delete mainnetRep[fromAddress];
      }
    }
  }

  // To merge the gnosis and mainnet rep we use mainnet rep as base and add gnosis rep if it is not in mainnet rep
  // In case an account has REP in both networks we use the highest amount and the earliest first mint time
  let mergedRep = mainnetRep;
  for (var address in gnosisRep) {
    if (mainnetRep[address]) {
      mergedRep[address] = {
        amount: mainnetRep[address].amount.gt(gnosisRep[address].amount)
          ? mainnetRep[address].amount
          : gnosisRep[address].amount,
        firstMintTime:
          mainnetRep[address].firstMintTime < gnosisRep[address].firstMintTime
            ? mainnetRep[address].firstMintTime
            : gnosisRep[address].firstMintTime,
        firstMintTx:
          mainnetRep[address].firstMintTime < gnosisRep[address].firstMintTime
            ? mainnetRep[address].firstMintTx
            : gnosisRep[address].firstMintTx,
        totalVotes:
          mainnetRep[address].totalVotes + gnosisRep[address].totalVotes,
      };
    } else {
      mergedRep[address] = gnosisRep[address];
    }
  }

  let totalRep = new BN(0);
  let eligibleRepMembers = [];
  for (address in mergedRep) {
    if (
      // If the rep holder voted 3 times or more before 24 hours after the signal proposal execution it is eligible
      mergedRep[address].totalVotes >= 3 ||
      // If the rep holder received rep during the 6 months after the signal proposal execution it is eligible
      (mergedRep[address].firstMintTime > executionProposalTimestamp &&
        mergedRep[address].firstMintTime <
          executionProposalTimestampPlusSixMonths)
    ) {
      eligibleRepMembers.push({
        address: address,
        weiAmount: mergedRep[address].amount.toString(),
        parsedAmount: Number(
          web3.utils.fromWei(mergedRep[address].amount)
        ).toFixed(4),
        REPPercentage: 0,
        totalVotes: mergedRep[address].totalVotes,
        firstMintTx: mergedRep[address].firstMintTx,
      });
      totalRep = totalRep.add(mergedRep[address].amount);
    }
  }

  eligibleRepMembers.map(a => {
    a.REPPercentage = (
      (web3.utils.fromWei(a.weiAmount) / web3.utils.fromWei(totalRep)) *
      100
    ).toFixed(4);
  });

  // Sort all eligible REP holders by amount
  eligibleRepMembers = eligibleRepMembers.sort(
    (a, b) => b.weiAmount - a.weiAmount
  );
  console.log();

  // Log all elegible REP holders and their % of the total eligible REP
  console.log("Total REP: ", web3.utils.fromWei(totalRep).toString());
  console.log(
    "(Address, Total Votes, First mint TX, REP amount, % of eligible REP)"
  );
  eligibleRepMembers.map((a, i) =>
    console.log(
      i,
      a.address,
      a.totalVotes,
      a.firstMintTx,
      Number(web3.utils.fromWei(a.weiAmount)).toFixed(4),
      a.REPPercentage
    )
  );

  // Save everything into a spreadsheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(eligibleRepMembers);
  const voteEvents = XLSX.utils.json_to_sheet(allVoteEvents);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Eligible REP");
  XLSX.utils.book_append_sheet(workbook, voteEvents, "Vote events");
  XLSX.writeFile(workbook, "Gov 2.0 DXD Distribution.xlsx");
}

async function processRepEvents(allVoteEvents, events, web3Provider) {
  const repDistribution = {};

  const chainId = await web3Provider.eth.net.getId();

  for (var i = 0; i < events.length; i++) {
    if (events[i].event === "Mint") {
      const mintedRep = new BN(events[i].returnValues._amount.toString());
      const toAddress = web3.utils.toChecksumAddress(
        events[i].returnValues._to
      );
      if (repDistribution[toAddress]) {
        repDistribution[toAddress].amount =
          repDistribution[toAddress].amount.add(mintedRep);
      } else {
        repDistribution[toAddress] = {
          amount: mintedRep,
          totalVotes: allVoteEvents.filter(e => e.voter === toAddress).length,
          firstMintTime: (
            await web3Provider.eth.getBlock(events[i].blockNumber)
          ).timestamp,
          firstMintTx:
            (chainId === 1
              ? "https://etherscan.io/tx/"
              : "https://gnosisscan.io/tx/") + events[i].transactionHash,
        };
      }
    }
  }
  for (i = 0; i < events.length; i++) {
    if (events[i].event === "Burn") {
      const burnedRep = new BN(events[i].returnValues._amount.toString());
      const fromAddress = web3.utils.toChecksumAddress(
        events[i].returnValues._from
      );
      repDistribution[fromAddress].amount =
        repDistribution[fromAddress].amount.sub(burnedRep);

      if (repDistribution[fromAddress].amount.eq(0)) {
        delete repDistribution[fromAddress];
      }
    }
  }

  return repDistribution;
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
