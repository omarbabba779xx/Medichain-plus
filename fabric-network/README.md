# MediChain+ · Hyperledger Fabric network

Local 3-org permissioned Fabric 2.5 network for development and end-to-end
testing of the MediChain+ chaincode.

## Topology

```
                        ┌──────────────┐
                        │  Orderer     │  :7050
                        │  (Solo/Raft) │
                        └──────┬───────┘
                               │
     ┌─────────────────────────┼─────────────────────────┐
     ▼                         ▼                         ▼
┌──────────┐              ┌──────────┐              ┌──────────┐
│ Hospital │  peer :7051  │ Lab      │  peer :8051  │ Pharmacy │  peer :9051
│ Org1MSP  │◀────────────▶│ Org2MSP  │◀────────────▶│ Org3MSP  │
│ ca :7054 │              │ ca :8054 │              │ ca :9054 │
└─────┬────┘              └─────┬────┘              └─────┬────┘
      │ CouchDB :5984           │ CouchDB :6984           │ CouchDB :7984
      └─────────────────────────┴─────────────────────────┘

Channel          : medichannel
Chaincode        : medical_records   (Go, CCaaS)
Endorsement      : majority of orgs
State DB         : CouchDB (rich queries for GetQueryResult)
```

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker | 20+ | Docker Desktop on Windows/Mac, Docker Engine on Linux |
| Docker Compose v2 | — | Plugin, not legacy `docker-compose` |
| Node.js | ≥ 18 | For the Node.js E2E harness |
| Go | ≥ 1.21 | For the chaincode |
| Fabric binaries (optional) | 2.5 | `cryptogen`, `configtxgen`, `peer` |

> On Windows, run everything from **WSL2** or **Git Bash**. The native Windows
> shell cannot build the chaincode image reliably.

## One-shot run

```bash
cd fabric-network/scripts
bash run-e2e.sh          # up → channel → chaincode → E2E → down
bash run-e2e.sh --keep   # leave network running for manual exploration
bash run-e2e.sh --mock   # skip Docker entirely
```

Expected output (mock or real):

```
▶ Running Node.js E2E flow
  → Patient registers her ECDSA P-256 public key ... OK
  → Doctor registers his ECDSA P-256 public key ... OK
  → Patient grants signed consent to Doctor ... OK
  → Forged consent by Eve is rejected ... OK
  → Doctor issues signed prescription ... OK
  → Pharmacy tries to issue prescription → rejected ... OK
  → Relayer forwards PrescriptionIssued → Polygon submitClaim ... OK (claimId=1, tx=0x91a2…)
  → Insurer validates claim → 85 % payout computed ... OK (payout=1275)
  → Pharmacy dispenses prescription ... OK
  → Non-pharmacy cannot dispense ... OK
  → Patient revokes her own consent → OK
  → Eve tries to revoke Salma's consent → blocked ... OK
✓ 12 passed, 0 failed
```

## Manual operation

### Start

```bash
docker compose -f docker-compose.yaml up -d
docker compose -f docker-compose.yaml ps
```

### Create channel

```bash
docker compose -f docker-compose.yaml exec cli \
  peer channel create -o orderer:7050 \
  -c medichannel -f /channel-artifacts/medichannel.tx \
  --tls --cafile /orderer-tls/ca.crt
```

### Deploy chaincode (CCaaS)

```bash
bash scripts/deploy-ccaas.sh
```

### Tail logs

```bash
docker compose -f docker-compose.yaml logs -f peer0.hospital.medichain.com
```

### Stop

```bash
docker compose -f docker-compose.yaml down --volumes
```

## Chaincode identity model

The chaincode binds every call to the Fabric X.509 certificate of the caller
via `ctx.GetClientIdentity()`. MSP IDs and `did` / `role` attributes from the
CA enrolment are the source of truth.

| Function | Required MSP | Identity derived |
|----------|-------------|------------------|
| `CreateRecord` | Org1MSP, Org2MSP | `issuerDID` from cert |
| `GrantConsent` | any MSP | `patientDID` from cert |
| `RevokeConsent` | any MSP | caller must equal `consent.patientDID` |
| `IssuePrescription` | Org1MSP (+ role=doctor) | `doctorDID` from cert |
| `DispensePrescription` | Org3MSP | `dispenserDID` logged in event |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Error: cannot connect to the Docker daemon` | Start Docker Desktop / `systemctl start docker` |
| `peer: orderer client connection refused` | Wait 5-10 s — orderer boot lag |
| `chaincode name not found` | Run `bash scripts/deploy-ccaas.sh` again |
| Port already in use | Another Fabric network is up; `docker compose down -v` |

## Resources

- Hyperledger Fabric docs: https://hyperledger-fabric.readthedocs.io/en/release-2.5/
- Chaincode as a service: https://hyperledger-fabric.readthedocs.io/en/release-2.5/cc_service.html
- MediChain+ bridge relayer: [`../bridge/README.md`](../bridge/README.md)
- E2E test source: [`../test/e2e/full-flow.mjs`](../test/e2e/full-flow.mjs)
