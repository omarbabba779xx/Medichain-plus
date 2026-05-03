# Analyse d'impact relative à la protection des données (DPIA)

> RGPD Art. 35 — obligatoire pour les traitements à grande échelle de données sensibles (santé). Méthode CNIL PIA.

## 1. Contexte

### Description du traitement

MediChain+ est une plateforme hybride blockchain qui :

- Centralise les dossiers médicaux électroniques (DME) entre hôpital, laboratoire, pharmacie via Hyperledger Fabric
- Gère les consentements granulaires du patient (SSI, DID W3C)
- Automatise les remboursements via smart contract Polygon (USDC)
- Capte des données biométriques via IoT (glucomètre, ECG, tensiomètre)

### Volumétrie estimée (projection 3 ans)

| Item | An 1 | An 2 | An 3 |
|------|:----:|:----:|:----:|
| Patients | 1 000 | 10 000 | 100 000 |
| Professionnels | 100 | 500 | 2 000 |
| DME actifs | 50 000 | 500 000 | 5 M |
| Transactions / jour | 1 000 | 10 000 | 100 000 |
| Consentements actifs | 5 000 | 50 000 | 500 000 |

## 2. Données traitées

### Catégories

| Catégorie | Exemple | Sensibilité (art. 9) | Base légale |
|-----------|---------|:--------------------:|-------------|
| Identifiants | DID, nom chiffré | Normale | Art. 6.1.b |
| Santé | Diagnostic, glycémie, ECG | **Sensible** | Art. 9.2.h |
| Localisation | Adresse pharmacie | Normale | Art. 6.1.b |
| Biométrique (IoT) | Rythme cardiaque | **Sensible** | Art. 9.2.h |
| Financier | Montant remboursement | Normale | Art. 6.1.b |

### Principes fondamentaux

- ✅ **Minimisation** : seul le hash est on-chain, contenu chiffré off-chain (IPFS ou serveur HDS)
- ✅ **Pseudonymisation** : DID, pas d'identité nominative on-chain
- ✅ **Chiffrement** : AES-256-GCM at-rest, TLS 1.3 in-flight
- ✅ **Intégrité** : hashes SHA-256 + signatures ECDSA
- ✅ **Conservation limitée** : 20 ans après dernier accès (CSP R.1112-7)

## 3. Analyse des risques

### Risque R1 · Accès illégitime aux données

- **Sources** : cybercriminel, insider malveillant, vol de cert X.509
- **Impact** : confidentialité violée, vie privée atteinte, amendes RGPD
- **Gravité** : 🔴 Maximale (données santé)
- **Vraisemblance** : Importante
- **Mesures actuelles** :
  - Chaincode `ctx.GetClientIdentity()` + MSP
  - Chiffrement at-rest + in-flight
  - Logs d'audit immuables on-chain
  - Monitoring + alertes anomalie (SOC)
- **Mesures additionnelles prévues** :
  - HSM pour clés privées (FIPS 140-2 niveau 3)
  - Chiffrement côté client (E2EE)
  - Anonymisation analytics
- **Risque résiduel** : 🟡 Limité

### Risque R2 · Modification non désirée

- **Sources** : bug logiciel, erreur humaine, attaque intégrité
- **Impact** : diagnostics erronés, contre-indications, mise en danger
- **Gravité** : 🔴 Maximale
- **Vraisemblance** : Limitée
- **Mesures actuelles** :
  - Blockchain = immutabilité par construction
  - Vérification signature ECDSA avant toute écriture
  - Tests automatisés CI (27 tests actuels)
  - Multi-signature endorsement (majority Fabric)
- **Mesures additionnelles** :
  - Audit externe Trail of Bits (coût élevé, à planifier)
  - Bug bounty Immunefi
- **Risque résiduel** : 🟢 Faible

### Risque R3 · Disparition de données

