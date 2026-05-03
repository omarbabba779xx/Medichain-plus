// MediChainInsurance Tests — npx hardhat test
const { expect } = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

describe("MediChainInsurance", function () {
  let usdc, insurance, admin, insurer, oracle, patient, other;
  const AMOUNT   = ethers.parseUnits("100", 6);
  const TREASURY = ethers.parseUnits("10000", 6);

  beforeEach(async function () {
    [admin, insurer, oracle, patient, other] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    usdc = await Mock.deploy("USD Coin", "USDC", 6);
    await usdc.mint(admin.address, TREASURY);
    const Ins = await ethers.getContractFactory("MediChainInsurance");
    insurance = await Ins.deploy(await usdc.getAddress(), oracle.address, insurer.address);
    await usdc.transfer(await insurance.getAddress(), TREASURY);
  });

  it("Correct deployment", async () => {
    expect(await insurance.stablecoin()).to.equal(await usdc.getAddress());
    expect(await insurance.coveragePercent()).to.equal(85);
    expect(await insurance.treasuryBalance()).to.equal(TREASURY);
  });

  it("Constructor enforces role separation", async () => {
    const Ins = await ethers.getContractFactory("MediChainInsurance");
    await expect(Ins.deploy(await usdc.getAddress(), oracle.address, oracle.address))
      .to.be.revertedWith("oracle cannot be insurer");
    await expect(Ins.deploy(await usdc.getAddress(), admin.address, insurer.address))
      .to.be.revertedWith("admin cannot be oracle");
    await expect(Ins.deploy(await usdc.getAddress(), oracle.address, admin.address))
      .to.be.revertedWith("admin cannot be insurer");
  });

  it("Submit + validate + pay (85% coverage)", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("claim-1"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("diagnosis-xyz"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    const before = await usdc.balanceOf(patient.address);
    await expect(insurance.connect(oracle).validateAndPay(id, hash)).to.emit(insurance, "ClaimPaid");
    const after = await usdc.balanceOf(patient.address);
    expect(after - before).to.equal(AMOUNT * 85n / 100n);
    expect((await insurance.claims(id)).status).to.equal(2);
  });

  it("Coverage snapshot protects payout", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("snap-1"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("snap-dx"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await insurance.setCoverage(100);
    const before = await usdc.balanceOf(patient.address);
    await insurance.connect(oracle).validateAndPay(id, hash);
    expect((await usdc.balanceOf(patient.address)) - before).to.equal(AMOUNT * 85n / 100n);
  });

  it("Claim expires after claimExpiryDays", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("exp-1"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("exp-dx"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await time.increase(31 * 24 * 60 * 60);
    await expect(insurance.connect(oracle).validateAndPay(id, hash)).to.be.revertedWith("Claim expired");
  });

  it("Rejects incorrect proof hash", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("claim-2"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("real"));
    const bad  = ethers.keccak256(ethers.toUtf8Bytes("fake"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await expect(insurance.connect(oracle).validateAndPay(id, bad)).to.be.revertedWith("Hash mismatch");
  });

  it("Only ORACLE_ROLE can validate", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("claim-3"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("xyz"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await expect(insurance.connect(other).validateAndPay(id, hash)).to.be.reverted;
  });

  it("Only INSURER_ROLE can submit", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("acl-1"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("xyz"));
    await expect(insurance.connect(other).submitClaim(id, patient.address, hash, AMOUNT)).to.be.reverted;
  });

  it("Prevents double payment", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("claim-4"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("xyz"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await insurance.connect(oracle).validateAndPay(id, hash);
    await expect(insurance.connect(oracle).validateAndPay(id, hash)).to.be.revertedWith("Not pending");
  });

  it("Oracle can reject a pending claim", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("rej-1"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("rej-dx"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await expect(insurance.connect(oracle).rejectClaim(id, "Diagnosis not covered"))
      .to.emit(insurance, "ClaimRejected").withArgs(id, "Diagnosis not covered");
    expect((await insurance.claims(id)).status).to.equal(3);
  });

  it("Cannot reject an already-paid claim", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("rej-2"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("rej-dx2"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await insurance.connect(oracle).validateAndPay(id, hash);
    await expect(insurance.connect(oracle).rejectClaim(id, "too late")).to.be.revertedWith("Not pending");
  });

  it("Non-oracle cannot reject a claim", async () => {
    const id   = ethers.keccak256(ethers.toUtf8Bytes("rej-3"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("rej-dx3"));
    await insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT);
    await expect(insurance.connect(other).rejectClaim(id, "nope")).to.be.reverted;
  });

  it("Admin can adjust coverage percentage", async () => {
    await expect(insurance.setCoverage(100)).to.emit(insurance, "CoverageUpdated");
    expect(await insurance.coveragePercent()).to.equal(100);
    await expect(insurance.setCoverage(0)).to.be.revertedWith("coverage must be 1-100");
    await expect(insurance.setCoverage(101)).to.be.revertedWith("coverage must be 1-100");
  });

  it("Admin can adjust max claim amount", async () => {
    const newMax = ethers.parseUnits("1000", 6);
    await expect(insurance.setMaxClaimAmount(newMax)).to.emit(insurance, "MaxClaimUpdated");
    expect(await insurance.maxClaimAmount()).to.equal(newMax);
    await expect(insurance.setMaxClaimAmount(0)).to.be.revertedWith("max=0 would block all claims");
  });

  it("Claim above maxClaimAmount is rejected", async () => {
    const id      = ethers.keccak256(ethers.toUtf8Bytes("max-1"));
    const hash    = ethers.keccak256(ethers.toUtf8Bytes("max-dx"));
    const tooMuch = (await insurance.maxClaimAmount()) + 1n;
    await expect(insurance.connect(insurer).submitClaim(id, patient.address, hash, tooMuch))
      .to.be.revertedWith("bad amount");
  });

  it("Pause blocks new claims", async () => {
    await insurance.pause();
    const id   = ethers.keccak256(ethers.toUtf8Bytes("claim-5"));
    const hash = ethers.keccak256(ethers.toUtf8Bytes("xyz"));
    await expect(insurance.connect(insurer).submitClaim(id, patient.address, hash, AMOUNT)).to.be.reverted;
  });

  it("Admin can emergencyWithdraw funds", async () => {
    const amt    = ethers.parseUnits("500", 6);
    const before = await usdc.balanceOf(other.address);
    await expect(insurance.emergencyWithdraw(other.address, amt))
      .to.emit(insurance, "EmergencyWithdraw").withArgs(other.address, amt, admin.address);
    expect((await usdc.balanceOf(other.address)) - before).to.equal(amt);
  });

  it("emergencyWithdraw reverts on zero address", async () => {
    await expect(insurance.emergencyWithdraw(ethers.ZeroAddress, ethers.parseUnits("1", 6)))
      .to.be.revertedWith("to=0");
  });

  it("emergencyWithdraw reverts if amount exceeds treasury", async () => {
    await expect(insurance.emergencyWithdraw(other.address, TREASURY + ethers.parseUnits("1", 6)))
      .to.be.revertedWith("exceeds treasury balance");
  });

  it("emergencyWithdraw reverts when paused", async () => {
    await insurance.pause();
    await expect(insurance.emergencyWithdraw(other.address, ethers.parseUnits("1", 6))).to.be.reverted;
  });

  it("Only admin can emergencyWithdraw", async () => {
    await expect(insurance.connect(other).emergencyWithdraw(other.address, ethers.parseUnits("1", 6))).to.be.reverted;
  });

  it("Rejects accidental native token transfers", async () => {
    await expect(
      admin.sendTransaction({ to: await insurance.getAddress(), value: ethers.parseEther("1") })
    ).to.be.revertedWith("No native token accepted");
  });
});
