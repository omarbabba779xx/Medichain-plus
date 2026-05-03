# MediChain+ Bridge Relayer

Listens to **Hyperledger Fabric chaincode events** and forwards the relevant ones
to the **`MediChainInsurance`** smart contract deployed on **Polygon Amoy**.

## Event mapping

| Fabric event | Polygon action |
|--------------|----------------|
| `PrescriptionIssued` | `submitClaim(bytes32 diagnosisHash, uint256 amount)` |
| `PrescriptionDispensed` | `markDispensed(uint256 claimId)` |
| `RecordCreated` / `ConsentGranted` / `ConsentRevoked` | audit log only |

## Modes

### `mock` (default, used by CI)

Streams fixture events from `fixtures/events.jsonl` and calls mocked Polygon
functions that return fake tx hashes. No network required.

```bash
npm install
npm run mock
# or, one-shot for CI:
npm run once
```

### `real`

Connects to a real Fabric network and Polygon Amoy. Install optional deps
first:

```bash
npm install fabric-network fabric-ca-client
```

Required env vars:

```env
# Fabric
FABRIC_CONN_PROFILE=/path/to/connection-profile.json
WALLET_PATH=/path/to/wallet
USER_ID=admin                 # or user1, etc.
FABRIC_CHANNEL=medichannel    # optional, default: medichannel
CHAINCODE_NAME=medical_records

# Polygon
PRIVATE_KEY=0x...                                # relayer wallet with POL for gas
AMOY_RPC=https://rpc-amoy.polygon.technology     # optional
CONTRACT_ADDRESS=0x...                           # MediChainInsurance on Amoy
```

```bash
npm start
```

## Logs

Structured ISO timestamps + levels:

```
[2026-04-23 00:17:42] INFO  MediChain+ Relayer starting — mode=mock, once=true
[2026-04-23 00:17:42] INFO  ConsentGranted (audit only, no Polygon tx)
[2026-04-23 00:17:42] OK    submitClaim → tx=0xmock_18f... (mock)
[2026-04-23 00:17:42] INFO  relayer done — processed=3, errors=0
```

## Architecture

```
┌────────────────────┐        ┌──────────────────┐        ┌────────────────────┐
│ Hyperledger Fabric │ event  │ Bridge Relayer   │  tx    │ Polygon Amoy       │
│ chaincode          ├───────▶│ (this module)    ├───────▶│ MediChainInsurance │
└────────────────────┘        └──────────────────┘        └────────────────────┘
        ▲                              │
        │      register pubkey         │     audit log (stdout / ELK)
        │◀─────────────────────────────┘
```

## Extending

- Add new events : extend the `switch` block in `handleEvent`.
- Add ABI calls : append function signatures to `CONTRACT_ABI`.
- Persistent queue : replace the in-memory event queue by Redis / Kafka.
