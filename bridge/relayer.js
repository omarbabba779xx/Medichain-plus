#!/usr/bin/env node
// MediChain+ Bridge Relayer
// Fixes: CRITICAL-06 (requireField), HIGH-08 (withRetry + cursor)

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const args = process.argv.slice(2);
const getFlag = (k, def = null) => {
  const p = args.find(a => a.startsWith("--" + k + "="));
  return p ? p.split("=").slice(1).join("=") : (args.includes("--" + k) ? true : def);
};

const MODE        = getFlag("mode", process.env.RELAYER_MODE || "mock");
const ONCE        = Boolean(getFlag("once", false));
const CURSOR_FILE = getFlag("cursor", process.env.CURSOR_FILE
  || path.join(__dirname, ".relayer-cursor.json"));
// Adresse ETH fallback si patientAddress absent de l'événement Fabric
// (ex: chaincode medical_records.go n'inclut pas encore ce champ)
const DEFAULT_PATIENT_ADDRESS = process.env.BRIDGE_DEFAULT_PATIENT_ADDRESS || null;

const pad = (s, n) => String(s).padEnd(n);
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = {
  info:  (msg, extra) => console.log("[" + now() + "] " + pad("INFO",  5) + " " + msg + " " + (extra||"")),
  warn:  (msg, extra) => console.warn("[" + now() + "] " + pad("WARN",  5) + " " + msg + " " + (extra||"")),
  error: (msg, extra) => console.error("[" + now() + "] " + pad("ERROR", 5) + " " + msg + " " + (extra||"")),
  ok:    (msg, extra) => console.log("[" + now() + "] " + pad("OK",    5) + " " + msg + " " + (extra||"")),
};

log.info("MediChain+ Relayer starting -- mode=" + MODE + ", once=" + ONCE);

// CRITICAL-06: requireField throws on missing/zero values
function requireField(value, name, ev) {
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  if (value === undefined || value === null || value === "" ||
      value === ZERO_ADDR || value === 0 || value === 0n) {
    throw new Error(
      "Missing required field \"" + name + "\" in " + ev.name + " event -- payload: " + JSON.stringify(ev.payload)
    );
  }
  return value;
}

// HIGH-08: exponential back-off retry
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS  = 500;

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        log.warn(label + " failed (attempt " + attempt + "/" + RETRY_ATTEMPTS + "), retry in " + delay + "ms: " + err.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new Error(label + " failed after " + RETRY_ATTEMPTS + " attempts: " + lastErr.message);
}

// HIGH-08: persistent block cursor
function loadCursor() {
  try {
    if (fs.existsSync(CURSOR_FILE)) {
      const data = JSON.parse(fs.readFileSync(CURSOR_FILE, "utf8"));
      if (typeof data.lastBlock === "number") {
        log.info("cursor loaded: lastBlock=" + data.lastBlock);
        return data.lastBlock;
      }
    }
  } catch (e) { log.warn("cursor load failed (" + e.message + "), starting from 0"); }
  return 0;
}

function saveCursor(blockNum) {
  try {
    fs.writeFileSync(CURSOR_FILE,
      JSON.stringify({ lastBlock: blockNum, updatedAt: new Date().toISOString() }));
  } catch (e) { log.warn("cursor save failed: " + e.message); }
}

const CONTRACT_ABI = [
  "function submitClaim(bytes32 id, address patient, bytes32 diagHash, uint256 amount) external",
  "function validateAndPay(bytes32 id, bytes32 proofHash) external",
  "function rejectClaim(bytes32 id, string calldata reason) external",
  "function getClaim(bytes32 id) external view returns (tuple(address patient, bytes32 diagnosisHash, uint256 amount, uint256 timestamp, uint256 deadline, uint256 coverageAtSubmission, uint8 status))",
  "function treasuryBalance() external view returns (uint256)",
  "event ClaimSubmitted(bytes32 indexed id, address indexed patient, uint256 amount)",
  "event ClaimPaid(bytes32 indexed id, address indexed patient, uint256 payout)",
  "event ClaimRejected(bytes32 indexed id, string reason)",
];

