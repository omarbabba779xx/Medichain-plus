# Matrice RACI — MediChain+

> **R**esponsible · **A**ccountable · **C**onsulted · **I**nformed — ISO 27001 A.6.1.1

## Organigramme simplifié

```
                        ┌───────────────┐
                        │  CEO / Board  │
                        └───────┬───────┘
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌───────────┐    ┌───────────┐  ┌────────────┐
        │    CTO    │    │   CISO    │  │    DPO     │
        └─────┬─────┘    └─────┬─────┘  └─────┬──────┘
              │                │              │
      ┌───────┴──────┐    ┌────┴─────┐        │
      ▼              ▼    ▼          ▼        ▼
   Dev Lead    DevOps   SOC     Crypto   Legal Team
```

## Rôles

| Code | Rôle | Charge |
|------|------|--------|
| CEO | Chief Executive Officer | Direction générale, risque stratégique |
| CTO | Chief Technology Officer | Architecture, choix technologiques |
| **CISO** | Chief Information Security Officer | Sécurité globale, PSSI, incidents |
| **DPO** | Data Protection Officer | RGPD, relations CNIL |
| **Dev** | Lead Développeur | Code smart contract, chaincode, frontend |
| **DevOps** | Ingénieur DevOps | CI/CD, infrastructure, monitoring |
| **SOC** | Security Operations Center | Détection, réponse incident |
| **Crypto** | Cryptographe | PKI, HSM, protocoles |
| **Legal** | Équipe juridique | Contrats, audits externes |
| **Support** | Équipe support N1/N2 | Tickets, escalade |

## Matrice principale

| Activité | CEO | CTO | CISO | DPO | Dev | DevOps | SOC | Crypto | Legal | Support |
|----------|:---:|:---:|:----:|:---:|:---:|:------:|:---:|:------:|:-----:|:-------:|
| **Gouvernance** |
| Politique SSI | A | C | **R** | C | I | I | I | I | C | I |
| Conformité RGPD | A | C | C | **R** | I | I | I | I | C | I |
| Certification HDS | A | C | **R** | C | I | C | I | C | C | I |
| **Développement** |
| Spec fonctionnelle | I | A | C | C | **R** | I | I | I | I | C |
| Review code | I | **R** | C | I | R | I | I | C | I | I |
| Audit code smart contract | A | C | **R** | I | R | I | I | C | C | I |
| Review cryptographie | I | C | A | I | C | I | I | **R** | I | I |
| **Déploiement** |
| Deploy testnet Amoy | I | **R** | I | I | R | R | I | I | I | I |
| Deploy mainnet | A | **R** | C | C | C | R | I | C | C | I |
| Déploiement Fabric prod | A | **R** | C | I | C | R | I | C | I | I |
| Rotation de certificats | I | C | **R** | I | I | R | I | **R** | I | I |
| **Opérations** |
| Monitoring 24/7 | I | I | A | I | I | R | **R** | I | I | I |
| Astreinte P1 | I | C | A | I | R | **R** | R | I | I | R |
| Sauvegardes | I | A | C | I | I | **R** | I | I | I | I |
| Test PRA/PCA | A | C | **R** | I | I | R | C | I | I | I |
| **Sécurité** |
| Détection incidents | I | I | A | I | I | C | **R** | I | I | I |
| Réponse incident P1 | I | C | **R** | C | R | R | R | C | C | I |
| Forensic post-incident | I | I | **R** | C | C | C | R | C | C | I |
| Bug bounty management | A | C | **R** | I | R | I | C | I | C | I |
| **RGPD** |
| Droit d'accès patient | I | I | C | **R** | I | I | I | I | I | R |
| Droit à l'effacement | I | I | C | **R** | R | C | I | I | C | I |
| Notification CNIL (72h) | A | I | C | **R** | I | I | C | I | C | I |
| DPIA | I | I | C | **R** | C | I | I | C | C | I |
| **Audit** |
| Audit interne | I | I | **R** | C | I | I | C | I | I | I |
| Audit externe (HDS) | A | C | **R** | C | C | C | C | C | C | I |
| Audit smart contract | A | C | **R** | I | R | I | I | C | C | I |
| Slither/Mythril CI | I | I | A | I | **R** | R | C | C | I | I |

**Légende** : R = Responsable (fait) · A = Accountable (rend compte) · C = Consulté · I = Informé

## Règles d'engagement

### Escalade des incidents

| Niveau | Critère | Escalade |
|--------|---------|----------|
| **N1** | Demande utilisateur standard | Support → résolution ou N2 |
| **N2** | Bug bloquant sans impact sécurité | Dev + DevOps |
| **N3** | Impact sécurité/performance prod | + CISO/CTO |
| **N4** | Fuite de données, compromission | + DPO, CEO, Legal |

### Quorum pour décisions critiques

- Déploiement mainnet : **CEO + CTO + CISO** (multisig 2/3 technique)
- Rotation MSP Fabric : **CISO + Crypto** (4-eyes)
- Appel `pause()` smart contract : **CISO seul** (urgence) + notification CEO sous 1 h
- Négociation rançon : **Interdit** — politique stricte

### Communication de crise

- **J+0 h** : notification interne (Slack #incident)
- **J+1 h** : point d'étape aux parties prenantes
- **J+24 h** : notification partenaires B2B
- **J+48 h** : communiqué public si nécessaire
- **J+72 h** : notification CNIL (obligatoire si risque élevé)

## Formation & certification

| Population | Formation | Fréquence |
|-----------|-----------|:---------:|
| Tous employés | Sensibilisation SSI | Annuel |
| Dev / DevOps | Secure coding (OWASP, SWC) | Annuel |
| Admin Fabric | Gestion MSP + HSM | Semestriel |
| CISO / DPO | Veille réglementaire + HDS | Continu |
| Support | RGPD pour opérationnels | Annuel |

---

_Matrice revue à chaque évolution d'organigramme ou annuellement. Dernière : 2026-04-23._
