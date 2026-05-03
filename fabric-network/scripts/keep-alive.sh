#!/bin/bash
# MediChain+ — Démarre le réseau Fabric dans Ubuntu WSL2
# Appeler ce script chaque fois que Docker s'arrête

NETWORK="/root/medichain-fabric"

# Démarrer dockerd si pas actif
if ! docker ps >/dev/null 2>&1; then
  echo "Démarrage du daemon Docker..."
  nohup dockerd > /tmp/dockerd.log 2>&1 &
  sleep 4
fi

# Démarrer le réseau Fabric
cd "$NETWORK"
docker compose up -d

echo ""
docker ps --format "table {{.Names}}\t{{.Status}}"
echo ""
echo "CouchDB UI: http://localhost:5984/_utils (admin/adminpw)"
