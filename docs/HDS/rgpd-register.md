# Registre des traitements — RGPD Art. 30

> Document obligatoire pour tout responsable de traitement de données à caractère personnel. Mis à jour à chaque évolution du SI.

## Identification

| Champ | Valeur |
|-------|--------|
| Responsable de traitement | MediChain+ SAS (en cours de création) |
| Représentant | Omar Babba |
| DPO | À désigner (obligation Art. 37 RGPD pour données santé) |
| Coordonnées | dpo@medichain.plus |
| Autorité de contrôle | CNIL (France) |

## Traitement T1 · Gestion du dossier médical électronique

| Item | Description |
|------|-------------|
| **Finalité** | Centralisation du parcours de soin entre hôpital, laboratoire, pharmacie |
| **Base légale** | Art. 6.1.c RGPD (obligation légale CSP) + Art. 9.2.h (soins médicaux) |
| **Catégories de données** | Identifiant patient (DID), hash données cliniques, consentements, événements IoT |
| **Données sensibles** | ✅ Données de santé (Art. 9 RGPD) |
| **Catégories de personnes concernées** | Patients, professionnels de santé |
| **Destinataires internes** | Org1 Hôpital, Org2 Labo, Org3 Pharmacie (Fabric MSP) |
| **Destinataires externes** | Organismes d'assurance (sur consentement) |
| **Transferts hors UE** | ❌ Aucun (Polygon Amoy décentralisé, nœuds choisis UE) |
| **Durée de conservation** | 20 ans après dernière consultation (CSP R.1112-7) |
| **Mesures de sécurité** | Cf. [`ebios-rm.md`](./ebios-rm.md), AES-256-GCM at-rest, TLS 1.3 in-flight, MFA admin |

## Traitement T2 · Gestion des consentements granulaires

| Item | Description |
|------|-------------|
| **Finalité** | Matérialisation du consentement explicite et révocable du patient |
| **Base légale** | Art. 6.1.a (consentement) + Art. 7 RGPD (traçabilité) |
| **Données** | DID patient, DID bénéficiaire, portée, date, signature ECDSA |
| **Durée** | Durée du consentement + 6 ans (preuve en cas de litige) |
| **Droits exercés** | Révocation immédiate (`RevokeConsent`), portabilité (`ReadRecord`) |

## Traitement T3 · Micro-assurance paramétrique DeFi

| Item | Description |
|------|-------------|
| **Finalité** | Remboursement automatisé 85 % de la prescription en USDC |
| **Base légale** | Art. 6.1.b RGPD (contrat d'assurance) |
| **Données** | Adresse wallet, hash diagnostic, montant |
| **Pseudonymisation** | ✅ Via DID, pas d'identité nominative on-chain |
| **Destinataires** | Assureur (contractuel), smart contract Polygon public |
| **Risque de ré-identification** | Évalué dans [`dpia.md`](./dpia.md) |

## Traitement T4 · Objets connectés (IoT)

| Item | Description |
|------|-------------|
| **Finalité** | Surveillance biomarqueurs (glycémie, tension) + alertes |
| **Base légale** | Art. 9.2.h RGPD (intérêt vital) |
| **Données** | Mesures biométriques, timestamp, signature capteur |
| **Rétention** | 10 ans puis anonymisation |
| **Sécurité** | MQTT over TLS, signature ECDSA au niveau capteur |

## Traitement T5 · Logs d'audit & journaux CI/CD

| Item | Description |
|------|-------------|
| **Finalité** | Sécurité, débogage, conformité HDS critère 9 |
| **Base légale** | Art. 6.1.f (intérêt légitime) |
| **Données** | IP, User-Agent, endpoint, statut HTTP, ID session |
| **Anonymisation** | IP tronquée à /24 après 30 jours |
| **Rétention** | 1 an |

## Droits des personnes concernées

| Droit | Mécanisme |
|-------|-----------|
| Accès (Art. 15) | `ReadRecord` par le patient lui-même |
| Rectification (Art. 16) | Procédure hors-chaîne via professionnel de santé (données on-chain immutables → nouvelle entrée corrective) |
| Effacement (Art. 17) | Révocation du consentement + rotation clé (données on-chain restent mais inexploitables) |
| Limitation (Art. 18) | `Pause` sur smart contract, désactivation compte Fabric |
| Portabilité (Art. 20) | Export JSON des records via chaincode, compatible FHIR R4 |
| Opposition (Art. 21) | `RevokeConsent` one-click |

### Délai de réponse

**1 mois** maximum (Art. 12.3 RGPD), extensible à 3 mois pour demandes complexes.

## Notification de violation

Procédure d'alerte CNIL sous **72 h** (Art. 33 RGPD) :

1. Détection via SOC / monitoring on-chain
2. Qualification équipe sécurité (CISO + DPO)
3. Si risque élevé → notification aux personnes concernées (Art. 34)
4. Documentation de l'incident (registre interne)

## Analyse d'impact (DPIA)

Obligatoire pour les données de santé à grande échelle. Voir [`dpia.md`](./dpia.md).

---

_Mis à jour : 2026-04-23. Prochaine révision : 2026-10-23._
