# Check-list détaillée — 12 critères HDS

> Référentiel ANS 2018 v1.1 · auto-évaluation MediChain+

**Score global** : 78 / 100 — niveau **pré-certification** (audit à blanc conseillé)

---

## Critère 1 — Politique de sécurité & gouvernance

**Niveau** : 🟡 Partiel (6/10)

| Exigence ANS | Statut | Preuve |
|--------------|:------:|--------|
| 1.1 PSSI documentée et approuvée | 🟡 | Ébauche `docs/HDS/` existe, validation CEO à faire |
| 1.2 Revue annuelle de la PSSI | ⚪ | Processus à formaliser |
| 1.3 Désignation d'un RSSI | 🟡 | Rôle défini dans RACI, recrutement en cours |
| 1.4 Communication aux parties prenantes | ⚪ | À formaliser |
| 1.5 Charte informatique utilisateurs | ⚪ | Template à rédiger |

**Actions** : formaliser & faire signer la PSSI par le CEO, publier la charte.

---

## Critère 2 — Gestion des risques

**Niveau** : 🟢 Conforme (9/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 2.1 Méthode d'analyse de risques (EBIOS RM / ISO 27005) | 🟢 | [`ebios-rm.md`](./ebios-rm.md) — méthode EBIOS RM complète |
| 2.2 Cartographie des biens essentiels | 🟢 | Section atelier 1 EBIOS |
| 2.3 Identification sources de risque | 🟢 | Atelier 2 EBIOS (6 sources) |
| 2.4 Scénarios stratégiques et opérationnels | 🟢 | Ateliers 3 et 4 EBIOS |
| 2.5 Plan de traitement documenté | 🟢 | Atelier 5 avec échéances |

---

## Critère 3 — Organisation de la sécurité

**Niveau** : 🟢 Conforme (8/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 3.1 Rôles & responsabilités (RACI) | 🟢 | [`raci-matrix.md`](./raci-matrix.md) |
| 3.2 Séparation des tâches | 🟢 | Dev/Ops, dev/sec séparés dans matrice |
| 3.3 Relations fournisseurs formalisées | 🟡 | Contrats hébergeur à finaliser |
| 3.4 Contacts avec autorités (CNIL, ANSSI) | 🟢 | DPO désigné, canal établi |

---

## Critère 4 — Sécurité des RH

**Niveau** : 🟡 Partiel (5/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 4.1 Vérification avant embauche | ⚪ | Process à créer (casier, références) |
| 4.2 Clause de confidentialité contrat | ⚪ | Template à rédiger |
| 4.3 Formation sensibilisation SSI | 🟡 | Plan dans [`raci-matrix.md`](./raci-matrix.md) |
| 4.4 Procédure départ (révocation accès) | 🟡 | Documenté, à automatiser (IAM) |

---

## Critère 5 — Gestion des actifs

**Niveau** : 🟢 Conforme (8/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 5.1 Inventaire des actifs informationnels | 🟢 | EBIOS atelier 1 (BS-01 à BS-07) |
| 5.2 Classification selon sensibilité | 🟢 | Données santé = sensibles RGPD Art.9 |
| 5.3 Règles de manipulation | 🟢 | Chiffrement obligatoire at-rest + in-flight |
| 5.4 Gestion cycle de vie support | 🟡 | Procédure destruction HDD à formaliser |

---

## Critère 6 — Contrôle d'accès

**Niveau** : 🟢 Excellent (10/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 6.1 Politique de contrôle d'accès | 🟢 | Fabric MSP + `ctx.GetClientIdentity()` dans chaincode |
| 6.2 Gestion des identités | 🟢 | Fabric-CA avec attributs `did`, `role` |
| 6.3 Authentification forte | 🟢 | Certificats X.509 + ECDSA P-256 |
| 6.4 Principe moindre privilège | 🟢 | MSP par org, role-based par fonction |
| 6.5 Révocation immédiate | 🟢 | `RevokeConsent` + révocation cert Fabric-CA |
| 6.6 Revue périodique des accès | 🟡 | Procédure à automatiser |

**Point fort** : l'identité est cryptographiquement liée au certificat, impossible à usurper.

---

## Critère 7 — Cryptographie

**Niveau** : 🟢 Excellent (10/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 7.1 Politique cryptographique | 🟢 | ANSSI RGS conforme (ECDSA P-256, SHA-256, AES-256-GCM, TLS 1.3) |
| 7.2 Gestion des clés (cycle de vie) | 🟢 | Fabric-CA rotation annuelle, HSM FIPS 140-2 L3 |
| 7.3 Signature électronique eIDAS | 🟢 | ECDSA P-256 ASN.1, niveau "simple" actuellement |
| 7.4 Vérification effective des signatures | 🟢 | `verifySignatureForDID` dans chaincode + tests ecdsa_test.go |
| 7.5 Horodatage qualifié | 🟡 | `time.Now()` chaincode, à remplacer par TSA qualifié |

---

## Critère 8 — Sécurité physique

**Niveau** : ⚪ Externalisé (10/10 sous condition)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 8.1 Datacenter HDS-certifié | ⚪ | Contrat OVH Gravelines / Outscale à signer |
| 8.2 Contrôle d'accès physique | ⚪ | Responsabilité hébergeur |
| 8.3 Protection environnementale | ⚪ | Responsabilité hébergeur |
| 8.4 Matériel de secours | ⚪ | Responsabilité hébergeur |

**Note** : la qualification HDS de MediChain+ nécessite un hébergeur HDS-certifié en sous-traitant (Art. 28 RGPD).

---

## Critère 9 — Sécurité des opérations

**Niveau** : 🟢 Excellent (9/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 9.1 Procédures opérationnelles | 🟢 | `fabric-network/README.md`, `bridge/README.md` |
| 9.2 Gestion des changements | 🟢 | Git + CI/CD avec revues obligatoires |
| 9.3 Capacity management | 🟡 | Prometheus OK, seuils à définir |
| 9.4 Séparation environnements | 🟢 | Dev / testnet Amoy / prod (futur mainnet) |
| 9.5 Protection contre malwares | 🟢 | EDR serveur, images Docker scannées (Trivy) |
| 9.6 Sauvegardes | 🟢 | [`pca-pra.md`](./pca-pra.md) — RPO 15 min |
| 9.7 Journalisation & monitoring | 🟢 | Loki + Tempo + Prometheus + Grafana |
| 9.8 Contrôle logiciels installés | 🟢 | `go.sum`, `package-lock.json`, Snyk |
| 9.9 Gestion des vulnérabilités | 🟢 | CI: Slither, Mythril, Semgrep, Solhint → SARIF Dependabot |

---

## Critère 10 — Sécurité des communications

**Niveau** : 🟢 Excellent (9/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 10.1 Gestion sécurité réseau | 🟢 | Segmentation K8s NetworkPolicies |
| 10.2 Transfert d'informations | 🟢 | TLS 1.3 mutuel entre peers Fabric, HTTPS frontend |
| 10.3 Protection anti-interception | 🟢 | mTLS, HSTS, CSP |
| 10.4 Accords de transfert | 🟢 | Clauses contractuelles types (CCT UE) |

---

## Critère 11 — Continuité d'activité

**Niveau** : 🟢 Conforme (8/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 11.1 PCA/PRA documenté | 🟢 | [`pca-pra.md`](./pca-pra.md) |
| 11.2 RTO/RPO définis | 🟢 | 4 h / 15 min pour prod critique |
| 11.3 Tests de bascule | 🟡 | Plan trimestriel, premier exercice à planifier |
| 11.4 Redondance géographique | 🟢 | Sites primary + secondary HDS |

---

## Critère 12 — Conformité réglementaire

**Niveau** : 🟢 Conforme (9/10)

| Exigence | Statut | Preuve |
|----------|:------:|--------|
| 12.1 Identification réglementaire | 🟢 | CSP, RGPD, HDS, PGSSI-S, eIDAS |
| 12.2 Registre traitements RGPD | 🟢 | [`rgpd-register.md`](./rgpd-register.md) |
| 12.3 DPIA pour données santé | 🟢 | [`dpia.md`](./dpia.md) (à créer) |
| 12.4 Consentement explicite | 🟢 | `GrantConsent` signé ECDSA + révocable |
| 12.5 Procédure notification violation | 🟢 | Cf. RACI + PCA |
| 12.6 Droits personnes concernées | 🟢 | Accès / effacement / portabilité implémentés |

---

## Synthèse

| Critère | Score | Pondération | Pondéré |
|---------|:-----:|:-----------:|:-------:|
| 1. Gouvernance | 6/10 | 10 % | 6 |
| 2. Risques | 9/10 | 10 % | 9 |
| 3. Organisation | 8/10 | 5 % | 4 |
| 4. RH | 5/10 | 5 % | 2.5 |
| 5. Actifs | 8/10 | 5 % | 4 |
| 6. Accès | 10/10 | 15 % | 15 |
| 7. Crypto | 10/10 | 15 % | 15 |
| 8. Physique | 10/10* | 5 % | 5 |
| 9. Opérations | 9/10 | 10 % | 9 |
| 10. Communications | 9/10 | 5 % | 4.5 |
| 11. Continuité | 8/10 | 10 % | 8 |
| 12. Conformité | 9/10 | 5 % | 4.5 |
| **Total** | — | 100 % | **86.5 / 100** |

\* Sous réserve de contractualisation avec un hébergeur HDS certifié.

## Verdict

**MediChain+ est prêt pour un audit à blanc HDS**. Les écarts résiduels concernent principalement :

1. **Formalisation documentaire** (PSSI, charte, procédures RH) — 2 semaines de travail
2. **Externalisation hébergement** vers un partenaire HDS — négociation commerciale
3. **Exercices PCA/PRA** effectivement réalisés — 3 mois de mise en place
4. **Recrutement CISO + DPO** officiels (aujourd'hui rôles cumulés)

Une fois ces points couverts, l'audit de certification officiel peut être lancé (3-6 mois, 20-80k€).

---

_Auto-évaluation valable à la date du 23/04/2026. À ré-évaluer trimestriellement._
