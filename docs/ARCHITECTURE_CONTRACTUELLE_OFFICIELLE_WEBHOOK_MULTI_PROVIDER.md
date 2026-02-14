# Architecture Contractuelle Officielle - Webhook Multi-Provider

Date d'effet: 2026-02-14  
Portee: Plateforme SaaS multi-tenant traitant des webhooks WhatsApp `Whapi` et `Meta`.

## 1. Objectif stratégique
La plateforme doit traiter de maniere fiable, securisee et scalable les webhooks multi-provider via un modele interne unique `UnifiedMessage`, avec isolation stricte par `tenant_id`, migration progressive sans downtime, et capacite de rollback immediate.

## 2. Invariants non negociables
1. Toute operation de lecture/ecriture message, chat, media et idempotency DOIT inclure `tenant_id`.
2. La resolution tenant DOIT etre realisee exclusivement via la base: `(provider, external_id) -> tenant_id`.
3. La signature Meta (`x-hub-signature-256`) DOIT etre validee en mode `fail-closed` en production.
4. Aucune requete webhook Meta sans signature valide NE DOIT etre acceptee.
5. La cle d'idempotency finale DOIT etre:  
`tenant_id + provider + provider_message_id + event_type + direction`.
6. En absence de `provider_message_id`, le fallback DOIT utiliser `payload_hash` borne temporellement.
7. Le domaine metier NE DOIT PAS dependre des schemas payload providers.
8. Le pipeline legacy et le pipeline unified DOIVENT pouvoir coexister temporairement.
9. L'activation Meta en production NE DOIT PAS preceder la stabilisation Whapi sur pipeline unified.
10. Aucune migration destructive (drop/rename irreversibles) NE DOIT etre executee avant stabilisation complete.

## 3. Modele logique cible (entites + relations)
1. `channels`
- Colonnes contractuelles: `id`, `tenant_id`, `provider`, `external_id`, `status`, `created_at`, `updated_at`.
- Contrainte: unicite `(provider, external_id)` et `(tenant_id, provider, external_id)`.
2. `whatsapp_chat`
- Colonnes contractuelles: `id`, `tenant_id`, `chat_id`, `channel_id`, `poste_id`, `status`, timestamps.
- Contrainte: unicite `(tenant_id, chat_id)`.
3. `whatsapp_message`
- Colonnes contractuelles: `id`, `tenant_id`, `provider`, `provider_message_id`, `chat_id`, `channel_id`, `direction`, `type`, `text`, `status`, timestamps.
- Contrainte: unicite `(tenant_id, provider, provider_message_id, direction)`.
4. `whatsapp_media`
- Colonnes contractuelles: `id`, `tenant_id`, `provider`, `provider_media_id`, `message_id`, metadata media.
5. `webhook_event_log`
- Colonnes contractuelles: `id`, `tenant_id`, `provider`, `event_type`, `direction`, `provider_message_id`, `event_key`, `payload_hash`, `created_at`.
- Contrainte: unicite `event_key`.

## 4. Flux webhook final (etapes detaillees)
1. Reception HTTP webhook (`/webhooks/{provider}`).
2. Validation signature provider.
3. Rejet immediat en cas de signature invalide (403).
4. Extraction `external_id` du channel provider.
5. Resolution tenant en DB via `(provider, external_id)`.
6. Rejet immediat si mapping absent/invalide (403/422).
7. Adaptation payload provider -> `UnifiedMessage`/`UnifiedStatus`.
8. Construction cle idempotency.
9. Enregistrement idempotency atomique.
10. Si duplicat: acquittement controle sans retraitement.
11. Traitement metier: dispatch conversation, persistence message/media, notification gateway.
12. Emission metriques et traces.
13. Reponse HTTP provider dans SLA contractuel.

