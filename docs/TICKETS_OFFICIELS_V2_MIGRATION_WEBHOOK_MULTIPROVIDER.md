# Document Officiel de Tickets - Migration Webhook Multi-Provider

Version: 2.0  
Date: 2026-02-14  
Statut contractuel: `NO-GO` tant que les tickets critiques P0/P1 bloquants ne sont pas valides  
Perimetre: Migration webhook `Whapi + Meta` vers `UnifiedMessage` multitenant securise (NestJS + SQL + tests automatises)  
Sources consolidees: Audit externe NO-GO, Addendum de securite, Cahier des charges technique/fonctionnel, travaux prealables (migrations DB, adapters partiels, tests existants)

## Legende priorites
- `P0`: Bloquant securite/GO production
- `P1`: Critique stabilite/conformite
- `P2`: Important pour rollout progressif
- `P3`: Optimisation/post-migration

## Legende statuts
- `Pending`: non demarre
- `En cours`: implementation en cours
- `Bloque`: dependance non levee
- `Valide`: accepte selon criteres

## Ordre logique des dependances (obligatoire)
1. Securite critique (Phase S)
2. Base de donnees et qualite des donnees (Phase A)
3. Modele unifie et adapters (Phase B)
4. Pipeline inbound metier (Phase C)
5. Hardening securite complet (Phase D)
6. Observabilite et runbook (Phase E)
7. Validation preprod et rollout (Phase F)

## Tickets critiques bloquants GO production (P0/P1)
1. Signature fail-closed Meta active
2. Validation Whapi au meme niveau de securite
3. Tenant resolution DB-only enforcee
4. Isolation WS multitenant enforcee
5. Cle idempotency finale active + TTL/purge
6. Unicites DB tenant-scopees + unicite channels figee
7. Metriques SLO et alertes actives
8. Campagne tests securite/load/chaos validee

---

## Phase S - Securite critique prealable (avant toute bascule)

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| S | P0 | Activer signature Meta fail-closed | Endpoint Meta, `rawBody`, secret manager | Rejet strict des requetes non signees/invalides | 100% requetes Meta invalides rejetees `403` | Unit crypto + integration invalid signature + rawBody absent | Pending |
| S | P0 | Contractualiser validation Whapi | Header secret Whapi + config | Validation Whapi obligatoire en prod | 100% requetes Whapi non autorisees rejetees `401/403` | Integration headers manquants/incorrects | Pending |
| S | P0 | Enforcer tenant resolution DB-only | Table `channels(provider, external_id, tenant_id)` | Service unique de resolution tenant | 0 traitement sans tenant resolu | Tests spoofing provider/external_id + unknown channel | Pending |
| S | P0 | Definir et appliquer anti-flood | Rate-limit policy + quotas + middleware/reverse proxy | Protections anti-DoS actives | Reponses `429` correctes en surcharge, service stable | Load/flood tests (2k/min nominal, 5k/min stress) | Pending |
| S | P0 | Isolation WebSocket multitenant | JWT claims + room model | WS emissions scopees tenant | 0 fuite cross-tenant en realtime | WS integration tests + intrusion tests | Pending |
| S | P1 | Mapping HTTP normatif | Matrice codes officielle | Filtres/handlers homogenes | 100% endpoints conformes codes normatifs | API contract tests | Pending |
| S | P1 | Politique secrets operationnelle | Secret manager + rotation process | Rotation 90 jours + dual secret 24h | Rotation sans downtime validee | Rotation drill + audit logs | Pending |
| S | P1 | Exposer metriques securite minimales | Metrics stack | Compteurs invalid signature, spoofing, duplicate | Dashboards/alertes actifs | Monitoring smoke + alert simulation | Pending |

---

