# Go / No-Go Readiness Review

Date: 2026-02-14
Scope: Migration webhook multi-provider (`Whapi` + `Meta`) avec normalisation `UnifiedMessage`.

## Decision globale
- Statut: `NO-GO` pour production aujourd'hui.
- Raison: prerequis critiques non verifies en base reelle et signature Meta en mode permissif dans le code actuel.

## Etape 1 - Architecture cible figee

## Verdict coherence (plan + DB + idempotency + tenant + unified)
- Verdict: coherence globale bonne, mais 4 incoherences structurelles a corriger avant implementation.

### Incoherence 1
- Sujet: unicite `chat_id` globale (`whatsapp_chat`) incompatible multi-tenant.
- Correction figee:
- cible: unique composite `(tenant_id, chat_id)`.

### Incoherence 2
- Sujet: couplage schema `WhapiChannel` / `channel_id` partout.
- Correction figee:
- cible: table logique `channels` avec `provider`, `external_id`, `tenant_id`.

### Incoherence 3
- Sujet: idempotency actuelle sans `tenant_id`.
- Correction figee:
- cible: cle finale inclut `tenant_id`.

### Incoherence 4
- Sujet: `metaToWhapi()` force Meta dans un format Whapi.
- Correction figee:
- cible: adapters provider -> `UnifiedMessage`, domaine independant provider.

## Decisions definitives (freeze)
1. Modele interne: `UnifiedMessage` + `UnifiedStatus` (unique reference domaine).
2. Resolution tenant: DB-only via `(provider, external_id)` dans `channels`.
3. Idempotency key finale:
- `tenant_id + provider + provider_message_id + event_type + direction`
- fallback si pas d'id: `tenant_id + provider + payload_hash + event_type + minute_bucket`.
4. Signature Meta:
- production doit refuser toute requete sans signature valide (`fail-closed`).
5. Activation Meta:
- interdite tant que points 2/3/4 ne sont pas actifs en prod.

## Etape 2 - Audit prerequis critiques

## 2.1 Tenant resolution (CRITIQUE)
- Etat actuel: `NON VERIFIE` factuellement (client `mysql` indisponible dans cet environnement).
- Commande tentee: `mysql -u root -D whatsappflow ...` -> `CommandNotFoundException`.
- Decision: `STOP migration` jusqu'a execution des checks SQL ci-dessous dans l'environnement DB reel.

### SQL de verification obligatoire
```sql
-- A. channels sans tenant
SELECT COUNT(*) AS channels_without_tenant
FROM whapi_channels
WHERE tenant_id IS NULL OR tenant_id = '';

-- B. doublons provider/external_id
SELECT provider, external_id, COUNT(*) c
FROM whapi_channels
GROUP BY provider, external_id
HAVING c > 1;

-- C. tenant incoherent pour un meme provider+external_id
SELECT provider, external_id, COUNT(DISTINCT tenant_id) tenant_count
FROM whapi_channels
GROUP BY provider, external_id
HAVING tenant_count > 1;
```

### Critere de passage
- `channels_without_tenant = 0`
- aucun doublon provider/external_id
- aucun external_id mappe a plusieurs tenants

## 2.2 Idempotency key finale
- Decision: `OUI`, cle finale figee:
- `tenant_id + provider + provider_message_id + event_type + direction`.
- Statut readiness: `GO` conceptuel, `NO-GO` execution tant que colonnes/index ne sont pas deployes.

## 2.3 Signature enforcement Meta
- Decision ferme: `OUI`, la prod doit refuser toute requete sans signature valide.
- Etat code actuel: `NO` (si `WHATSAPP_APP_SECRET` absent, verification bypass).
- Statut readiness: `NO-GO` pour Meta tant que fail-closed non actif.

## 2.4 Observabilite minimale
- Exigence avant migration:
1. `webhook_duplicates_total`
2. `webhook_signature_invalid_total`
3. `webhook_latency_p95_ms`
4. `webhook_error_rate`
- Etat actuel: partiellement present (logs), compteurs non confirmes.
- Statut readiness: `NO-GO` tant que compteurs dashboard/alertes pas actifs.

## Etape 3 - Staging simulation obligatoire avant prod

## Scenarios a executer
1. 2000 messages/min pendant 15 min (Whapi + Meta).
2. 10% duplicates (retries providers).
3. 5% signatures invalides (Meta).
4. tentative channel spoofing (provider/external_id non autorise).

## Criteres d'acceptation
1. Aucun echange cross-tenant.
2. `signature_invalid_total` incremente et requetes rejetees (403).
3. `duplicate` non persiste (1 message logique = 1 enregistrement).
4. p95 webhook < 500 ms (sans queue) ou < 150 ms (avec queue + ack rapide).
5. error rate < 1%.

## Gate de decision CTO (obligatoire)
- `GO` seulement si tous les criteres sont verts 24h en staging.
- sinon `NO-GO`.

## Ce que je refuserais de deployer en l'etat (responsabilite legale)
1. Meta active sans `fail-closed` signature.
2. tenant resolution non strictement DB-only.
3. absence de tests de non-fuite cross-tenant.
4. absence de metriques d'alerte webhook.
5. migration destructive DB avant stabilisation.

