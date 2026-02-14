# Cahier des Charges Technique et Fonctionnel

Projet: Migration webhook multiprovider (Whapi + Meta) vers architecture `UnifiedMessage` multitenant securisee  
Version: 1.0  
Date: 2026-02-14  
Statut: Contractuel, pret a l'implementation

## 1. Contexte & Objectifs

## 1.1 Contexte actuel
1. Le backend NestJS est historiquement couple au format Whapi.
2. Le webhook Meta est actuellement transforme en pseudo-format Whapi, ce qui introduit un couplage structurel.
3. Le modele de donnees n'est pas strictement multitenant (`tenant_id` absent des tables coeur).
4. L'audit externe a prononce un `NO-GO` en l'etat pour raisons de securite et de robustesse.

## 1.2 Objectifs clefs
1. Introduire un modele interne unique `UnifiedMessage` et `UnifiedStatus`.
2. Imposer un multitenant strict et auditable (`tenant_id` obligatoire, scope everywhere).
3. Renforcer la securite webhook (signatures, fail-closed, anti-spoofing, anti-replay).
4. Implementer une idempotency robuste:
- cle finale: `tenant_id + provider + provider_message_id + event_type + direction`.
5. Garantir une migration progressive sans downtime avec rollback < 5 minutes.
6. Atteindre les SLO:
- latence webhook `p95 <= 400 ms`, `p99 <= 900 ms`
- error rate `< 1%` (fenetre 15 min)
- MTTR incident P1 `<= 30 min`.

## 2. Portee du projet

## 2.1 Inclus
1. Evolution schema DB (colonnes, index, contraintes tenant-scopees).
2. Nouveau pipeline webhook multiprovider (`Whapi`, `Meta`).
3. Adapters provider -> `UnifiedMessage`/`UnifiedStatus`.
4. Idempotency service avec TTL + purge.
5. Tenant resolution DB-only via `(provider, external_id) -> tenant_id`.
6. Hardening securite (signature, quotas, rate-limit, codes HTTP normatifs).
7. Isolation WebSocket multitenant.
8. Observabilite (metriques, alertes, logs structures).
9. Tests preprod: unitaires, integration, charge, securite.

## 2.2 Hors scope
1. UI/Front-end.
2. Dashboard business/analytics produit.
3. Refonte complete des modules non webhook.
4. Refactor global hors perimetre de migration webhook.

## 3. Exigences fonctionnelles

## 3.1 Endpoints webhook multiprovider
1. Exposer:
- `POST /webhooks/whapi`
- `GET /webhooks/whatsapp` (Meta verify)
- `POST /webhooks/whatsapp`
2. Comportement:
- validation signature/secrets avant tout traitement metier,
- traitement provider-aware via router + adapter.

Critere d'acceptation:
- Chaque endpoint accepte payload valide et retourne code HTTP normatif.

Tests requis:
- Integration tests endpoint par provider.

## 3.2 Normalisation vers `UnifiedMessage`
1. Tous les messages entrants doivent etre transformes en `UnifiedMessage`.
2. Tous les statuts entrants doivent etre transformes en `UnifiedStatus`.
3. Le domaine metier ne consomme jamais le payload provider brut.

Critere d'acceptation:
- Pour un meme cas fonctionnel, Whapi et Meta produisent des objets unifies semantiquement equivalents.

Tests requis:
- Unit tests des adapters (golden samples + cas limites).

## 3.3 Traitement idempotent
1. La cle idempotency finale est obligatoire.
2. Si duplicat detecte, aucun effet secondaire metier ne doit etre rejoue.
3. En absence de `provider_message_id`, fallback hash + bucket minute obligatoire.

Critere d'acceptation:
- 10 retries identiques produisent 1 seule persistance metier.

Tests requis:
- Integration tests replay x10, parallel requests.

## 3.4 Resolution tenant strict via DB
1. Tenant resolution uniquement via `(provider, external_id)` dans `channels`.
2. Le `tenant_id` payload n'est jamais source d'autorite.
3. En absence de mapping valide, rejeter `422`.