## 5. Architecture technique cible
Composants:
1. `WebhookController` (point d'entree provider-aware).
2. `SignatureGuard` (validation cryptographique).
3. `TenantResolverService` (DB-only).
4. `ProviderAdapterRegistry` (`WhapiAdapter`, `MetaAdapter`, extensible).
5. `UnifiedIngressService` (orchestration unifiee).
6. `IdempotencyService` (event key atomique).
7. `InboundMessageService` (logique metier provider-agnostic).
8. `Persistence layer` (TypeORM + contraintes multi-tenant).
9. `Realtime Gateway` (notification clients).
10. `Metrics/Tracing` (observabilite contractuelle).

Diagramme ASCII:
```text
[WebhookController]
        |
        v
[SignatureGuard] --> reject(403)
        |
        v
[TenantResolverService (DB)]
        |
        v
[ProviderAdapterRegistry]
        |
        v
[UnifiedIngressService]
        |
        +--> [IdempotencyService] --> duplicate => ack
        |
        v
[InboundMessageService]
   |        |          |
   v        v          v
[Dispatch] [Persist] [Gateway]
        |
        v
[Metrics + Audit Trail]
```

## 6. Idempotency & securite
1. Idempotency:
- Cle primaire contractuelle: `tenant_id + provider + provider_message_id + event_type + direction`.
- Fallback contractuel: `tenant_id + provider + payload_hash + event_type + minute_bucket`.
- Ecriture idempotency DOIT etre atomique (unique constraint + gestion duplicate key).
2. Signature:
- Meta: HMAC SHA-256 sur `rawBody`, header `x-hub-signature-256`.
- Production: mode `fail-closed` obligatoire.
3. Protection replay:
- Toute relecture d'evenement identique DOIT etre neutralisee par idempotency.
4. Validation payload:
- Rejet de payload non conforme schema adapter.

## 7. Multi-tenant isolation contractuelle
1. `tenant_id` est obligatoire sur toutes les tables coeur.
2. Toute requete applicative DOIT filtrer par `tenant_id`.
3. Les cles uniques DOIVENT etre scopees tenant.
4. Les evenements websocket DOIVENT etre emis uniquement dans le scope tenant cible.
5. Toute tentative de channel spoofing DOIT etre rejetee avant traitement metier.

## 8. Observabilite obligatoire
Metriques minimales obligatoires:
1. `webhook_received_total{provider,tenant_id}`
2. `webhook_duplicate_total{provider,tenant_id}`
3. `webhook_signature_invalid_total{provider}`
4. `webhook_error_total{provider,tenant_id,error_class}`
5. `webhook_latency_ms_p95{provider}`
6. `tenant_resolution_failed_total{provider}`
7. `idempotency_insert_conflict_total{provider,tenant_id}`

Exigences:
1. Dashboard production temps reel obligatoire.
2. Alertes critiques obligatoires (erreur > seuil, signature invalid spike, p95 depasse).
3. Logs structures obligatoires: `request_id`, `provider`, `external_id`, `tenant_id`, `event_key`.

## 9. Definition of Done globale
1. Tous les invariants de section 2 sont verifies en tests et en staging.
2. Pipeline unified actif a 100% pour Whapi sans regression.
3. Meta active uniquement apres stabilisation Whapi.
4. Backfill DB termine et valide.
5. Aucune fuite cross-tenant detectee en tests de securite.
6. Runbook rollback execute avec succes en simulation.
7. Metriques obligatoires visibles et alertees.
8. Migration sans downtime constatee en production.

## 10. Conditions GO production
1. Signature Meta `fail-closed` active.
2. Mapping `(provider, external_id) -> tenant_id` complet, unique, audite.
3. Cle idempotency finale active et indexee.
4. Tests staging valides:
- 2000 msg/min
- duplicates
- signatures invalides
- tentative spoofing
5. Error rate webhook < 1% sur fenetre de validation.
6. p95 latence conforme SLO defini.
7. Validation formelle CTO + Tech Lead + Security Lead.

## 11. Conditions de rollback
Declenchement rollback immediat si:
1. suspicion de fuite cross-tenant.
2. invalidation de signature non appliquee.
3. degradation severe SLO (erreur ou latence) persistante.
4. duplication fonctionnelle non contenue.

Procedure:
1. Desactiver `FF_PROVIDER_META_ENABLED`.
2. Desactiver `FF_UNIFIED_WEBHOOK_ROUTER`.
3. Maintenir migrations additives (pas de rollback destructif DB).
4. Revenir au chemin legacy stable.
5. Ouvrir incident majeur avec timeline et owner.

## 12. Plan de stabilisation post-migration
1. Fenetre J+1 a J+7: monitoring renforce, revue quotidienne metriques.
2. Fenetre J+8 a J+14: activation progressive Meta par cohortes de tenants.
3. Fenetre J+15+: suppression controlee du pipeline legacy apres preuve de stabilite.
4. Post-mortem obligatoire sur toute alerte P1/P2.

## 13. Decisions figees (architecture freeze)
1. `UnifiedMessage` est le contrat unique du domaine.
2. Tenant resolution est DB-only, sans exception.
3. Idempotency key finale est figee et non negociable.
4. Signature Meta fail-closed est figee et non negociable.
5. Migration est progressive, reversible, sans downtime.
6. Risques acceptes:
- double pipeline temporaire (complexite operationnelle maitrisee).
- schema additive temporairement redondant.
7. Risques refuses:
- activation Meta sans signature stricte.
- absence de `tenant_id` sur flux coeur.
- resolution tenant hors DB.
- migration destructive pre-stabilisation.
8. Responsabilites techniques:
- Backend Lead: implementation conforme invariants.
- DBA Lead: schema, index, backfill, contraintes.
- Security Lead: signature, anti-spoofing, audit de fuite.
- SRE Lead: metriques, alerting, rollback execution.
- CTO: GO/NO-GO final et arbitrage risque.

## 14. Signature de validation CTO
Decision contractuelle: `NO-GO` tant que toutes les Conditions GO production (section 10) ne sont pas satisfaites.  
Decision contractuelle: `GO` uniquement apres validation objective des preuves techniques, metriques et tests de securite.

Nom CTO: ____________________  
Date: ____________________  
Signature: ____________________

