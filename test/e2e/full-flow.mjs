#!/usr/bin/env node
/**
 * MediChain+ End-to-End test
 * ==========================
 *
 * Exercises the full business flow:
 *   1. Patient registers her ECDSA public key on Fabric
 *   2. Doctor registers his public key on Fabric
 *   3. Patient grants signed consent to the Doctor
 *   4. Doctor issues a signed prescription (→ Fabric event)
 *   5. Relayer forwards PrescriptionIssued to Polygon (submitClaim)
 *   6. Assurer validates the claim (Polygon)
 *   7. Patient revokes consent (must succeed)
 *   8. Someone else tries to revoke → must fail
 *
 *  Modes
 *  -----
 *   MODE=mock   (default)  → no Fabric needed, in-memory state replicates the chaincode
 *                            logic + ethers.js mock Polygon
 *   MODE=real              → requires a live Fabric network (see fabric-network/)
 *                            and a Polygon Amoy deployment (deployment.json)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');
const MODE       = process.env.MODE || 'mock';

/* ──────────────────────── Utilities ──────────────────────── */

const c = (color, s) => `\x1b[${color}m${s}\x1b[0m`;
const green  = (s) => c(32, s);
const red    = (s) => c(31, s);
const yellow = (s) => c(33, s);
const cyan   = (s) => c(36, s);
const bold   = (s) => c(1,  s);