Critere d'acceptation:
- Aucune operation metier sans tenant resolu.

Tests requis:
- Tests spoofing channel/provider.

## 3.5 Gestion media
1. Les medias sont relies au message et au tenant.
2. Les metadonnees media sont stockees avec `provider_media_id` si present.
3. Les medias ne peuvent pas etre associes a un tenant different du message parent.

Critere d'acceptation:
- Integrity check FK + tenant consistency.

Tests requis:
- Integration tests message avec media multi-types.

## 3.6 Notification WS avec isolation tenant
1. Emission websocket uniquement dans room `tenant:{tenant_id}`.
2. Controle JWT obligatoire et coherence tenant a l'emission.
3. Interdiction d'emission cross-tenant.

Critere d'acceptation:
- Aucun client d'un autre tenant ne recoit l'evenement.

Tests requis:
- Tests integration WS + test intrusion cross-tenant.

## 4. Exigences non fonctionnelles

## 4.1 Securite
1. Meta:
- HMAC SHA-256 sur `rawBody`, header `x-hub-signature-256`, compare timing-safe.
2. Whapi:
- secret header obligatoire configure + valeur attendue.
3. Production `fail-closed`:
- toute requete sans validation cryptographique valide est rejetee.
4. Rotation secrets:
- tous les 90 jours, support dual-secret 24h.

## 4.2 Performance
1. SLO latence:
- `p95 <= 400 ms`, `p99 <= 900 ms`.
2. SLO erreur:
- `error_rate < 1%` (15 min).
3. Throughput cible preprod:
- `>= 2000 msg/min` stable.
4. Stress test:
- `5000 msg/min` degrade controle (pas de fuite, pas de corruption).

## 4.3 Scalabilite
1. Support shadow pipeline (legacy + unified) pendant migration.
2. Rollout progressif par feature flags.
3. Activation Meta uniquement apres stabilisation Whapi.

## 4.4 Observabilite
1. Metriques obligatoires exposees.
2. Dashboard temps reel obligatoire.
3. Alertes critiques obligatoires (signature invalid spike, p95, error rate).

## 5. Architecture cible

## 5.1 Diagramme logique
```text
[WebhookController]
        |
        v
[SignatureGuard] -> reject(401/403)
        |
        v
[TenantResolverService (DB-only)]
        |
        v
[ProviderAdapterRegistry]
        |
        v
[UnifiedIngressService]
        |
        +--> [IdempotencyService] -> duplicate => ack
        |
        v
[InboundMessageService]
   |        |          |
   v        v          v
[Dispatch] [Persist] [WS Notify]
        |
        v
[Metrics + Audit Logs]
```

## 5.2 Composants backend
1. `WebhooksController`
2. `SignatureGuard`
3. `TenantResolverService`
4. `ProviderAdapterRegistry`
5. `WhapiAdapter`
6. `MetaAdapter`
7. `UnifiedIngressService`
8. `IdempotencyService`
9. `InboundMessageService`
10. `WebhookMetricsService`

## 5.3 Schema DB cible (minimum)
1. `channels`
- `id`, `tenant_id`, `provider`, `external_id`, `status`, timestamps.
- Unique definitive: `(provider, external_id)`.
2. `whatsapp_chat`
- `tenant_id`, `chat_id`, `channel_id`, etc.
- Unique: `(tenant_id, chat_id)`.
3. `whatsapp_message`
- `tenant_id`, `provider`, `provider_message_id`, `direction`, `chat_id`, `channel_id`, etc.
- Unique: `(tenant_id, provider, provider_message_id, direction)`.
4. `whatsapp_media`
- `tenant_id`, `provider`, `provider_media_id`, `message_id`, etc.
5. `webhook_event_log`
- `tenant_id`, `provider`, `event_type`, `direction`, `provider_message_id`, `event_key`, `payload_hash`, `created_at`.
- Unique: `(tenant_id, provider, event_key)`.

