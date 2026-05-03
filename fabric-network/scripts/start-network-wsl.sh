#!/bin/bash
# MediChain+ — Démarrage réseau Hyperledger Fabric via Ubuntu WSL2
# Utilise Docker Engine natif dans Ubuntu (pas Docker Desktop)
set -e

FABRIC_VERSION=2.5.6
CA_VERSION=1.5.7

# Chemin WSL vers le dossier fabric-network
NETWORK_DIR="/root/medichain-fabric"
cd "$NETWORK_DIR"

echo "═══════════════════════════════════════════════════"
echo "  MediChain+ — Réseau Hyperledger Fabric 2.5"
echo "  (via Ubuntu WSL2 + Docker Engine)"
echo "═══════════════════════════════════════════════════"

# 1. Vérifier que Docker daemon tourne
echo ""
echo "[0/4] Démarrage du daemon Docker..."
if ! docker ps >/dev/null 2>&1; then
  service docker start 2>/dev/null || dockerd > /tmp/dockerd.log 2>&1 &
  sleep 3
  docker ps >/dev/null 2>&1 || { echo "ERREUR: Docker daemon ne démarre pas"; exit 1; }
fi
echo "  ✓ Docker daemon actif"

# 2. Pull des images
echo ""
echo "[1/4] Téléchargement des images Fabric..."
docker pull hyperledger/fabric-tools:${FABRIC_VERSION}
docker pull hyperledger/fabric-peer:${FABRIC_VERSION}
docker pull hyperledger/fabric-orderer:${FABRIC_VERSION}
docker pull hyperledger/fabric-ca:${CA_VERSION}
docker pull couchdb:3.3.3
echo "  ✓ Images prêtes"

# 3. Génération des certificats via fabric-tools
echo ""
echo "[2/4] Génération des identités cryptographiques..."
rm -rf ./crypto-config/ordererOrganizations ./crypto-config/peerOrganizations

docker run --rm \
  -v "${NETWORK_DIR}:/fabric" \
  -w /fabric \
  hyperledger/fabric-tools:${FABRIC_VERSION} \
  cryptogen generate \
    --config=./crypto-config.yaml \
    --output=./crypto-config

echo "  ✓ Certificats générés"

# 4. Démarrage du réseau
echo ""
echo "[3/4] Démarrage des conteneurs..."
docker compose down --volumes 2>/dev/null || true
docker compose up -d

echo ""
echo "[4/4] Statut du réseau..."
sleep 5
docker compose ps

echo ""
echo "═══════════════════════════════════════════════════"
echo "  RÉSEAU MEDICHAIN+ DÉMARRÉ ✓"
echo "═══════════════════════════════════════════════════"
echo "  Orderer  : localhost:7050"
echo "  Hôpital  : localhost:7051  | CouchDB: :5984"
echo "  Pharmacie: localhost:9051  | CouchDB: :5985"
echo "  CA Hôp.  : localhost:7054"
echo "  CA Pharm.: localhost:8054"
echo ""
echo "  CouchDB UI: http://localhost:5984/_utils"
echo "═══════════════════════════════════════════════════"
