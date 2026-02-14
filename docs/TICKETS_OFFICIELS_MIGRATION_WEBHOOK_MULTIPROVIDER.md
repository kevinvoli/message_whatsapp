# Tickets Officiels - Migration Webhook Multi-Provider

Version: 1.0  
Date: 2026-02-14  
Statut contractuel: NO-GO securite tant que les tickets critiques P0/P1 ne sont pas valides

Perimetre: Migration `Whapi + Meta` vers architecture `UnifiedMessage` multitenant securisee.  
Sources consolidees: audit externe NO-GO, addendum de securite, cahier des charges technique/fonctionnel.

## Regles de priorisation
1. `P0`: Bloquant GO production (securite/isolation/crypto/idempotency).
2. `P1`: Critique stabilite et conformite.
3. `P2`: Necessaire au deploiement progressif.
4. `P3`: Durcissement post-migration.

## Legende statut initial
- `Pending`: non demarre.
- `En cours`: implementation active.
- `Bloque`: dependance non levee.
- `Valide`: accepte selon criteres.

## Phase 0 - Levee NO-GO (Securite Critique)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| P0-Securite | [P0] Figer unicite `channels` | Schema cible + addendum securite | Regle unique de prod: `(provider, external_id)` | Migration SQL appliquee, aucun doublon | SQL checks doublons + test migration up/down | Pending |
| P0-Securite | [P0] Activer signature fail-closed Meta | Endpoint Meta + `rawBody` + secret manager | Rejet 100% des requetes sans signature valide | Toute requete Meta invalide retourne `403` | Unit crypto + integration invalid signature | Pending |
| P0-Securite | [P0] Contractualiser validation Whapi niveau Meta | Endpoint Whapi + secret header config | Validation Whapi obligatoire en prod | Toute requete Whapi non autorisee est rejetee (`401/403`) | Unit secret check + integration malformed headers | Pending |
| P0-Securite | [P0] Verrouiller tenant resolution DB-only | Table `channels(provider, external_id, tenant_id)` | Service de resolution tenant unique | 0 traitement metier sans tenant resolu | Integration spoofing provider/external_id | Pending |
| P0-Securite | [P0] Ajouter anti-flood normatif | Reverse proxy + app rate-limit + quotas | Rate limits effectifs + codes `429` | Quotas appliques sans casser trafic legitime | Load tests 2k/min + burst + abuse tests | Pending |
| P0-Securite | [P0] Isolation WS multitenant stricte | JWT claims + rooms WS | Emission limitee `tenant:{tenant_id}` | 0 evenement cross-tenant | Integration WS + test intrusion cross-tenant | Pending |
| P0-Securite | [P0] Politique secrets operationnelle | Secret manager + rotation process | Rotation 90j + dual secret 24h + audit | Rotation testee sans downtime | Test rotation + audit access logs | Pending |
| P0-Securite | [P1] Mapping HTTP codes normatif | Addendum + controllers | Codes uniformes (200/202/400/401/403/409/422/429/500) | 100% endpoints conformes mapping | API contract tests | Pending |
| P0-Securite | [P1] TTL idempotency + purge | Table idempotency + cron/job | TTL 14 jours + purge quotidienne | Purge executee chaque jour, metrique emise | Unit purge + integration retention | Pending |
| P0-Securite | [P1] Baseline observabilite securite | Metrics stack | Compteurs obligatoires exposes | Dashboards + alertes actives | Smoke monitoring + alert test | Pending |

