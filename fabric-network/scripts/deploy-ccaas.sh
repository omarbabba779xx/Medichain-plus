#!/bin/bash
# =============================================================================
#  MediChain — Déploiement ccaas complet (une seule session WSL2)
#  Usage : bash /root/medichain-fabric/scripts/deploy-ccaas.sh
# =============================================================================
set -e
FABRIC_DIR=/root/medichain-fabric
CC_DIR=/root/medichain-chaincode

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   MediChain ccaas — déploiement chaincode complet   ║"
echo "╚══════════════════════════════════════════════════════╝"

# ── 1. dockerd ──────────────────────────────────────────────────────────────
echo ""
echo "── [1/10] Démarrage dockerd ──"
if ! pgrep dockerd > /dev/null; then
    nohup dockerd > /tmp/dockerd.log 2>&1 &
    echo "dockerd démarré (PID $!)"
    sleep 8
fi
docker info > /dev/null && echo "Docker OK ✓"

# ── 2. Réseau Fabric ────────────────────────────────────────────────────────
echo ""
echo "── [2/10] Démarrage réseau Fabric ──"
cd $FABRIC_DIR
docker compose up -d
sleep 12

# Noms des containers (détection dynamique)
HOSP_PEER=$(docker ps --format "{{.Names}}" | grep "peer0.hospital")
PHAR_PEER=$(docker ps --format "{{.Names}}" | grep "peer0.pharmacy")
ORDERER=$(docker ps  --format "{{.Names}}" | grep "orderer.medichain")
echo "Hospital peer : $HOSP_PEER"
echo "Pharmacy peer : $PHAR_PEER"
echo "Orderer       : $ORDERER"

# ── 3. Canal — création orderer (toujours) + join peers ─────────────────────
echo ""
echo "── [3/10] Canal orderer + peers (idempotent) ──"

# Copier genesis block dans les peer containers
docker cp $FABRIC_DIR/channel-artifacts/genesis.block ${HOSP_PEER}:/tmp/genesis.block
docker cp $FABRIC_DIR/channel-artifacts/genesis.block ${PHAR_PEER}:/tmp/genesis.block

# TOUJOURS créer le canal sur l'orderer via fabric-tools (idempotent : 405 si déjà là)
echo "  → osnadmin channel join (orderer)..."
docker run --rm \
    --network medichain_network \
    -v $FABRIC_DIR/crypto-config:/crypto-config \
    -v $FABRIC_DIR/channel-artifacts:/channel-artifacts \
    hyperledger/fabric-tools:2.5.6 \
    osnadmin channel join \
        --channelID medichain-channel \
        --config-block /channel-artifacts/genesis.block \
        -o orderer.medichain.com:7053 \
        --ca-file  /crypto-config/ordererOrganizations/medichain.com/orderers/orderer.medichain.com/tls/ca.crt \
        --client-cert /crypto-config/ordererOrganizations/medichain.com/users/Admin@medichain.com/tls/client.crt \
        --client-key  /crypto-config/ordererOrganizations/medichain.com/users/Admin@medichain.com/tls/client.key \
    && echo "  Orderer : canal créé ✓" \
    || echo "  Orderer : canal déjà présent (405 ignoré) ✓"

sleep 5

# Copier les MSPs admin dans les peer containers
docker cp $FABRIC_DIR/crypto-config/peerOrganizations/hospital.medichain.com/users/Admin@hospital.medichain.com/msp \
    ${HOSP_PEER}:/tmp/admin-msp-h
docker cp $FABRIC_DIR/crypto-config/peerOrganizations/pharmacy.medichain.com/users/Admin@pharmacy.medichain.com/msp \
    ${PHAR_PEER}:/tmp/admin-msp-p

# TOUJOURS rejoindre les peers (idempotent : "ledger already exists" ignoré)
echo "  → Hospital peer channel join..."
docker exec -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp-h \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    ${HOSP_PEER} peer channel join -b /tmp/genesis.block \
    && echo "  Hospital : rejoint ✓" \
    || echo "  Hospital : déjà joint ✓"