async function makePolygonClient() {
  if (MODE !== "real") {
    return {
      mode: "mock",
      submitClaim: async (id, patient, diagHash, amount) => ({
        hash: "0x" + Buffer.from(id.slice(2, 18)).toString("hex").padEnd(64,"0").slice(0,10) + Date.now().toString(16),
        mock: true, id, patient, diagHash, amount,
      }),
      validateAndPay: async (id, proofHash) => ({
        hash: "0xpay_" + Date.now().toString(16), mock: true, id, proofHash,
      }),
    };
  }
  const rpc      = process.env.AMOY_RPC || "https://rpc-amoy.polygon.technology";
  const pk       = process.env.PRIVATE_KEY;
  const contract = process.env.CONTRACT_ADDRESS;
  if (!pk || !contract) throw new Error("real mode requires PRIVATE_KEY and CONTRACT_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet   = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, provider);
  const c        = new ethers.Contract(contract, CONTRACT_ABI, wallet);
  log.info("connected to Polygon Amoy as " + wallet.address + ", contract=" + contract);

  return {
    mode: "real",
    submitClaim: async (id, patient, diagHash, amount) => {
      const tx = await withRetry(() => c.submitClaim(id, patient, diagHash, amount), "submitClaim");
      const r  = await tx.wait();
      return { hash: tx.hash, blockNumber: r.blockNumber };
    },
    validateAndPay: async (id, proofHash) => {
      const tx = await withRetry(() => c.validateAndPay(id, proofHash), "validateAndPay");
      const r  = await tx.wait();
      return { hash: tx.hash, blockNumber: r.blockNumber };
    },
  };
}

async function makeFabricEventSource() {
  if (MODE !== "real") {
    const fixtures = path.join(__dirname, "fixtures", "events.jsonl");
    if (!fs.existsSync(fixtures)) throw new Error("mock fixtures not found at " + fixtures);
    const lines = fs.readFileSync(fixtures, "utf8")
      .split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
    return async function* mockEvents() {
      for (const ev of lines) {
        yield ev;
        if (!ONCE) await new Promise(r => setTimeout(r, 300));
      }
    };
  }

  let fabricNetwork;
  try { fabricNetwork = await import("fabric-network"); }
  catch (e) { throw new Error("fabric-network not installed; run npm install fabric-network"); }

  const profilePath = process.env.FABRIC_CONN_PROFILE;
  const walletPath  = process.env.WALLET_PATH;
  const userId      = process.env.USER_ID       || "admin";
  const channel     = process.env.FABRIC_CHANNEL || "medichain-channel";
  const ccName      = process.env.CHAINCODE_NAME || "medichain";
  const startBlock  = loadCursor();

  if (!profilePath || !walletPath)
    throw new Error("real mode needs FABRIC_CONN_PROFILE and WALLET_PATH");

  const ccp     = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  const wallet  = await fabricNetwork.Wallets.newFileSystemWallet(walletPath);
  const gateway = new fabricNetwork.Gateway();
  await gateway.connect(ccp, { wallet, identity: userId, discovery: { enabled: true, asLocalhost: false } });
  const net      = await gateway.getNetwork(channel);
  const contract = net.getContract(ccName);
  log.info("Fabric connected: channel=" + channel + ", cc=" + ccName + ", startBlock=" + startBlock);

  return async function* fabricEvents() {
    const queue = [];
    await contract.addContractListener(async (event) => {
      queue.push({
        name: event.eventName,
        payload: JSON.parse(Buffer.from(event.payload).toString("utf8")),
        blockNum: Number(event.getBlockNumber?.() ?? 0),
        txId: event.getTransactionEvent?.()?.transactionId,
      });
    }, { startBlock });
    while (true) {
      if (queue.length > 0) {
        const ev = queue.shift();
        yield ev;
        if (ev.blockNum) saveCursor(ev.blockNum);
      } else {
        await new Promise(r => setTimeout(r, 250));
      }
      if (ONCE && queue.length === 0) break;
    }
  };
}

async function handleEvent(ev, polygon) {
  switch (ev.name) {
    case "PrescriptionIssued": {
      const p = ev.payload || {};
      // CRITICAL-06: requireField -- no silent fallback
      const prescriptionId = requireField(p.prescriptionId || p.rxId,  "prescriptionId/rxId", ev);
      // patientAddress peut être absent si le chaincode n'émet que patientDID (non-ETH).
      // Utiliser BRIDGE_DEFAULT_PATIENT_ADDRESS en fallback ou rejeter.
      const rawPatientAddr = p.patientAddress || p.ethAddress || DEFAULT_PATIENT_ADDRESS;
      if (!rawPatientAddr) {
        throw new Error(
          "PrescriptionIssued: patientAddress absent et BRIDGE_DEFAULT_PATIENT_ADDRESS non défini." +
          " Mettre à jour le chaincode pour inclure l'adresse ETH dans l'événement, " +
          " ou définir BRIDGE_DEFAULT_PATIENT_ADDRESS dans .env."
        );
      }
      if (rawPatientAddr === DEFAULT_PATIENT_ADDRESS && DEFAULT_PATIENT_ADDRESS) {
        log.warn("PrescriptionIssued: patientAddress manquant dans l'événement, utilisation du fallback BRIDGE_DEFAULT_PATIENT_ADDRESS");
      }
      const patientAddress = rawPatientAddr;
      const diagnosisHash  = requireField(p.diagnosisHash  || p.hash,  "diagnosisHash/hash",   ev);
      const amount         = requireField(p.amount         || p.price, "amount/price",          ev);
      const claimId   = ethers.id(prescriptionId);
      const diagHash  = ethers.id(diagnosisHash);
      const amountBig = BigInt(amount);
      const r = await polygon.submitClaim(claimId, patientAddress, diagHash, amountBig);
      log.ok("submitClaim(id=" + claimId.slice(0,10) + "..., patient=" + patientAddress.slice(0,8) + "..., amount=" + amountBig + ") -> tx=" + r.hash + (r.mock ? " (mock)" : ""));
      return { mapped: "submitClaim", claimId, ...r };
    }
    case "PrescriptionDispensed": {
      const p = ev.payload || {};
      const prescriptionId = requireField(p.prescriptionId || p.rxId, "prescriptionId/rxId", ev);
      const diagnosisHash  = requireField(p.diagnosisHash  || p.hash, "diagnosisHash/hash",  ev);
      const claimId   = ethers.id(prescriptionId);
      const proofHash = ethers.id(diagnosisHash);
      const r = await polygon.validateAndPay(claimId, proofHash);
      log.ok("validateAndPay(id=" + claimId.slice(0,10) + "...) -> tx=" + r.hash + (r.mock ? " (mock)" : ""));
      return { mapped: "validateAndPay", claimId, ...r };
    }
    case "RecordCreated":
    case "ConsentGranted":
    case "ConsentRevoked":
      log.info(ev.name + " (audit only, no Polygon tx)");
      return { mapped: "audit-only" };
    default:
      log.warn("unknown event: " + ev.name);
      return { mapped: "skip" };
  }
}

(async () => {
  try {
    const polygon  = await makePolygonClient();
    const srcMaker = await makeFabricEventSource();
    const stream   = srcMaker();
    let count = 0, errors = 0;
    for await (const ev of stream) {
      try {
        await handleEvent(ev, polygon);
        count++;
      } catch (err) {
        errors++;
        log.error("failed to handle " + ev.name + ": " + err.message);
      }
      if (ONCE && count >= 3) break;
    }
    log.info("relayer done -- processed=" + count + ", errors=" + errors);
    process.exit(errors > 0 ? 1 : 0);
  } catch (err) {
    log.error("fatal: " + err.message);
    console.error(err);
    process.exit(1);
  }
})();