## Phase A - DB (Backlog minimal CDC)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| A-DB | [P0] Ajouter colonnes multitenant/provider | Entites actuelles + DDL | Migrations additives (`tenant_id`, `provider`, `provider_message_id`, `provider_media_id`) | Migrations executees sans downtime | Migration tests up/down + integrity checks | Pending |
| A-DB | [P0] Ajouter index critiques | Schema migre | Index perf et unicite tenant-scopee | Index presentes et utilisees en plans SQL | Explain plans + perf smoke | Pending |
| A-DB | [P0] Ajouter contraintes composites | Donnees backfill pretes | Uniques: chat/message/event log tenant-scopees | 0 collision post-contrainte | Collision tests + SQL duplicates check | Pending |
| A-DB | [P1] Backfill donnees historiques | Tables legacy | `tenant_id/provider/provider_*` completes | 100% lignes eligibles backfill | Data quality checks + reconciliation script | Pending |
| A-DB | [P1] SQL checks pre-migration | DB staging/prod | Rapport qualite donnees | Tous checks "green" avant rollout | Automated SQL gate in CI/CD | Pending |

## Phase B - Adapters & Modele Unified (Backlog minimal CDC)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| B-Adapters | [P0] Creer `UnifiedMessage`/`UnifiedStatus` | Specs payload Whapi/Meta | Contrat de donnees interne unique | Le domaine ne depend plus des payloads providers | Unit tests DTO + schema validation tests | Pending |
| B-Adapters | [P0] Implementer `WhapiAdapter` | Payload samples Whapi | Mapping Whapi -> Unified | Cas text/media/status couverts | Golden tests + edge cases | Pending |
| B-Adapters | [P0] Implementer `MetaAdapter` | Payload samples Meta | Mapping Meta -> Unified | Cas text/media/status couverts | Golden tests + edge cases | Pending |
| B-Adapters | [P1] Registry adapters provider-aware | Adapters implementes | `ProviderAdapterRegistry` | Resolution adapter fiable par provider | Unit tests registry + unknown provider test | Pending |
| B-Adapters | [P1] Validation schema stricte | JSON schemas + DTO | Rejet payload invalide (`400`) | 100% invalid payloads rejetes | Fuzz tests payload + contract tests | Pending |

## Phase C - Inbound Service (Backlog minimal CDC)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| C-Inbound | [P0] `TenantResolverService` DB-only | `provider`, `external_id` | `tenant_id` resolu ou rejet `422` | Aucun traitement sans tenant valide | Integration tests spoofing + unknown channel | Pending |
| C-Inbound | [P0] `IdempotencyService` atomique | Unified event + key | accepted/duplicate fiable | Replay x10 => 1 seul effet metier | Concurrency tests + duplicate storm test | Pending |
| C-Inbound | [P0] `UnifiedIngressService` | Controller + registry + resolver | Pipeline unifie orchestration | Flux complet stable sur Whapi | E2E integration tests | Pending |
| C-Inbound | [P1] Extraire `InboundMessageService` | Logique legacy `handleIncomingMessage()` | Service metier provider-agnostic | Aucun changement fonctionnel regressif | Regression tests legacy vs unified | Pending |
| C-Inbound | [P1] Gestion media unifiee | Unified message media | Persistance media coherente tenant | Medias associes au bon tenant/message | Integration tests media matrix | Pending |
| C-Inbound | [P1] Notif WS isolee tenant | JWT + room model | Emit scope tenant uniquement | 0 fuite cross-tenant | WS integration + abuse tests | Pending |

## Phase D - Security Hardening (Backlog minimal CDC)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| D-Security | [P0] Spec crypto normative | rawBody + secrets | Verification HMAC timing-safe uniforme | Meta+Whapi conformes spec | Unit crypto deterministic tests | Pending |
| D-Security | [P0] Enforcer fail-closed prod | Config env + guards | Rejet si secret/RAW absents ou invalides | 100% invalid/unsigned rejected | Integration tests invalid signature | Pending |
| D-Security | [P0] Rate-limit + quotas tenant | API gateway/app middleware | Protections anti-DoS actives | Burst malveillant mitige sans downtime | Load + flood + soak tests | Pending |
| D-Security | [P1] HTTP codes normatifs | Controllers + exception filters | Reponses standardisees | 100% conformite matrice HTTP | Contract tests REST | Pending |
| D-Security | [P1] Rotation secrets sans interruption | Secret manager + dual-secret logic | Rotation zero-downtime | Rotation testee en staging | Rotation drill + integration tests | Pending |
| D-Security | [P1] Audit logs securite | Logger structure | Traces completes (request/provider/tenant/event_key) | Logs exploitables audit | Log schema tests + SIEM parse tests | Pending |