echo "  → Pharmacy peer channel join..."
docker exec -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp-p \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_LOCALMSPID=PharmacyMSP \
    ${PHAR_PEER} peer channel join -b /tmp/genesis.block \
    && echo "  Pharmacy : rejoint ✓" \
    || echo "  Pharmacy : déjà joint ✓"

sleep 5

# ── 4. Build image chaincode ─────────────────────────────────────────────────
echo ""
echo "── [4/10] Build image Docker du chaincode (WE build it, not Fabric) ──"
docker build -t dev-medichain-chaincode:1.0 $CC_DIR/
echo "Image dev-medichain-chaincode:1.0 construite ✓"

# ── 5. Package ccaas ─────────────────────────────────────────────────────────
echo ""
echo "── [5/10] Création du package ccaas ──"
rm -rf /tmp/ccaas-pkg && mkdir -p /tmp/ccaas-pkg

# connection.json : adresse du serveur chaincode dans le réseau Docker
cat > /tmp/ccaas-pkg/connection.json << 'CONNEOF'
{
  "address": "chaincode-medichain:7052",
  "dial_timeout": "10s",
  "tls_required": false
}
CONNEOF

# code.tar.gz contient uniquement connection.json
cd /tmp/ccaas-pkg
tar czf code.tar.gz connection.json

# metadata.json : type ccaas
cat > /tmp/ccaas-pkg/metadata.json << 'METAEOF'
{
  "type": "ccaas",
  "label": "medichain_1.0"
}
METAEOF

# Package final
tar czf /tmp/medichain_ccaas.tar.gz metadata.json code.tar.gz
echo "Package ccaas créé : $(wc -c < /tmp/medichain_ccaas.tar.gz) octets"

# ── 6. Calcul du package ID (déterministe = SHA256 du .tar.gz) ───────────────
PKG_HASH=$(sha256sum /tmp/medichain_ccaas.tar.gz | awk '{print $1}')
CHAINCODE_ID="medichain_1.0:${PKG_HASH}"
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  CHAINCODE_ID = ${CHAINCODE_ID}"
echo "╚══════════════════════════════════════════════════════════════════════╝"

# ── 7. Démarrage du container chaincode ─────────────────────────────────────
echo ""
echo "── [6/10] Démarrage du serveur gRPC chaincode ──"
docker stop chaincode-medichain 2>/dev/null || true
docker rm   chaincode-medichain 2>/dev/null || true
docker run -d \
    --name chaincode-medichain \
    --network medichain_network \
    -e CHAINCODE_ID="${CHAINCODE_ID}" \
    -e CHAINCODE_SERVER_ADDRESS="0.0.0.0:7052" \
    dev-medichain-chaincode:1.0
echo "Container chaincode-medichain démarré ✓"
sleep 3

# ── 8. Installation ccaas sur les deux peers (PAS DE BUILD DOCKER!) ──────────
echo ""
echo "── [7/10] Installation ccaas sur les deux peers ──"

# Copier package + certs orderer dans les containers
docker cp /tmp/medichain_ccaas.tar.gz ${HOSP_PEER}:/tmp/medichain.tar.gz
docker cp /tmp/medichain_ccaas.tar.gz ${PHAR_PEER}:/tmp/medichain.tar.gz

ORDERER_CA=$FABRIC_DIR/crypto-config/ordererOrganizations/medichain.com/orderers/orderer.medichain.com/tls/ca.crt
docker cp $ORDERER_CA ${HOSP_PEER}:/tmp/orderer-ca.crt
docker cp $ORDERER_CA ${PHAR_PEER}:/tmp/orderer-ca.crt

# MSPs admin
docker cp $FABRIC_DIR/crypto-config/peerOrganizations/hospital.medichain.com/users/Admin@hospital.medichain.com/msp \
    ${HOSP_PEER}:/tmp/admin-msp
docker cp $FABRIC_DIR/crypto-config/peerOrganizations/pharmacy.medichain.com/users/Admin@pharmacy.medichain.com/msp \
    ${PHAR_PEER}:/tmp/admin-msp

echo "  → Install Hospital..."
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    ${HOSP_PEER} \
    peer lifecycle chaincode install /tmp/medichain.tar.gz
echo "  Hospital ✓"

echo "  → Install Pharmacy..."
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=PharmacyMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    ${PHAR_PEER} \
    peer lifecycle chaincode install /tmp/medichain.tar.gz