## Phase A - DB & migrations (schema + qualite donnees)

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| A | P0 | Figer unicite channels definitive | Addendum securite | Contrainte unique `(provider, external_id)` active | 0 doublon sur cle globale | SQL duplicate checks + migration tests | Pending |
| A | P0 | Ajouter colonnes multitenant/provider | Schema actuel + backlog CDC | Colonnes `tenant_id/provider/provider_message_id/provider_media_id` | Migrations additives sans downtime | Migration up/down + integrity checks | Pending |
| A | P0 | Ajouter index/contraintes composites | Schema migre + data backfill | Uniques tenant-scopees sur chat/message/event log | Aucune collision post-contrainte | Collision tests + SQL validations | Pending |
| A | P1 | Backfill des donnees historiques | Donnees legacy | Donnees enrichies tenant/provider | 100% lignes eligibles backfillees | Reconciliation scripts + sampling | Pending |
| A | P1 | SQL gate pre-migration prod | Scripts de controle | Rapport qualite donnees green | Tous checks bloquants passes | Automated SQL gate in CI/CD | Pending |
| A | P2 | Audit perf indexes | Plans SQL + charge preprod | Plan d'optimisation indexes | p95 DB requetes critiques acceptable | Explain analyze + load tests | Pending |

---

## Phase B - Modele Unified & adapters providers

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| B | P0 | Definir `UnifiedMessage`/`UnifiedStatus` | Payload specs Whapi/Meta | Contrat interne versionne | Domaine ne consomme plus payload brut | Unit DTO/schema tests | Pending |
| B | P0 | Implementer `WhapiAdapter` | Samples Whapi + schema | Mapping Whapi -> Unified complet | Types critiques mappes sans perte metier | Golden tests + edge cases | Pending |
| B | P0 | Implementer `MetaAdapter` | Samples Meta + schema | Mapping Meta -> Unified complet | Types critiques mappes sans perte metier | Golden tests + edge cases | Pending |
| B | P1 | Creer `ProviderAdapterRegistry` | Adapters implementes | Resolution adapter fiable par provider | Provider inconnu rejete proprement | Unit registry tests | Pending |
| B | P1 | Validation stricte payload | DTO/validator schemas | Rejet `400` payload invalide | 100% invalid payloads rejetes | Fuzz tests + schema negative tests | Pending |
| B | P2 | Integrer travaux prealables adapters partiels | Code existant | Gap analysis + refactor final | Aucun code partiel non conforme conserve | Static analysis + regression tests | Pending |

---

## Phase C - Pipeline inbound unifie

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| C | P0 | Implementer `IdempotencyService` atomique | Cle finale + table event log | accepted/duplicate robuste | Replay x10 -> 1 seul effet metier | Concurrency tests + duplicate storm | Pending |
| C | P0 | Appliquer TTL/purge idempotency | Table event log + scheduler | TTL 14 jours + purge quotidienne | Purge executee chaque jour | Unit purge + integration retention | Pending |
| C | P0 | Implementer `TenantResolverService` | `provider`, `external_id` | `tenant_id` resolu/rejet | Aucun traitement metier sans tenant | Integration unknown/spoofing tests | Pending |
| C | P1 | Construire `UnifiedIngressService` | Controller + resolver + adapters + idempotency | Orchestration webhook unifiee | Flux stable sur Whapi en premier | E2E integration tests | Pending |
| C | P1 | Extraire `InboundMessageService` | Logique legacy existante | Service metier provider-agnostic | Aucune regression fonctionnelle critique | Legacy vs unified diff tests | Pending |
| C | P1 | Gestion media unifiee et tenant-safe | Unified events media | Persistance media coherente | 0 media orphelin/cross-tenant | Integration media matrix tests | Pending |
| C | P1 | Emission WS tenant-safe | JWT + rooms tenant | Notifications strictement scopees | Aucune fuite WS cross-tenant | WS end-to-end security tests | Pending |

---

## Phase D - Hardening securite complet

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| D | P0 | Normaliser spec crypto code | Addendum crypto + impl actuelle | Verification HMAC uniforme Meta/Whapi | 0 divergence de calcul signature | Unit deterministic crypto tests | Pending |
| D | P0 | Enforcer rawBody obligatoire prod | Nest rawBody config + guards | Rejet si rawBody absent | Requetes sans rawBody refusees | Integration env prod-like tests | Pending |
| D | P1 | Quotas tenant operationnels | Tenant policies | Limites `events/min` appliquees | Protection surcharge par tenant | Quota tests + fairness tests | Pending |
| D | P1 | Audit logs securite structures | Logger + correlation ids | Logs auditables (`request_id, tenant_id, provider, event_key`) | 100% traces critiques presentes | Log schema tests + SIEM parse | Pending |
| D | P2 | Harden fallback idempotency hash | payload hash + minute bucket | Fallback robuste sans collision pratique | Collision rate acceptable sous stress | Stress tests payload variants | Pending |
| D | P2 | Integrer secret dual-window | secret courant + precedent | Rotation sans interruption 24h | Aucune interruption webhook durant rotation | Integration rotation window tests | Pending |