## Phase E - Observabilite & Runbook (Backlog minimal CDC)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| E-Obs | [P0] Exposer metriques obligatoires | Metrics service + pipeline events | 7+ metriques obligatoires disponibles | Dashboard complet operationnel | Metrics smoke tests | Pending |
| E-Obs | [P0] Configurer alertes SLO | Seuils SLO (p95, error rate, signature) | Alerting actif | Alertes se declenchent aux seuils | Alert simulation tests | Pending |
| E-Obs | [P1] Runbook rollback 5 min | Procedure officielle | Process executable et teste | Rollback <= 5 min en exercice | Incident drill staging | Pending |
| E-Obs | [P1] Observabilite idempotency | Event log + duplicates | Graphes duplicates/conflicts/TTL purge | Correlation incidents possible | Integration tests + data consistency | Pending |
| E-Obs | [P2] Tableaux de bord GO/NO-GO | Metriques et tests qualite | Vue decisionnelle release | Critere GO/NO-GO objectivable | UAT Ops + preprod review | Pending |

## Phase F - Validation Preprod (Backlog minimal CDC)

| Phase | Tâche | Entrée | Sortie | Critère dacceptation | Tests requis | Statut |
|---|---|---|---|---|---|---|
| F-Validation | [P0] Campagne tests complete | Build candidate + env staging | Rapport Go/No-Go | 100% tests critiques pass | Full suite unit/integration/security/load | Pending |
| F-Validation | [P0] Test charge nominal | Pipeline unifie actif | Validation 2000 msg/min stable | SLO respectes 30 min | Load test scenario nominal | Pending |
| F-Validation | [P0] Test stress catastrophe | DB slow + WS crash + retries | Validation mode degrade controle | Pas de corruption/fuite tenant | Chaos test + replay storm | Pending |
| F-Validation | [P1] Validation shadow mode | Legacy + unified parallel | Ecarts mesures et corriges | Ecart fonctionnel = 0 critique | Diff tests legacy/unified | Pending |
| F-Validation | [P1] Rollout progressif Whapi | Feature flags | Whapi 5%->25%->50%->100% | Aucune regression SLO majeure | Canary monitoring tests | Pending |
| F-Validation | [P1] Activation Meta pilote | Whapi stabilise a 100% | Meta active sur cohorte pilote | 24h stables sans incident P1 | Pilot monitoring + security checks | Pending |
| F-Validation | [P1] Validation finale GO prod | Rapports techniques + signatures responsables | Decision GO/NO-GO formalisee | CTO + Security + SRE + DBA sign-off | Governance checklist | Pending |

## Dependances critiques transverses
1. Les tickets `P0-Securite` sont prealables aux phases B a F.
2. Les tickets `A-DB [P0/P1]` sont prealables a `C-Inbound`.
3. `E-Obs [P0]` est prealable a toute decision GO.
4. `F-Validation [P0]` est prealable a activation Meta.

## Definition de "Done" d'un ticket
1. Code merge sur branche principale.
2. Tests requis executes et passants.
3. Documentation mise a jour (runbook/spec si impact).
4. Evidence archivee (logs, rapport test, captures metriques).
5. Statut passe a `Valide` par le responsable de phase.

## Mapping equipe responsable (recommande)
1. Backend Lead: B, C, D.
2. DBA Lead: A.
3. Security Lead: P0-Securite, D, F (securite).
4. SRE Lead: E, F (load/chaos/rollback).
5. CTO: validation jalons GO/NO-GO.

