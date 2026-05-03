// Déploiement MediChain+ sur Polygon Amoy testnet
// Usage : npx hardhat run scripts/deploy.js --network amoy
const { ethers, network } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("═══════════════════════════════════════════");
  console.log("  MediChain+ — Déploiement Smart Contract  ");
  console.log("═══════════════════════════════════════════");
  console.log("Réseau     :", network.name);
  console.log("Déployeur  :", deployer.address);
  console.log("Solde      :", ethers.formatEther(balance), "MATIC");
  console.log("───────────────────────────────────────────");

  if (balance === 0n) {
    throw new Error("Solde insuffisant. Obtenez du MATIC sur https://faucet.polygon.technology/");
  }

  // 1) Deploy Mock USDC
  console.log("\n[1/3] Déploiement MockUSDC...");
  const Mock = await ethers.getContractFactory("MockERC20");
  const usdc = await Mock.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("✓ MockUSDC     :", usdcAddress);

  // 2) Deploy MediChainInsurance
  console.log("\n[2/3] Déploiement MediChainInsurance...");
  const Ins = await ethers.getContractFactory("MediChainInsurance");
  const insurance = await Ins.deploy(
    usdcAddress,
    deployer.address, // oracle
    deployer.address  // insurer
  );
  await insurance.waitForDeployment();
  const insuranceAddress = await insurance.getAddress();
  console.log("✓ Insurance    :", insuranceAddress);

  // 3) Fund treasury with mock USDC
  console.log("\n[3/3] Alimentation trésorerie (10 000 USDC)...");
  const TREASURY = ethers.parseUnits("10000", 6);
  await usdc.mint(deployer.address, TREASURY);
  await usdc.transfer(insuranceAddress, TREASURY);
  console.log("✓ Trésorerie   : 10 000 USDC approvisionnés");

  // Save deployment info
  const deployInfo = {
    network:     network.name,
    chainId:     (await ethers.provider.getNetwork()).chainId.toString(),
    deployer:    deployer.address,
    MockUSDC:    usdcAddress,
    Insurance:   insuranceAddress,
    deployedAt:  new Date().toISOString(),
    explorer:    `https://amoy.polygonscan.com/address/${insuranceAddress}`,
  };

  fs.writeFileSync("deployment.json", JSON.stringify(deployInfo, null, 2));

  console.log("\n═══════════════════════════════════════════");
  console.log("  DÉPLOIEMENT RÉUSSI ✓");
  console.log("═══════════════════════════════════════════");
  console.log("MockUSDC    :", usdcAddress);
  console.log("Insurance   :", insuranceAddress);
  console.log("Explorer    :", deployInfo.explorer);
  console.log("───────────────────────────────────────────");
  console.log("Fichier deployment.json créé.");
}

main().catch((err) => { console.error(err); process.exit(1); });
