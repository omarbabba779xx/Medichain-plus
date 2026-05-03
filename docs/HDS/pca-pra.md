# Plan de Continuité d'Activité (PCA) & Plan de Reprise (PRA)

> Référentiel HDS critère 11 · ISO 22301 · méthode MEHARI BIA

## Analyse d'impact métier (BIA)

### Objectifs de reprise

| Indicateur | Définition | Cible MediChain+ |
|-----------|-----------|:---------------:|
| **RTO** (Recovery Time Objective) | Délai max d'interruption acceptable | **4 h** pour prod critique |
| **RPO** (Recovery Point Objective) | Perte de données max acceptable | **15 min** |
| **MTD** (Maximum Tolerable Downtime) | Au-delà = impact inacceptable | **24 h** |
| **MBCO** (Minimum Business Continuity Objective) | Service dégradé minimum | Consultation read-only DME |

### Classement des processus

| Processus | Criticité | RTO | RPO |
|-----------|:---------:|:---:|:---:|
| Lecture DME (ReadRecord) | **Vitale** | 1 h | 0 (replica) |
| Émission ordonnance (IssuePrescription) | **Critique** | 4 h | 15 min |
| Consentement (Grant/Revoke) | **Critique** | 4 h | 15 min |
| Remboursement Polygon | Majeur | 24 h | 1 h |
| Dashboard analytics | Modéré | 72 h | 24 h |
| Landing page publique | Faible | 1 semaine | 1 semaine |

## Menaces couvertes

1. Panne matérielle (serveur, disque, SAN)
2. Indisponibilité datacenter (incendie, inondation, coupure électrique)
3. Cyber-attaque (ransomware, DDoS, exploit 0-day)
4. Erreur humaine (suppression accidentelle, mauvaise config)
5. Perte de fournisseur critique (hébergeur, Chainlink, Polygon)
6. Catastrophe naturelle régionale
7. Pandémie / indisponibilité personnel

## Architecture multi-site

```
               ┌────────────────────────────────┐
               │   GSLB  ·  Cloudflare / Route53 │
               └────┬──────────────────┬────────┘
                    ▼                  ▼
        ┌────────────────┐   ┌────────────────┐
        │  Site PRIMARY  │   │  Site SECOND.  │
        │  OVH Gravelines│   │  OVH Strasbourg│
        │  (HDS cert.)   │   │  (HDS cert.)   │
        │                │   │                │
        │  Peer orgs 1-3 │◀─▶│  Peer orgs 1-3 │
        │  Orderer active│   │  Orderer stby  │
        │  CouchDB RW    │   │  CouchDB RO    │
        │  Bridge active │   │  Bridge warm   │
        └────────────────┘   └────────────────┘
           RPO = 15 min (sync Raft)
           RTO = 4 h (manual failover)
```

## Stratégie de sauvegarde

| Quoi | Fréquence | Rétention | Emplacement | Chiffrement |
|------|:---------:|:---------:|-------------|:-----------:|
| Ledger Fabric | Temps réel (Raft) | ∞ | Pair HA + replica site 2 | AES-256 |
| CouchDB state | Snapshot 15 min | 30 jours | S3 HDS-compatible | AES-256 + KMS |
| Configurations (configtx, MSP) | À chaque changement | 7 ans | Git privé + S3 versionné | GPG |
| Secrets (HSM backup) | Quotidien chiffré | 7 ans | Coffre physique bancaire | AES-256-HSM |
| Logs audit | Temps réel | 7 ans | SIEM + cold storage immutable | AES-256 |

## Procédures de reprise

### PR-01 : Bascule orderer site 1 → site 2

**RTO cible : 10 min**

1. Alerte Prometheus / Grafana (orderer unhealthy > 60 s)
2. PagerDuty → astreinte N1 notifiée
3. Vérification télémétrique (pas de split-brain)
4. Promotion orderer standby → leader (Raft auto)
5. Mise à jour GSLB (TTL 60 s)
6. Notification équipes + post-mortem sous 48 h

### PR-02 : Reconstruction peer après corruption CouchDB

**RTO cible : 2 h**

1. Identification peer corrompu (log analysis)
2. Isolation du peer (retrait du channel)
3. Restauration snapshot CouchDB le plus récent (RPO 15 min)
4. Resynchronisation ledger depuis orderer
5. Tests d'intégrité (hashes, queries)
6. Réintégration progressive (traffic 10 % → 100 %)

### PR-03 : Smart contract Polygon compromis

**RTO cible : 1 h**

1. Appel `pause()` immédiat via multisig admin
2. Communication publique (Twitter + bandeau UI)
3. Analyse incident (Etherscan, Tenderly)
4. Déploiement contrat v2 corrigé + migration état
5. `unpause()` progressif
6. Bug bounty post-incident

### PR-04 : Cyber-attaque majeure (ransomware)

**RTO cible : 24 h**

1. **Isolate** — coupure réseau externe
2. **Eradicate** — wipe + réinstall OS + restore clean
3. **Restore** — ledger depuis backup J-1
4. **Recover** — redémarrage services par étapes
5. **Report** — CNIL sous 72 h + ANSSI + procès-verbal
6. **Review** — post-mortem + mise à jour PCA

## Tests et exercices

| Exercice | Fréquence | Dernier | Prochain |
|----------|:---------:|:-------:|:--------:|
| Test restore backup ledger | Mensuel | À planifier | — |
| Bascule site 2 (failover) | Trimestriel | À planifier | — |
| Exercice ransomware (tabletop) | Semestriel | À planifier | — |
| Test pause smart contract | Mensuel | À planifier | — |
| Audit PCA externe | Annuel | À planifier | — |

## Chaîne de commandement (BCP)

| Rôle | Responsable | Backup |
|------|------------|--------|
| **CEO** | Omar Babba | Direction opérationnelle |
| **Crisis Manager** | CISO | CTO |
| **Communication** | RP/Comm | CMO |
| **Technique** | CTO | Lead DevOps |
| **Juridique** | DPO | Avocat externe |
| **Pôle patients** | Support health | 2ᵉ niveau |

## Indicateurs de performance du PCA

- Temps moyen de bascule : objectif **< 4 h**
- Taux de succès des exercices : objectif **> 95 %**
- Nombre d'incidents avec dépassement RTO : objectif **0**
- Couverture documentaire : objectif **100 %**

---

_Plan revu annuellement (ou après chaque incident majeur). Dernière révision : 2026-04-23._