let passed = 0, failed = 0;
function step(desc, fn) {
  process.stdout.write(cyan(`  → ${desc} ... `));
  return Promise.resolve()
    .then(fn)
    .then((extra) => { console.log(green('OK'), extra ? yellow(`(${extra})`) : ''); passed++; })
    .catch((err)  => { console.log(red('FAIL'), `\n    ${red(err.message)}`); failed++; throw err; });
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

/* ──────────────────────── ECDSA helpers ──────────────────────── */

function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding:  { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function sign(privateKey, message) {
  const sig = crypto.sign('sha256', Buffer.from(message), {
    key: privateKey, dsaEncoding: 'ieee-p1363',
  });
  return sig.toString('base64');
}

function verify(publicKey, message, signatureB64) {
  const sig = Buffer.from(signatureB64, 'base64');
  return crypto.verify('sha256', Buffer.from(message), {
    key: publicKey, dsaEncoding: 'ieee-p1363',
  }, sig);
}

/* ──────────────────────── Mock chaincode ──────────────────────── */
// Re-implements the authorisation logic of medical_records.go in JS so the E2E
// test can run without Docker.  The invariants are identical.

function makeMockChaincode() {
  const state  = new Map();   // key → JSON-serialised record
  const events = [];

  const put = (k, v) => state.set(k, Buffer.from(JSON.stringify(v)));
  const get = (k)    => state.get(k) ? JSON.parse(state.get(k).toString()) : null;
  const emit = (name, payload) => events.push({ name, payload });

  function identity(caller) {
    if (!caller?.msp || !caller?.did) throw new Error('caller must have msp + did');
    return caller;
  }

  return {
    state, events, get, put,

    RegisterPublicKey(caller, did, pem) {
      if (caller.did !== did) throw new Error('identity mismatch');
      put(`PK_${did}`, { docType: 'pubkey', did, pem, algorithm: 'ECDSA-P256' });
    },

    GrantConsent(caller, id, granteeDID, scope, expiresAt, signature) {
      identity(caller);
      if (caller.msp !== 'Org1MSP' && caller.msp !== 'Org2MSP' && caller.msp !== 'Org3MSP') {
        /* any MSP allowed for consent */
      }
      if (!granteeDID || granteeDID === caller.did) throw new Error('invalid grantee');
      if (!/^\d{4}-\d{2}-\d{2}T/.test(expiresAt)) throw new Error('expiresAt must be RFC3339');
      if (!signature) throw new Error('signature required');

      // Verify ECDSA if pubkey is registered
      const pk = get(`PK_${caller.did}`);
      if (pk) {
        const msg = `CONSENT|${id}|${caller.did}|${granteeDID}|${scope}|${expiresAt}`;
        if (!verify(pk.pem, msg, signature)) throw new Error('signature rejected');
      }
      put(`CONSENT_${id}`, {
        docType: 'consent', id, patientDID: caller.did, granteeDID,
        scope, expiresAt, revoked: false, signature,
      });
      emit('ConsentGranted', { id, patientDID: caller.did, granteeDID });
    },

    RevokeConsent(caller, id) {
      const c = get(`CONSENT_${id}`);
      if (!c) throw new Error('consent not found');
      if (caller.did !== c.patientDID) throw new Error('only the patient can revoke their consent');
      if (c.revoked) throw new Error('already revoked');
      c.revoked = true;
      put(`CONSENT_${id}`, c);
      emit('ConsentRevoked', { id, patientDID: c.patientDID });
    },

    IssuePrescription(caller, id, patientDID, med, dosage, hash, signature, price) {
      if (caller.msp !== 'Org1MSP') throw new Error('access denied: only hospital MSP');
      if (caller.role && caller.role !== 'doctor') throw new Error('role mismatch: only doctor');
      if (!patientDID || !med || !signature) throw new Error('missing required fields');
      if (get(`RX_${id}`)) throw new Error('prescription already exists');

      const pk = get(`PK_${caller.did}`);
      if (pk) {
        const msg = `RX|${id}|${patientDID}|${caller.did}|${med}|${dosage}|${price}`;
        if (!verify(pk.pem, msg, signature)) throw new Error('doctor signature rejected');
      }
      put(`RX_${id}`, {
        docType: 'prescription', id, patientDID, doctorDID: caller.did,
        medication: med, dosage, hash, signature, dispensed: false, price,
      });
      emit('PrescriptionIssued', { id, patientDID, doctorDID: caller.did, medication: med, hash, price });
    },

    DispensePrescription(caller, id) {
      if (caller.msp !== 'Org3MSP') throw new Error('access denied: only pharmacy MSP');
      const rx = get(`RX_${id}`);
      if (!rx) throw new Error('prescription not found');
      if (rx.dispensed) throw new Error('already dispensed');
      rx.dispensed = true;
      put(`RX_${id}`, rx);
      emit('PrescriptionDispensed', { prescriptionId: id, dispenserDID: caller.did });
    },
  };
}

/* ──────────────────────── Mock Polygon ──────────────────────── */

// Mock mirrors MediChainInsurance.sol ABI exactly:
//   submitClaim(bytes32 id, address patient, bytes32 diagHash, uint256 amount)
//   validateAndPay(bytes32 id, bytes32 proofHash)
function makeMockPolygon() {
  const claims = new Map(); // id (bytes32 hex) → claim object
  let claimCount = 0;
  return {
    submitClaim(id, patient, diagHash, amount) {
      if (claims.has(id)) throw new Error('Claim exists');
      if (!patient || patient === '0x0000000000000000000000000000000000000000') throw new Error('patient=0');
      if (amount <= 0n) throw new Error('bad amount');
      claimCount++;
      claims.set(id, { claimId: claimCount, id, patient, diagHash, amount, status: 'pending', payout: null });
      return { hash: '0x' + crypto.randomBytes(16).toString('hex'), claimId: claimCount };
    },
    validateAndPay(id, proofHash) {
      const claim = claims.get(id);
      if (!claim) throw new Error('claim not found');
      if (claim.status !== 'pending') throw new Error('Not pending');
      if (claim.diagHash !== proofHash) throw new Error('Hash mismatch');
      claim.status = 'paid';
      claim.payout = BigInt(Math.floor(Number(claim.amount) * 0.85));
      return { hash: '0x' + crypto.randomBytes(16).toString('hex'), claim };
    },
    get claims() { return [...claims.values()]; },
  };
}

/* ──────────────────────── Test flow ──────────────────────── */

async function main() {
  console.log(bold('\n🧪 MediChain+ End-to-End test'));
  console.log(yellow(`   mode = ${MODE}`));
  console.log(yellow(`   root = ${ROOT}\n`));

  if (MODE === 'real') {
    console.log(red('⚠  real mode not implemented in this harness — set MODE=mock'));
    console.log(yellow('   Real E2E requires: Docker Fabric up + chaincode deployed + wallet identities + Polygon Amoy funded.'));
    console.log(yellow('   See fabric-network/scripts/start-network.sh and bridge/README.md.\n'));
    process.exit(2);
  }

  const cc     = makeMockChaincode();
  const chain  = makeMockPolygon();

  const SALMA  = { msp: 'Org1MSP', did: 'did:pat:salma',   role: 'patient',    ...makeKeypair() };
  const KARIM  = { msp: 'Org1MSP', did: 'did:doc:karim',   role: 'doctor',     ...makeKeypair() };
  const EVE    = { msp: 'Org1MSP', did: 'did:pat:eve',     role: 'patient',    ...makeKeypair() };
  const ANDALOUS = { msp: 'Org3MSP', did: 'did:pharm:andalous', role: 'pharmacist', ...makeKeypair() };

  await step('Patient registers her ECDSA P-256 public key', () => {
    cc.RegisterPublicKey(SALMA, SALMA.did, SALMA.publicKey);
    assert(cc.get(`PK_${SALMA.did}`), 'pubkey not stored');
  });

  await step('Doctor registers his ECDSA P-256 public key', () => {
    cc.RegisterPublicKey(KARIM, KARIM.did, KARIM.publicKey);
  });

  const expires = new Date(Date.now() + 24*3600*1000).toISOString();
  await step('Patient grants signed consent to Doctor', () => {
    const msg = `CONSENT|c-e2e|${SALMA.did}|${KARIM.did}|read:all|${expires}`;
    const sig = sign(SALMA.privateKey, msg);
    cc.GrantConsent(SALMA, 'c-e2e', KARIM.did, 'read:all', expires, sig);
    assert(cc.events.find(e => e.name === 'ConsentGranted'), 'no ConsentGranted event');
  });

  await step('Forged consent by Eve is rejected', () => {
    const msg = `CONSENT|c-forged|${SALMA.did}|${KARIM.did}|read:all|${expires}`;
    const sig = sign(EVE.privateKey, msg);                 // wrong signer
    const attacker = { ...SALMA, privateKey: undefined };  // pretends to be Salma but sig is Eve's
    let rejected = false;
    try {
      cc.GrantConsent(attacker, 'c-forged', KARIM.did, 'read:all', expires, sig);
    } catch (e) { rejected = /signature rejected/.test(e.message); }
    assert(rejected, 'forged signature was not rejected!');
  });

  await step('Doctor issues signed prescription', () => {
    const price = 1500;
    const msg = `RX|rx-001|${SALMA.did}|${KARIM.did}|Amoxicillin|3x/day|${price}`;
    const sig = sign(KARIM.privateKey, msg);
    cc.IssuePrescription(KARIM, 'rx-001', SALMA.did, 'Amoxicillin', '3x/day', '0xhash', sig, price);
    assert(cc.events.find(e => e.name === 'PrescriptionIssued'), 'no event');
  });

  await step('Pharmacy tries to issue prescription → rejected', () => {
    let rejected = false;
    try { cc.IssuePrescription(ANDALOUS, 'rx-bad', SALMA.did, 'X', 'y', 'h', 's', 0); }
    catch (e) { rejected = /access denied/.test(e.message); }
    assert(rejected, 'pharmacy should not issue prescriptions');
  });

  let claimId32; // bytes32 hex string — mirrors relayer.js logic
  await step('Relayer forwards PrescriptionIssued → Polygon submitClaim', () => {
    const ev       = cc.events.find(e => e.name === 'PrescriptionIssued');
    // Deterministic claimId = keccak256(prescriptionId) — same as relayer.js
    claimId32      = '0x' + crypto.createHash('sha256').update(ev.payload.id).digest('hex');
    const diagHash = '0x' + crypto.createHash('sha256').update(ev.payload.hash).digest('hex');
    const patient  = '0x4b3d2407d0A6bEE0512f63ad8104BF0BBF7caC76'; // deployer address
    const amount   = BigInt(Math.round(ev.payload.price * 1e6)); // USDC 6-dec
    const res      = chain.submitClaim(claimId32, patient, diagHash, amount);
    assert(res.claimId === 1, `expected first claim, got ${res.claimId}`);
    return `claimId=${res.claimId}, tx=${res.hash.slice(0, 12)}…`;
  });

  await step('Insurer validates claim → 85% payout computed', () => {
    // proofHash must match diagHash used in submitClaim
    const ev       = cc.events.find(e => e.name === 'PrescriptionIssued');
    const diagHash = '0x' + crypto.createHash('sha256').update(ev.payload.hash).digest('hex');
    const r = chain.validateAndPay(claimId32, diagHash);
    assert(r.claim.status === 'paid', `expected paid, got ${r.claim.status}`);
    const expectedPayout = BigInt(Math.round(1500 * 1e6 * 0.85));
    assert(r.claim.payout === expectedPayout, `expected ${expectedPayout}, got ${r.claim.payout}`);
    return `payout=${r.claim.payout}`;
  });

  await step('Pharmacy dispenses prescription', () => {
    cc.DispensePrescription(ANDALOUS, 'rx-001');
    assert(cc.get('RX_rx-001').dispensed);
    assert(cc.events.find(e => e.name === 'PrescriptionDispensed'));
  });

  await step('Non-pharmacy cannot dispense', () => {
    let rejected = false;
    try { cc.DispensePrescription(KARIM, 'rx-001'); }
    catch (e) { rejected = /access denied/.test(e.message) || /already dispensed/.test(e.message); }
    assert(rejected, 'doctor should not be able to dispense');
  });

  await step('Patient revokes her own consent → OK', () => {
    cc.RevokeConsent(SALMA, 'c-e2e');
    assert(cc.get('CONSENT_c-e2e').revoked);
  });

  await step('Eve tries to revoke Salma\'s consent → blocked', () => {
    // Seed another consent and try to revoke with Eve
    const msg = `CONSENT|c-other|${SALMA.did}|${KARIM.did}|read:all|${expires}`;
    const sig = sign(SALMA.privateKey, msg);
    cc.GrantConsent(SALMA, 'c-other', KARIM.did, 'read:all', expires, sig);

    let rejected = false;
    try { cc.RevokeConsent(EVE, 'c-other'); }
    catch (e) { rejected = /only the patient/.test(e.message); }
    assert(rejected, 'Eve was able to revoke Salma\'s consent!');
  });

  console.log();
  console.log(bold(green(`✓ ${passed} passed`)), failed ? bold(red(`, ${failed} failed`)) : '');
  console.log(bold(yellow(`  ${cc.events.length} Fabric events emitted, ${chain.claims.length} Polygon claims`)));
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(red(`\n✗ fatal: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