## 5.4 WS isolation model
1. Room: `tenant:{tenant_id}`.
2. JWT claims obligatoires: `sub`, `tenant_id`, `exp`, `jti`.
3. Verification tenant avant toute emission.

## 6. Contraintes techniques

## 6.1 Signature cryptographique
1. Verification sur `rawBody` uniquement.
2. Interdiction de verification sur `JSON.stringify(payload)`.
3. Comparaison `timingSafeEqual` obligatoire.
4. Si `rawBody` absent en prod: rejet.

## 6.2 Idempotency TTL & purge
1. TTL des cles idempotency: `14 jours`.
2. Purge quotidienne:
- supprimer enregistrements > 14 jours.
3. Monitoring purge:
- metrique `idempotency_ttl_purge_total`.

## 6.3 Unicites composites tenant-scope
1. Toute contrainte business critique doit inclure `tenant_id` sauf decision explicite contraire.
2. `channels` exception contractuelle:
- unicite globale `(provider, external_id)` imposee.

## 6.4 Mapping HTTP codes normatifs
1. `200`: traite/duplicate ignore.
2. `202`: accepte async.
3. `400`: payload invalide.
4. `401`: secret absent/invalide.
5. `403`: signature invalide.
6. `409`: conflit idempotency non resolvable.
7. `422`: channel inconnu/mapping tenant invalide.
8. `429`: quota depasse.
9. `500`: erreur interne.

## 7. Criteres d'acceptation (mesurables)

| Exigence | Condition de reussite | Tests obligatoires |
|---|---|---|
| Endpoint webhook | Reponse HTTP normative pour payload valide/invalide | Integration API par provider |
| Normalisation Unified | Mapping stable et complet de tous types supportes | Unit tests adapters + snapshots |
| Idempotency | 1 effet metier pour N retries | Integration replay parallel + DB checks |
| Tenant resolution | 0 traitement sans tenant resolu | Security test spoofing |
| Signature | 100% rejets des signatures invalides | Tests HMAC valides/invalides |
| Isolation WS | 0 emission cross-tenant | Integration WS + pentest interne |
| SLO latence | p95 <= 400ms, p99 <= 900ms | Load test 2000 msg/min |
| Resilience | systeme degrade controle a 5000 msg/min | Stress test + chaos DB/gateway |

## 8. Plan de deploiement progressif

## 8.1 Feature flags
1. `FF_UNIFIED_WEBHOOK_ROUTER`
2. `FF_PROVIDER_META_ENABLED`
3. `FF_ENFORCE_TENANT_DB_RESOLUTION`

## 8.2 Shadow mode
1. Legacy reste actif.
2. Unified tourne en shadow (comparaison sans impact business initial).

## 8.3 Rollout sequence
1. DB migrations additives + backfill.
2. Activation unified sur Whapi a faible pourcentage.
3. Stabilisation Whapi a 100%.
4. Activation Meta tenant pilote.
5. Extension progressive Meta.

## 8.4 Checkpoints Go/No-Go
1. Metriques SLO vertes.
2. Aucune fuite cross-tenant.
3. Signature invalid rejection a 100%.
4. Runbook rollback teste.

## 9. Backlog minimal des taches

## Phase A - DB
1. Tache: Ajouter colonnes multitenant et provider.
- Entree: schema actuel.
- Sortie: migrations SQL additives appliquees.
- CA: colonnes presentes + index operationnels.
- Tests: migration up/down en CI, checks contraintes.
2. Tache: Ajouter contraintes composites.
- Entree: donnees backfill.
- Sortie: unicites tenant-scopees actives.
- CA: aucune collision en tests.
- Tests: insert conflict tests.

## Phase B - Adapters & Model
1. Tache: Creer `UnifiedMessage`/`UnifiedStatus`.
- Entree: payload specs providers.
- Sortie: DTO/types unifies.
- CA: coverage types supportes >= 95% cas connus.
- Tests: unit tests type mapping.
2. Tache: Implementer `WhapiAdapter` et `MetaAdapter`.
- Entree: payloads samples.
- Sortie: adapters deterministes.
- CA: mapping conforme snapshots.
- Tests: golden fixtures + cas limites.

