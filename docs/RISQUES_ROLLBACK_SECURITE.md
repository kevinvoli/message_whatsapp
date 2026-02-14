# Risques, Rollback, Performance, Securite

Date: 2026-02-14

## 1) Rollback critique si migration echoue

## Plan rollback code
1. Garder les anciens endpoints et ancien flux en place pendant toute la migration.
2. Rollback instantane via flags:
- `FF_PROVIDER_META_ENABLED=false`
- `FF_UNIFIED_WEBHOOK_ROUTER=false`
- `FF_ENFORCE_TENANT_DB_RESOLUTION=false` (temporaire uniquement, urgence)
3. Conserver release N-1 deployable a chaud.

## Plan rollback DB
1. Ne jamais faire de migration destructive pendant la phase de transition.
2. En cas d'incident:
- garder les colonnes ajoutees (pas de drop)
- rollback code seulement
3. Si une contrainte nouvelle casse la prod:
- desactiver contrainte/index problematique
- revenir en mode ecriture legacy

## Plan rollback feature flags
1. Runbook de 5 minutes:
- couper Meta (`FF_PROVIDER_META_ENABLED=false`)
- rerouter vers legacy (`FF_UNIFIED_WEBHOOK_ROUTER=false`)
- surveiller erreurs 10 minutes
2. Runbook de 30 minutes:
- rediriger traffic webhook vers endpoints legacy uniquement
- bloquer tenants pilotes Meta

## 2) Complexite reelle et erreurs probables

## Niveau de risque global
- Risque: **8/10** (migration architecture + multi-tenant + webhook critique temps reel).

## 3 erreurs les plus probables
1. Mauvaise resolution tenant:
- `channel_id` accepte sans verification DB stricte.
2. Idempotency incomplete:
- dedupe uniquement par payload hash ou mauvaise cle composee.
3. Ordre des effets secondaires modifie:
- message sauve avant assignation, ou double emission gateway.

## 3) Performance concrete sans queue

## Estimation seuil de souffrance (systeme actuel)
- Souffrance probable: **entre 1 500 et 2 500 messages/min** soutenus.
- Zone critique: **3 000+ messages/min**.
- A **10 000 messages/min**, saturation tres probable.

## Base de calcul (ordre de grandeur)
1. Par message entrant (moyenne):
- 1 insert dedupe `webhook_event_log`
- 1 select chat
- 1 logique dispatch + update/insert chat
- 1 select duplicate message
- 1 select channel
- 1 upsert contact
- 1 insert message
- 0..N inserts media
- 1 select message complet (relations)
- 1 emission websocket
2. Cela donne souvent 7 a 12 operations DB + 1 event websocket par message.
3. Sans queue, le thread HTTP reste expose aux ralentissements DB et WS.

## 4) Securite multi-tenant (scenario d'attaque realiste)

## Scenario d'attaque realiste
1. Attaquant obtient un `channel_id` valide d'un autre tenant (logs, fuite interne, brute force faible entropie).
2. Il envoie des webhooks structures avec ce `channel_id`.
3. Si la resolution tenant n'est pas DB-only et stricte, les messages sont rattaches au mauvais tenant.
4. Effet:
- contamination de conversations
- fuite de donnees cross-tenant
- notifications WS chez le mauvais client.

## Correctifs obligatoires
1. Signature provider obligatoire (fail-closed), jamais optionnelle en prod.
2. Resolution tenant exclusivement via DB: `(provider, external_channel_id) -> tenant_id`.
3. Toutes les writes et reads filtrees par `tenant_id`.
4. Contraintes DB:
- uniques composites avec `tenant_id`.
5. Audit trail securite:
- loguer `provider`, `tenant_id`, `channel_id`, `signature_valid`, `request_id`.

## 5) Scenario catastrophe (etat actuel)

Hypothese:
- Meta envoie 5000 messages en 1 minute.
- DB ralentit.
- Gateway crash.
- Whapi envoie retries.

## Ce qui se passe probablement
1. Endpoint webhook accumule latence.
2. Timeouts HTTP possibles -> providers reessaient.
3. Dedupe absorbe une partie, mais pression write explose sur `webhook_event_log`.
4. `handleIncomingMessage` subit contention DB (assign/save/select relations).
5. Si gateway crash, persistance peut continuer partiellement mais notifications temps reel perdues.
6. Retries + lenteur DB = amplification charge.
7. Sans queue, pas de lissage; risque de backlog et incidents en cascade.

## 6) Parties a refuser de deployer en l'etat (responsabilite legale)

Je refuserais de deployer en production large echelle tant que ces points ne sont pas corriges:
1. Resolution tenant non strictement DB-only.
2. Verification signature desactivee si secret absent (mode permissif).
3. Absence de queue pour absorber pics/retries.
4. Contraintes DB non multi-tenant (uniques globales non scopees par tenant).
5. Absence de tests d'integration de charge + securite webhook.

## 7) Check-list go/no-go minimale
1. Feature flags et rollback verifies en staging.
2. Signature checks stricts Whapi + Meta valides.
3. Tenant isolation testee (tests de fuite cross-tenant).
4. Idempotency prouvee sous retries.
5. Test de charge >= trafic pic attendu (au moins x2 marge).

