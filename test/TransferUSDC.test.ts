import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "ethers";
import { getProviderRpcUrl, getRouterConfig } from "../helpers/utils";
import { fundWallet } from "../helpers/fund";
import { getTokenInfo } from "../helpers/tokens";

describe("Transfer USDC - Cross-chain", function () {
  let deployer: any;
  let recipient: any;

  let sourceChain: string = "avalancheFuji";
  let destinationChain: string = "ethereumSepolia";
  let sourceRouterConfig: any = getRouterConfig(sourceChain);
  let destinationRouterConfig: any = getRouterConfig(destinationChain);

  let amountToSend: bigint = ethers.parseUnits("10", 6); // 10 USDC
  let gasLimit: bigint = 500000n;

  let transferUSDC: any;
  let transactionReceipt: any;
  let gasUsed: bigint;
  let adjGasLimit: bigint;

  before(async function () {
    [deployer, recipient] = await hre.ethers.getSigners();

    const usdcInfo = getTokenInfo("usdc");
    const linkInfo = getTokenInfo("link");

    // Step 1: Fork source chain and deploy TransferUSDC contract
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: getProviderRpcUrl(sourceChain),
          },
        },
      ],
    });

    const transferUSDCFactory = await hre.ethers.getContractFactory("TransferUSDC");
    transferUSDC = await transferUSDCFactory.deploy(
      sourceRouterConfig.address,
      linkInfo.tokenAddress,
      usdcInfo.tokenAddress
    );
    await transferUSDC.waitForDeployment();

    // Step 2: Fund TransferUSDC.sol with LINK and deployer with USDC
    await fundWallet(linkInfo.tokenAddress, linkInfo.holderAddress, await transferUSDC.getAddress(), "100", 18); // Fund 100 LINK
    await fundWallet(usdcInfo.tokenAddress, usdcInfo.holderAddress, deployer.address, "100", 6); // Fund 100 USDC

    // Step 2: Allow the destination chain
    await transferUSDC.connect(deployer).allowlistDestinationChain(destinationRouterConfig.chainSelector, true);

    // Step 3: Set up token contracts and approvals
    const usdcContract = await hre.ethers.getContractAt("IERC20", usdcInfo.tokenAddress);
    await usdcContract.connect(deployer).approve(transferUSDC.getAddress(), amountToSend * 2n);
  });

  it("Should transfer USDC from TransferUSDC.sol to EOA on a different chain", async function () {
    // Step 3: Perform the USDC transfer on the source chain
    const transferTx = await transferUSDC.connect(deployer).transferUsdc(
      destinationRouterConfig.chainSelector,
      recipient.address,
      amountToSend,
      gasLimit
    );

    transactionReceipt = await transferTx.wait();
    gasUsed = transactionReceipt.gasUsed;

    expect(transactionReceipt.status).to.equal(1);
    console.log('--------------------------------');
    console.log(`Gas limit for transferUsdc tx: ${gasLimit}`);
    console.log(`Gas used for transferUsdc tx: ${gasUsed}`);

    adjGasLimit = (gasUsed * 110n) / 100n;
    const adjTransferTx = await transferUSDC.connect(deployer).transferUsdc(
      destinationRouterConfig.chainSelector,
      recipient.address,
      amountToSend,
      adjGasLimit
    );

    transactionReceipt = await adjTransferTx.wait();
    gasUsed = transactionReceipt.gasUsed;

    expect(transactionReceipt.status).to.equal(1);
    console.log('--------------------------------');
    console.log(`Adjusted gas limit for transferUsdc tx: ${adjGasLimit}`);
    console.log(`Gas used for adjusted transferUsdc tx: ${gasUsed}`);
  });
});