---

## Phase E - Observabilite & runbook operatoire

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| E | P0 | Exposer metriques SLO obligatoires | Pipeline + metrics module | Metriques: received, duplicate, signature_invalid, error, p95/p99, tenant_resolution_failed | Dashboard complet en preprod/prod | Metrics smoke tests | Pending |
| E | P0 | Configurer alertes seuils SLO | Seuils contractuels | Alertes operationnelles (warning/critical) | Alertes declenchees aux seuils | Alert simulation drill | Pending |
| E | P1 | Valider runbook rollback 5 min | Procedure officielle | Runbook executable et horodate | Rollback effectif <= 5 min | Incident exercise staging | Pending |
| E | P1 | Metriques idempotency/purge | Event log + scheduler | Visibilite duplicates/conflicts/purge | Correlation incident complete | Integration metrics tests | Pending |
| E | P2 | Table de bord GO/NO-GO | SLO + test outcomes | Vue decisionnelle release | Decision objectivable sans ambiguite | UAT Ops review | Pending |

---

## Phase F - Validation preprod & rollout

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| F | P0 | Campagne tests securite complete | Build candidate + staging | Rapport securite signe | 100% tests critiques pass | Signature, spoofing, replay, WS isolation tests | Pending |
| F | P0 | Test charge nominal | Pipeline unify + SLO | Validation `2000 msg/min` stable | p95/p99/error conformes | Load test 30 min | Pending |
| F | P0 | Test catastrophe | DB ralentissement + crash WS + retries providers | Validation degrade controlee | Pas de perte de donnees critique, pas de fuite tenant | Chaos test + replay storm | Pending |
| F | P1 | Shadow mode legacy/unified | Double pipeline actif | Rapport d'ecarts | 0 ecart critique avant bascule | Diff tests legacy vs unified | Pending |
| F | P1 | Rollout progressif Whapi | Feature flags | 5% -> 25% -> 50% -> 100% | Stabilite SLO a chaque palier | Canary checks + rollback drills | Pending |
| F | P1 | Activation Meta pilote | Whapi stabilise a 100% | Meta actif sur cohorte pilote | 24h sans incident P1/P0 | Pilot monitoring + security gates | Pending |
| F | P1 | Validation GO production | Rapports phases S-A-F | Decision formelle GO/NO-GO | Sign-off CTO + Security + SRE + DBA | Governance checklist | Pending |
| F | P2 | Nettoyage post-migration | Stabilisation confirmee | Plan retrait legacy | Legacy retire sans regression | Regression suite complete | Pending |

---

## Tickets de consolidation des travaux prealables

| Phase | Priorité | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|---|
| S | P1 | Inventaire migrations DB existantes | Historique migrations repo | Matrice gap "existant vs cible" | Aucun trou critique non trace | Audit SQL + peer review | Pending |
| B | P1 | Inventaire adapters partiels existants | Code actuel adapters | Plan de refactor / conservation | 100% mapping critique couvert | Unit/regression mapping tests | Pending |
| E | P2 | Inventaire tests existants | Suite test actuelle | Matrice couverture par exigence | Chaque exigence critique a >=1 test | Coverage report + gap tests | Pending |

---

## Definition of Done d'un ticket
1. Code merge sur branche principale.
2. Tous les tests requis du ticket sont passants.
3. Evidences archivees (logs, rapports, captures metriques).
4. Documentation impactee mise a jour.
5. Validation par owner de phase.

## RACI simplifie
1. Backend Lead: phases B, C, D.
2. DBA Lead: phase A.
3. Security Lead: phase S, D, F (securite).
4. SRE Lead: phase E, F (load/chaos/rollback).
5. CTO: arbitrage final GO/NO-GO.

