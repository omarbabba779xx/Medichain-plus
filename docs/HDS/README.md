# MediChain+ · HDS-Readiness Dossier

> **Statut** : _Self-assessment_ — ce dossier décrit l'état de préparation de MediChain+ à une **certification HDS (Hébergeur de Données de Santé)** selon le référentiel **ANS 2018 v1.1**. Aucune certification effective n'est revendiquée.

## Contexte réglementaire

| Référence | Objet |
|-----------|-------|
| **Art. L.1111-8 CSP** | Agrément/certification obligatoire pour héberger des données de santé à caractère personnel en France |
| **Référentiel HDS ANS 2018 v1.1** | 6 activités, 12 critères d'exigence, basé sur ISO 27001 + ISO 20000-1 |
| **RGPD (UE 2016/679)** | Base légale, DPIA, droit à l'oubli, portabilité |
| **PGSSI-S** | Politique Générale de Sécurité des Systèmes d'Information de Santé |
| **eIDAS 910/2014** | Signature électronique, horodatage, identification qualifiée |

## Périmètre certifiable

MediChain+ couvre **4 des 6 activités HDS** :

| # | Activité | Inclus | Motif |
|---|----------|:------:|-------|
| 1 | Mise à disposition d'infrastructure d'hébergement | ✅ | Pods Docker/K8s, réseau Fabric |
| 2 | Mise à disposition d'infrastructure virtuelle | ✅ | Orgs Fabric, partitionnement MSP |
| 3 | Mise à disposition de plateforme logicielle | ✅ | Chaincode, SDK, bridge Polygon |
| 4 | Infogérance | ✅ | Monitoring, CI/CD, astreinte |
| 5 | Sauvegarde externalisée | ❌ | Out of scope MVP — à contractualiser |
| 6 | Archivage à valeur probante | ❌ | Nécessite tiers archiveur certifié |

## Check-list des 12 critères HDS

Voir [`criteria-checklist.md`](./criteria-checklist.md) pour l'évaluation détaillée critère par critère.

| # | Domaine | Statut | Livrables |
|---|---------|:------:|-----------|
| 1 | Politique SSI & gouvernance | 🟡 | `governance.md` |
| 2 | Analyse de risques | 🟢 | `ebios-rm.md` |
| 3 | Organisation de la sécurité | 🟢 | `raci-matrix.md` |
| 4 | Sécurité des ressources humaines | 🟡 | Onboarding docs |
| 5 | Gestion des actifs | 🟢 | `assets-inventory.md` |
| 6 | Contrôle d'accès | 🟢 | Fabric MSP + ctx.GetClientIdentity |
| 7 | Cryptographie | 🟢 | ECDSA P-256, SHA-256, TLS 1.3 |
| 8 | Sécurité physique & environnementale | ⚪ | Hébergeur tiers (AWS/OVH HDS-certified) |
| 9 | Sécurité des opérations | 🟢 | CI/CD, Slither, Mythril, Semgrep |
| 10 | Sécurité des communications | 🟢 | TLS mutuel Fabric, HTTPS |
| 11 | Continuité d'activité | 🟢 | `pca-pra.md` |
| 12 | Conformité RGPD | 🟢 | `rgpd-register.md`, DPIA |

**Légende** : 🟢 conforme / 🟡 partiel / ⚪ externalisé / 🔴 non conforme.

## Documents du dossier

1. [`ebios-rm.md`](./ebios-rm.md) — Analyse des risques méthode EBIOS Risk Manager
2. [`rgpd-register.md`](./rgpd-register.md) — Registre des traitements Art. 30 RGPD
3. [`pca-pra.md`](./pca-pra.md) — Plan de continuité & reprise d'activité
4. [`sla.md`](./sla.md) — Service Level Agreement
5. [`raci-matrix.md`](./raci-matrix.md) — Matrice de responsabilités
6. [`criteria-checklist.md`](./criteria-checklist.md) — Check-list 12 critères
7. [`dpia.md`](./dpia.md) — Analyse d'impact (DPIA) RGPD Art. 35

## Prochaines étapes vers la certification

1. **Contractualiser un hébergeur HDS** (OVH, Outscale, AWS, Azure) pour le critère 8.
2. **Audit à blanc** par un organisme certificateur (LNE, BSI, SGS, Bureau Veritas).
3. **Plan d'action corrective** sur les écarts relevés.
4. **Audit officiel** de certification (durée 2 à 5 jours).
5. **Délivrance du certificat HDS** (validité 3 ans, surveillance annuelle).

**Coût indicatif** : 20 000 – 80 000 € selon périmètre, **délai** : 6 – 18 mois.

---

_Document généré et maintenu par l'équipe MediChain+. Dernière révision : 2026-04-23._