## Phase C - Inbound Service
1. Tache: Implementer `TenantResolverService`.
- Entree: `provider`, `external_id`.
- Sortie: `tenant_id`.
- CA: reject `422` si non resolu.
- Tests: integration DB mapping.
2. Tache: Implementer `IdempotencyService`.
- Entree: unified event.
- Sortie: accepted/duplicate.
- CA: atomique sous charge concurrente.
- Tests: concurrency tests (parallel insert).
3. Tache: Implementer `UnifiedIngressService` + `InboundMessageService`.
- Entree: unified event.
- Sortie: dispatch + persistence + WS + metrics.
- CA: flux complet stable sans doublon.
- Tests: integration end-to-end.

## Phase D - Security Hardening
1. Tache: Signature fail-closed Meta/Whapi.
- Entree: headers + rawBody.
- Sortie: accept/reject normatif.
- CA: 100% invalid signatures rejetees.
- Tests: unit + integration crypto.
2. Tache: Rate-limit + quotas + HTTP codes.
- Entree: trafic webhook.
- Sortie: protection anti-flood.
- CA: reponses 429/403/422 conformes.
- Tests: load/fuzz tests.

## Phase E - Observabilite & Runbook
1. Tache: Exposer metriques SLO.
- Entree: events pipeline.
- Sortie: dashboard + alertes.
- CA: 7 metriques minimales disponibles.
- Tests: smoke tests monitoring.
2. Tache: Executer runbook rollback.
- Entree: scenario incident.
- Sortie: rollback < 5 min.
- CA: procedure validee en staging.
- Tests: exercice operational.

## Phase F - Validation preprod
1. Tache: Campagne de tests complete.
- Entree: build candidate.
- Sortie: rapport Go/No-Go.
- CA: 100% tests critiques pass.
- Tests: unit/integration/load/security/chaos.

## 10. Annexes

## 10.1 Documentation plateformes
1. Whapi docs:
- https://whapi.cloud/docs
2. Meta WhatsApp Cloud API webhooks:
- https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

## 10.2 SQL checks pre-migration (obligatoires)
```sql
-- Channels sans tenant (apres ajout colonne)
SELECT COUNT(*) AS channels_without_tenant
FROM channels
WHERE tenant_id IS NULL OR tenant_id = '';

-- Doublons provider/external_id
SELECT provider, external_id, COUNT(*) c
FROM channels
GROUP BY provider, external_id
HAVING c > 1;

-- Collision messages potentielle sur future cle
SELECT tenant_id, provider, provider_message_id, direction, COUNT(*) c
FROM whatsapp_message
GROUP BY tenant_id, provider, provider_message_id, direction
HAVING c > 1;
```

## 10.3 Table metriques et seuils SLO
| Metrique | Seuil | Alerte |
|---|---|---|
| `webhook_latency_p95_ms` | <= 400 | WARN > 400, CRIT > 700 |
| `webhook_latency_p99_ms` | <= 900 | WARN > 900, CRIT > 1200 |
| `webhook_error_rate` | < 1% | WARN >= 1%, CRIT >= 3% |
| `webhook_signature_invalid_total` | observabilite | spike > baseline x3 |
| `tenant_resolution_failed_total` | 0 attendu nominal | CRIT > 0 soutenu |
| `webhook_duplicate_total` | attendu selon retries | spike > baseline x2 |
| `idempotency_ttl_purge_total` | job quotidien | CRIT si job absent 24h |

## 10.4 Mapping HTTP codes normatifs
| Code | Signification |
|---|---|
| 200 | Traite ou duplicate ignore |
| 202 | Accepte pour traitement async |
| 400 | Payload invalide |
| 401 | Secret absent/invalide |
| 403 | Signature invalide |
| 409 | Conflit idempotency non resolvable |
| 422 | Channel/mapping tenant invalide |
| 429 | Quota/rate-limit depasse |
| 500 | Erreur interne |

