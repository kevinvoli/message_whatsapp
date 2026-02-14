# WEBHOOK MIGRATION RUNBOOK

Date: 2026-02-14
Owner: Platform/Backend Lead
Approver: CTO (ou Incident Commander en astreinte)

## 1) Objectif
- Activer migration webhook multi-provider de maniere reversible en moins de 5 minutes.

## 2) Feature flags officiels
- `FF_UNIFIED_WEBHOOK_ROUTER`
- `FF_PROVIDER_META_ENABLED`
- `FF_ENFORCE_TENANT_DB_RESOLUTION`

## 3) Comment activer un flag
1. Changer la valeur dans la source de config (env/secret manager/config service).
2. Redemarrer les pods/process concernes si config non hot-reload.
3. Verifier via endpoint health/config interne que le flag est bien applique.

## 4) Comment desactiver un flag
1. Revenir a `false` dans la source de config.
2. Redemarrer pods/process si necessaire.
3. Verifier:
- baisse immediate du trafic sur le nouveau chemin
- erreurs stabilisees.

## 5) Rollback en 5 minutes (procedure standard)
1. `T+0`:
- `FF_PROVIDER_META_ENABLED=false`
- `FF_UNIFIED_WEBHOOK_ROUTER=false`
2. `T+1 min`:
- verifier taux erreur webhook descend.
3. `T+2 min`:
- confirmer absence de nouveaux 5xx.
4. `T+3 min`:
- confirmer dedupe et persistance fonctionnent via legacy path.
5. `T+5 min`:
- incident passe en mode observation.

## 6) Qui decide le rollback
- Decisionnaire primaire: Incident Commander (on-call senior).
- Validation finale: CTO ou Tech Lead plateforme.
- Si risque fuite cross-tenant suspecte: rollback immediat sans attendre validation.

## 7) Verification "tout est OK"

## SLO/SLI minimum
1. `webhook_error_rate < 1%`
2. `webhook_latency_p95_ms` sous seuil defini
3. `webhook_signature_invalid_total` coherent avec tests/attaques attendues
4. `webhook_duplicates_total` stable
5. aucun incident cross-tenant

## Checks fonctionnels
1. message entrant visible dans le bon tenant
2. status update applique au bon message
3. gateway envoie au bon agent/tenant
4. retries provider n'engendrent pas de doublons

## 8) Preconditions strictes avant activation Meta en prod
1. Signature validation `fail-closed` active.
2. Mapping `channels(provider, external_id) -> tenant_id` propre et unique.
3. Cle idempotency finale active et indexee.
4. Dashboard + alerting operationnels.
5. test staging complet valide.

## 9) Communication incident
1. Ouvrir canal incident.
2. Poster timeline toutes les 5 minutes.
3. Documenter:
- heure de bascule
- flags modifies
- impact client
- decision GO/NO-GO.