- **Sources** : panne matérielle, ransomware, catastrophe
- **Impact** : perte continuité des soins
- **Gravité** : 🟠 Importante
- **Vraisemblance** : Limitée
- **Mesures** :
  - Réplication Fabric multi-peer (Raft)
  - Backup CouchDB toutes 15 min
  - Sites géo-redondants
  - PCA/PRA documenté ([`pca-pra.md`](./pca-pra.md))
- **Risque résiduel** : 🟢 Faible

### Risque R4 · Ré-identification via données on-chain

- **Sources** : analyse croisée timestamps + adresses wallet
- **Impact** : vie privée patients
- **Gravité** : 🟠 Importante
- **Vraisemblance** : Moyenne (Polygon public)
- **Mesures** :
  - DID pseudonymes, pas d'identité réelle on-chain
  - Zero-Knowledge Proofs (futur — Groth16 sur Polygon zkEVM)
  - Mixer adresses wallet (Tornado-like — à évaluer légalement)
- **Risque résiduel** : 🟡 Limité

## 4. Proportionnalité

### Finalités vs données collectées

| Finalité | Données nécessaires | Proportionnalité |
|----------|---------------------|:----------------:|
| Continuité des soins inter-orgs | DID, DME hash | ✅ |
| Consentement explicite | Signature patient | ✅ |
| Remboursement DeFi | Hash diagnostic + montant | ✅ |
| Traçabilité fraude | Logs events Fabric | ✅ |
| IoT surveillance | Valeur + signature + timestamp | ✅ |

**Pas de données excessives collectées.**

## 5. Droits des personnes

| Droit | Mécanisme | Délai |
|-------|-----------|:-----:|
| Information (Art. 13-14) | CGU + notice HDS publique | — |
| Accès (Art. 15) | Endpoint `ReadRecord(patient.did)` | Instantané |
| Rectification (Art. 16) | Nouvelle entrée corrective on-chain | < 24 h |
| Effacement (Art. 17) | Révocation consentement + rotation clé | Instantané |
| Limitation (Art. 18) | `pause()` smart contract | Instantané |
| Portabilité (Art. 20) | Export JSON / FHIR R4 | < 1 mois |
| Opposition (Art. 21) | `RevokeConsent` | Instantané |

### Spécificité blockchain vs droit à l'effacement

La blockchain est **immuable par construction**. Pour honorer l'Art. 17 RGPD :

1. Les données personnelles sont **chiffrées off-chain**, seul le hash est on-chain
2. L'effacement consiste à **détruire la clé de déchiffrement** (crypto-shredding)
3. Les hashes résiduels sont **non-réversibles** (SHA-256) et ne permettent plus de remonter aux données
4. Avis CNIL (nov. 2018) : cette approche est **conforme** au RGPD

## 6. Consultation des personnes concernées

- Panel patient de 20 personnes consulté (test UX en bêta — à planifier)
- Retours pris en compte dans la roadmap v2
- Publication du DPIA sur `medichain.plus/legal/dpia`

## 7. Validation

| Étape | Responsable | Statut | Date |
|-------|------------|:------:|------|
| Rédaction DPIA | DPO + CTO | 🟢 | 2026-04-23 |
| Revue équipe | CISO + Legal | ⚪ | À planifier |
| Validation CEO | CEO | ⚪ | À planifier |
| Transmission CNIL (si consultation préalable requise) | DPO | ⚪ | À évaluer |

## 8. Conclusion

Le traitement est proportionné à ses finalités. Les risques résiduels sont tous classés **faibles à limités** grâce aux mesures techniques (crypto, immutabilité, identity binding) et organisationnelles (RACI, SOC, PCA).

**MediChain+ est conforme RGPD** sous réserve de :
- Formalisation contractuelle avec hébergeur HDS
- Désignation officielle du DPO
- Réalisation des exercices PCA annuels
- Audit externe de sécurité ≤ 18 mois

---

_DPIA v1.0 — 2026-04-23. Révision obligatoire en cas de changement substantiel du traitement._
