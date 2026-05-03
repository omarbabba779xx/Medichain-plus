# Analyse de risques — méthode EBIOS Risk Manager

> Méthode ANSSI officielle, référentiel HDS critère 2, ISO 31000.

## Atelier 1 · Cadrage & socle de sécurité

### Missions et valeurs métier

| Valeur métier | Niveau | Impact si atteinte |
|---------------|:------:|--------------------|
| Confidentialité des DME | **Critique** | Violation RGPD, perte de confiance patient, condamnation pénale |
| Intégrité des ordonnances | **Critique** | Contre-indications, contrefaçon, décès |
| Disponibilité des consentements | Majeur | Blocage parcours de soins |
| Traçabilité des accès | Majeur | Perte de preuve, incapacité à répondre à réquisition |
| Ponctualité des remboursements | Modéré | Impact financier patient |

### Biens supports

| ID | Bien | Nature | Emplacement |
|----|------|--------|-------------|
| BS-01 | Ledger Hyperledger Fabric | Logiciel + données | Cluster K8s HDS |
| BS-02 | Smart contract MediChainInsurance | Code Solidity | Polygon Amoy / Mainnet |
| BS-03 | Registre de clés publiques | Données cryptographiques | Ledger Fabric |
| BS-04 | Bridge relayer Node.js | Processus | VM infogérée |
| BS-05 | Frontend SPA | Code JS/HTML | CDN edge (Cloudflare HDS) |
| BS-06 | Certificats X.509 Fabric-CA | PKI | HSM FIPS 140-2 L3 |
| BS-07 | Clés privées patients | Cryptographie | Wallet local patient |

## Atelier 2 · Sources de risque

| ID | Source de risque | Motivation | Niveau |
|----|-----------------|-----------|:------:|
| SR-01 | Cybercriminel ransomware | Extorsion | **Élevé** |
| SR-02 | État-nation (espionnage) | Collecte renseignement | Moyen |
| SR-03 | Employé malveillant | Vengeance, gain financier | **Élevé** |
| SR-04 | Script kiddie | Notoriété | Faible |
| SR-05 | Concurrent | Vol de PI | Moyen |
| SR-06 | Erreur humaine d'administration | Accidentelle | **Élevé** |

## Atelier 3 · Scénarios stratégiques

### Scénario SS-01 : Exfiltration massive de DME

- **Source** : SR-01 (cybercriminel)
- **Chemin** : Compromission admin K8s → dump CouchDB → ransomware double extorsion
- **Impact** : Amendes RGPD (4 % CA), préjudice réputationnel majeur
- **Niveau** : 🔴 Critique
- **Mesures** : chiffrement at-rest AES-GCM, segmentation réseau, MFA admin, EDR

### Scénario SS-02 : Usurpation d'identité médecin

- **Source** : SR-03 (insider)
- **Chemin** : Vol cert X.509 → émission ordonnances falsifiées → vente médicaments
- **Impact** : Mise en danger patients, poursuites pénales
- **Niveau** : 🔴 Critique
- **Mesures** : HSM pour clés privées, rotation certs, audit logs immuables, pinning MSP

### Scénario SS-03 : Altération smart contract

- **Source** : SR-01
- **Chemin** : Exploitation reentrancy ou access control → drain de trésorerie
- **Impact** : Perte financière directe, arrêt de service assurance
- **Niveau** : 🟠 Majeur
- **Mesures** : ReentrancyGuard, AccessControl, Pausable, audit externe, bug bounty, **monitoring on-chain**

### Scénario SS-04 : Déni de service oracle

- **Source** : SR-01
- **Chemin** : DoS sur Chainlink → blocage validation des claims
- **Impact** : Remboursements bloqués, pression médiatique
- **Niveau** : 🟡 Modéré
- **Mesures** : oracle redondant, circuit breaker, fallback manuel 48 h

### Scénario SS-05 : Fuite clé privée patient

- **Source** : SR-06 (patient lui-même — phishing)
- **Chemin** : Phishing → sign arbitraire → faux consentement → vente données
- **Impact** : Vie privée d'**un** patient
- **Niveau** : 🟡 Modéré (périmètre limité à 1 utilisateur)
- **Mesures** : éducation, wallet hardware encouragé, révocation one-click, session timeout

## Atelier 4 · Scénarios opérationnels (extrait)

| Scénario | Vecteur technique | Probabilité | Gravité | Risque |
|----------|------------------|:-----------:|:-------:|:------:|
| SS-01 → CouchDB exposé | Port 5984 ouvert | Moyen | Catastrophique | **Critique** |
| SS-02 → Cert X.509 en dur dans `.env` | Secrets git-commited | Faible | Critique | Majeur |
| SS-03 → reentrancy | Missing `nonReentrant` | Faible | Critique | Majeur |
| SS-04 → oracle timeout | Single oracle | Moyen | Majeur | Modéré |
| SS-05 → seed phrase | Pas de hardware wallet | Élevé | Modéré | Modéré |

## Atelier 5 · Plan de traitement

| Scénario | Traitement | Mesures clés | Échéance | Statut |
|----------|-----------|--------------|----------|:------:|
| SS-01 | **Réduire** | Chiffrement at-rest, segmentation, SOC 24/7 | T+3 mois | 🟡 |
| SS-02 | **Réduire** | HSM Fabric-CA, audit identity logs | T+6 mois | 🟡 |
| SS-03 | **Réduire** | Audit Trail of Bits + bug bounty Immunefi | T+9 mois | ⚪ |
| SS-04 | **Éviter** | Passage à oracle multi-provider | T+12 mois | ⚪ |
| SS-05 | **Transférer** | Assurance cyber Ø 5M€ | T+6 mois | ⚪ |

## Indicateurs de suivi (KPI)

- % de certificats stockés en HSM : objectif 100 % à T+6m
- Temps moyen de détection (MTTD) incident : < 15 min
- Temps moyen de résolution (MTTR) : < 4 h
- Nombre de failles critiques non corrigées > 30 j : **0**

---

_Révision annuelle obligatoire selon ANS HDS critère 2._
