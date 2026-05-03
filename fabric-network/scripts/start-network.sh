#!/bin/bash
# MediChain+ — Démarrage réseau Hyperledger Fabric 2.5
# Fonctionne sur Windows (WSL2 + Docker Desktop)
set -e

FABRIC_VERSION=2.5.6
CA_VERSION=1.5.7
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(dirname "$SCRIPT_DIR")"

cd "$NETWORK_DIR"

echo "═══════════════════════════════════════════════════"
echo "  MediChain+ — Réseau Hyperledger Fabric 2.5"
echo "═══════════════════════════════════════════════════"

# 1. Pull des images Docker
echo ""
echo "[1/4] Téléchargement des images Fabric..."
docker pull hyperledger/fabric-tools:${FABRIC_VERSION}
docker pull hyperledger/fabric-peer:${FABRIC_VERSION}
docker pull hyperledger/fabric-orderer:${FABRIC_VERSION}
docker pull hyperledger/fabric-ca:${CA_VERSION}
docker pull couchdb:3.3.3
echo "  ✓ Images prêtes"

# 2. Nettoyage anciens certificats
echo ""
echo "[2/4] Génération des identités cryptographiques..."
rm -rf ./crypto-config/ordererOrganizations
rm -rf ./crypto-config/peerOrganizations

# Utiliser le conteneur fabric-tools pour générer les certificats
# (pas besoin d'installer des binaires Linux sur Windows)
docker run --rm \
  -v "$(pwd):/fabric" \
  -w /fabric \
  hyperledger/fabric-tools:${FABRIC_VERSION} \
  cryptogen generate \
    --config=./crypto-config.yaml \
    --output=./crypto-config

echo "  ✓ Certificats générés dans ./crypto-config/"

# 3. Démarrage du réseau
echo ""
echo "[3/4] Démarrage des conteneurs Docker..."
docker compose down --volumes 2>/dev/null || true
docker compose up -d

echo ""
echo "[4/4] Vérification du réseau..."
sleep 5
docker compose ps

echo ""
echo "═══════════════════════════════════════════════════"
echo "  RÉSEAU MEDICHAIN+ DÉMARRÉ ✓"
echo "═══════════════════════════════════════════════════"
echo "  Orderer  : localhost:7050"
echo "  Hôpital  : localhost:7051  (CouchDB: :5984)"
echo "  Pharmacie: localhost:9051  (CouchDB: :5985)"
echo "  CA Hôp.  : localhost:7054"
echo "  CA Pharm.: localhost:8054"
echo ""
echo "  CouchDB UI Hôpital  : http://localhost:5984/_utils"
echo "  CouchDB UI Pharmacie: http://localhost:5985/_utils"
echo "═══════════════════════════════════════════════════"
