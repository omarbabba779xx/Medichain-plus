# Service Level Agreement (SLA)

> Contrat de service entre MediChain+ (prestataire) et les organisations de santé (clients). Aligné référentiel HDS critère 4 · ITIL v4.

## Engagements de niveau de service

### Disponibilité

| Service | Disponibilité garantie | Downtime max / mois | Mesure |
|---------|:---------------------:|:-------------------:|--------|
| Lecture DME (read API) | **99,95 %** | 21 min | HTTP 200 sur `/api/record` |
| Écriture DME / Consentement | **99,9 %** | 43 min | Transaction Fabric committed |
| Bridge Fabric ↔ Polygon | 99,5 % | 3 h 36 min | Events forwarded within 60 s |
| Portail web (landing + démo) | 99,9 % | 43 min | Pingdom synthetic |
| Smart contract Polygon | 99,99 %* | 4 min | Polygon network uptime |

\* _Dépend du réseau Polygon, hors contrôle direct MediChain+._

### Performance

| Opération | p50 | p95 | p99 |
|-----------|:---:|:---:|:---:|
| `ReadRecord` | 150 ms | 400 ms | 1 s |
| `GrantConsent` | 500 ms | 1,5 s | 3 s |
| `IssuePrescription` | 800 ms | 2 s | 5 s |
| Bridge Fabric→Polygon relay | 8 s | 30 s | 60 s |
| Frontend Time-to-Interactive | 1,5 s | 3 s | 5 s |

### Temps de résolution (MTTR)

| Sévérité | Définition | Engagement |
|----------|-----------|:----------:|
| **P1 Critique** | Service indisponible, sécurité compromise | < **1 h** |
| **P2 Majeur** | Dégradation importante, workaround existe | < 4 h |
| **P3 Modéré** | Bug non bloquant | < 24 h |
| **P4 Mineur** | Cosmétique, demande d'évolution | < 5 jours ouvrés |

## Support

| Canal | Disponibilité | Réponse initiale |
|-------|:-------------:|:----------------:|
| **Astreinte P1** | 24/7/365 | 15 min |
| Ticketing (portal) | 24/7 | 2 h (ouvrables) |
| Email support@medichain.plus | 24/7 | 4 h |
| Téléphone | 8h-20h CET L-V | immédiat |
| Community (Discord) | best-effort | — |

## Fenêtres de maintenance

- **Planifiée** : Dimanche 02:00-06:00 CET, préavis J-7
- **Urgence sécurité** : application immédiate, communication post-fix sous 24 h
- **Durée max par fenêtre** : 4 h

## Pénalités

Crédits appliqués sur la facture mensuelle :

| Disponibilité constatée | Crédit |
|------------------------|:------:|
| < 99,9 % | 10 % |
| < 99,5 % | 25 % |
| < 99 % | 50 % |
| < 95 % | 100 % |

Limite : le total des crédits ne peut excéder **50 % de la mensualité**.

## Exclusions

Le SLA ne s'applique pas dans les cas suivants :

- Cas de force majeure (catastrophe naturelle, guerre, pandémie)
- Défaillance d'un réseau public tiers (Polygon, Chainlink, Internet)
- Actions du client contraires aux CGU
- Maintenances planifiées avec préavis ≥ 7 jours
- Attaques de type zero-day non publiques

## Reporting

Rapport SLA mensuel envoyé le 5 du mois suivant, incluant :

- % disponibilité par service
- Nombre d'incidents P1-P4
- MTTR moyen et médian
- Volume de transactions (réussies, échouées)
- Indicateurs sécurité (CVE détectées, patches appliqués)
- Plan d'amélioration continue

## Monitoring

| Outil | Usage |
|-------|-------|
| **Prometheus + Grafana** | Métriques infrastructure, blockchain |
| **Loki** | Logs agrégés |
| **Tempo** | Traces distribuées |
| **Alertmanager** | Routing alertes |
| **PagerDuty** | Escalade astreinte |
| **UptimeRobot / Pingdom** | Synthetic monitoring externe |
| **Etherscan API** | On-chain transaction monitoring |

## Révision

SLA révisé **annuellement** ou sur demande justifiée du client. Toute modification nécessite accord écrit des deux parties.

---

_Document contractuel. Version 1.0 — 2026-04-23._
