# Data Protection Impact Assessment (DPIA)
## MediChain+ Article 35 GDPR / HDS Compliance

**Version:** 1.0
**Date:** 2026-05-02
**Status:** Draft - requires DPO sign-off before production
**Reference:** GDPR Art. 35, CNIL guidelines, French HDS decree (art. L.1111-8 CSP)

---

## 1. Project Overview

MediChain+ is a parametric micro-insurance platform that automates USDC payouts on
verified pharmaceutical prescriptions, combining:

- A Hyperledger Fabric 2.5 permissioned blockchain (HospitalMSP + PharmacyMSP)
- A Solidity smart contract (MediChainInsurance.sol) on Polygon Amoy
- A Node.js bridge relayer connecting Fabric events to the Polygon contract

---

## 2. Personal Data Inventory

| Data Category | Field | Location | Legal Basis | Retention |
|---|---|---|---|---|
| Patient identifier | patientId (opaque UUID) | Fabric ledger | Consent + contract (Art. 6.1.b/a) | Care duration + 10 years (HDS) |
| Prescription data | medication, dosage, doctorId | Fabric ledger | Medical necessity (Art. 9.2.h) | 10 years (Art. L.1111-7 CSP) |
| Ethereum address | patientAddress | Fabric events, Polygon tx | Contract performance | Duration of insurance |
| Diagnosis hash | diagnosisHash (keccak256) | Polygon blockchain | Contract performance | Permanent (immutable ledger) |
| Claim amount | amount (USDC micro-units) | Fabric + Polygon | Contract performance | Permanent (immutable ledger) |

### 2.1 Special Category Data (Art. 9 GDPR)

Prescription and diagnosis data constitute **health data** under Art. 9 GDPR, requiring:
- HDS (Hebergeur de Donnees de Sante) certification for all hosting infrastructure
- Explicit patient consent or Art. 9.2.h exemption (medical treatment)
- DPO notification and this DPIA

---

## 3. Risk Assessment

### 3.1 PHI on Shared Immutable Ledger -- HIGH

- **Threat:** Node compromise or rogue org admin exposes health data replicated to all peers
- **Controls applied:** Opaque patient UUIDs; keccak256 diagnosis hashes (not raw PHI); channel isolation
- **Recommended:** Private Data Collections for medication/dosage fields; field-level encryption

### 3.2 Ethereum Address Linkability -- MEDIUM

- **Threat:** Blockchain analytics links insurance claims to individual patients
- **Controls applied:** Bridge validates address format before submission
- **Recommended:** Stealth addresses or Polygon ID for on-chain privacy

### 3.3 Immutability vs. Right to Erasure (Art. 17 GDPR) -- HIGH

- **Threat:** Blockchain data cannot be deleted; Art. 17 grants right to erasure
- **Controls applied:** Only hashed/opaque identifiers on-chain; raw PHI never written to ledger
- **Recommended:** DPO legal opinion on Art. 17.3.c medical necessity exemption

### 3.4 Smart Contract Vulnerability -- MEDIUM (post-audit)

All pre-audit critical vulnerabilities (reentrancy, missing access control, role confusion)
have been remediated in version 1.1. See docs/AUDIT.md for the full finding list.

---

## 4. Data Subject Rights

| Right | Feasibility | Implementation |
|---|---|---|
| Access (Art. 15) | Yes | Off-chain registry + getClaim() view function |
| Rectification (Art. 16) | Partial | Off-chain data correctable; on-chain hashes immutable |
| Erasure (Art. 17) | Limited | Exempt under Art. 17.3.c; raw data never on-chain |
| Portability (Art. 20) | Yes | JSON export from Fabric off-chain storage |
| Restriction (Art. 18) | Yes | Pause mechanism in contract; Fabric channel admin |
| Objection (Art. 21) | Yes | Consent withdrawal workflow |

---

## 5. Measures to Mitigate Risks

| Measure | Status |
|---|---|
| HDS-certified infrastructure for Fabric nodes | Required before production |
| Private Data Collections for PHI fields | Recommended |
| Field-level encryption of identifiable fields | Recommended |
| Smart contract audit (completed) | Done -- v1.1 |
| Penetration testing of Fabric network | Required before production |
| DPO appointment | Required |
| Privacy policy for patients | Required before production |
| Data breach response procedure | Required before production |

---

## 6. DPO Consultation Required

This DPIA must be reviewed and signed by the DPO before any production deployment.

Required sign-offs:
- [ ] Risk acceptance for immutable ledger with hashed health data
- [ ] Legal basis for erasure exemption (Art. 17.3.c)
- [ ] HDS hosting provider selection and certification
- [ ] Production deployment authorization

---

*Prepared in accordance with CNIL DPIA guidelines and EDPB recommendations.
Does not constitute legal advice.*