echo "  Pharmacy ✓"

# Vérifier l'installation
echo ""
echo "Chaincode installé sur Hospital :"
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    ${HOSP_PEER} \
    peer lifecycle chaincode queryinstalled 2>&1

# ── 9. Approbation par les deux orgs ─────────────────────────────────────────
echo ""
echo "── [8/10] Approbation du chaincode ──"

echo "  → Approve HospitalMSP..."
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_ADDRESS=peer0.hospital.medichain.com:7051 \
    ${HOSP_PEER} \
    peer lifecycle chaincode approveformyorg \
        --channelID medichain-channel \
        --name medichain \
        --version 1.0 \
        --package-id "${CHAINCODE_ID}" \
        --sequence 1 \
        -o orderer.medichain.com:7050 --tls \
        --cafile /tmp/orderer-ca.crt \
        --waitForEvent=false
echo "  HospitalMSP ✓"

sleep 5

echo "  → Approve PharmacyMSP..."
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=PharmacyMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_ADDRESS=peer0.pharmacy.medichain.com:9051 \
    ${PHAR_PEER} \
    peer lifecycle chaincode approveformyorg \
        --channelID medichain-channel \
        --name medichain \
        --version 1.0 \
        --package-id "${CHAINCODE_ID}" \
        --sequence 1 \
        -o orderer.medichain.com:7050 --tls \
        --cafile /tmp/orderer-ca.crt \
        --waitForEvent=false
echo "  PharmacyMSP ✓"

sleep 8

# Vérifier la readiness
echo ""
echo "CheckCommitReadiness :"
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    ${HOSP_PEER} \
    peer lifecycle chaincode checkcommitreadiness \
        --channelID medichain-channel \
        --name medichain \
        --version 1.0 \
        --sequence 1 \
        --output json 2>&1 || true

# ── 10. Commit ───────────────────────────────────────────────────────────────
echo ""
echo "── [9/10] Commit du chaincode ──"
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_ADDRESS=peer0.hospital.medichain.com:7051 \
    ${HOSP_PEER} \
    peer lifecycle chaincode commit \
        --channelID medichain-channel \
        --name medichain \
        --version 1.0 \
        --sequence 1 \
        -o orderer.medichain.com:7050 --tls \
        --cafile /tmp/orderer-ca.crt \
        --peerAddresses peer0.hospital.medichain.com:7051 \
        --peerAddresses peer0.pharmacy.medichain.com:9051
echo "Commit ✓"

sleep 3

# ── 11. Tests fonctionnels ───────────────────────────────────────────────────
echo ""
echo "── [10/10] Tests fonctionnels ──"

echo "  → IssuePrescription (RX001)..."
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_ADDRESS=peer0.hospital.medichain.com:7051 \
    ${HOSP_PEER} \
    peer chaincode invoke \
        -C medichain-channel -n medichain \
        -o orderer.medichain.com:7050 --tls \
        --cafile /tmp/orderer-ca.crt \
        --peerAddresses peer0.hospital.medichain.com:7051 \
        --peerAddresses peer0.pharmacy.medichain.com:9051 \
        -c '{"function":"IssuePrescription","Args":["RX001","PAT001","DOC001","Amoxicillin","500mg"]}' \
        --waitForEvent
echo "  IssuePrescription ✓"

sleep 3

echo "  → GetPrescription (RX001)..."
docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    -e CORE_PEER_LOCALMSPID=HospitalMSP \
    -e CORE_PEER_TLS_ENABLED=false \
    -e CORE_PEER_ADDRESS=peer0.hospital.medichain.com:7051 \
    ${HOSP_PEER} \
    peer chaincode query \
        -C medichain-channel -n medichain \
        -c '{"function":"GetPrescription","Args":["RX001"]}'
echo ""
echo "  GetPrescription ✓"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          ✅  DÉPLOIEMENT 20/20 TERMINÉ !            ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Chaincode medichain déployé sur medichain-channel  ║"
echo "║  Hospital + Pharmacy MSP approuvés et committé      ║"
echo "║  Prescription RX001 créée et lue avec succès        ║"
echo "╚══════════════════════════════════════════════════════╝"
