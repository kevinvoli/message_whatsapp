# Addendum de Securite - Architecture Webhook Multi-Provider

Date d'effet: 2026-02-14  
Portee: Correctifs contractuels obligatoires suite au verdict audit externe `NO-GO`.

## 1. Decisions correctives finales
1. Unicite `channels` definitive:
- Contrainte unique normative: `(provider, external_id)`.
- Contrainte complementaire obligatoire: `(tenant_id, provider, external_id)` en index non-unique pour audit et performance.
- Regle de gouvernance: un `external_id` provider ne peut appartenir qu'a un seul tenant actif.
2. Idempotency definitive:
- Cle normative: `tenant_id + provider + provider_message_id + event_type + direction`.
- Fallback normatif: `tenant_id + provider + payload_hash + event_type + minute_bucket`.
3. Signature provider:
- Meta et Whapi sont soumis au meme niveau de validation cryptographique et au meme mode `fail-closed`.
4. HTTP mapping normatif:
- `200`: traite ou duplicate ignore.
- `202`: accepte pour traitement asynchrone.
- `400`: payload invalide schema.
- `401`: secret/credentials absents ou invalides.
- `403`: signature invalide ou acces refuse.
- `409`: conflit idempotency non resolvable.
- `422`: channel inconnu ou mapping tenant invalide.
- `429`: quota/rate-limit depasse.
- `500`: erreur interne.
5. NO-GO leve uniquement apres validation des sections 2 a 9.

## 2. Invariants de securite renforces
1. Toute requete webhook DOIT etre authentifiee avant toute resolution tenant.
2. Toute requete webhook sans preuve cryptographique valide DOIT etre rejetee.
3. Toute operation metier DOIT etre scopee par `tenant_id`.
4. Tout message websocket DOIT etre scope par `tenant_id` et `session_id`.
5. Toute ecriture idempotency DOIT etre atomique avec contrainte d'unicite active.
6. Toute anomalie de signature DOIT etre metrisee et alertee en temps reel.
7. Tout secret provider DOIT etre gere via secret manager centralise.
8. Toute route webhook DOIT etre protegee par limite de debit et controle d'abus.

## 3. Politique anti-flood et resilience
1. Rate limiting obligatoire:
- Global ingress: `300 req/s` par instance.
- Par provider: `150 req/s` par provider et par instance.
- Par IP source: `60 req/s` moyenne glissante 60 s.
2. Quotas tenant:
- Burst max par tenant: `1200 events/min`.
- Au-dela: reponse `429` + backoff recommande.
3. Backpressure obligatoire:
- Si latence p95 > `800 ms` pendant 5 min, mode degrade active:
- priorite aux verifications cryptographiques + idempotency,
- traitements non critiques reportes.
4. Circuit breaker obligatoire:
- ouverture si `error_rate >= 5%` sur 5 min.
5. WAF/reverse proxy obligatoire:
- blocage automatique des patterns malveillants (payload oversized, signatures malformed repetitives).
6. Taille maximale payload:
- `1 MB` par webhook, au-dela rejet `413`.

## 4. Specification cryptographique normative
1. Source de verification:
- Les bytes verifies DOIVENT etre strictement `rawBody` HTTP.
- Si `rawBody` indisponible en production: rejet `500` + alerte critique.
2. Algorithme:
- HMAC SHA-256 obligatoire pour Meta et Whapi.
3. Headers de preuve:
- Meta: `x-hub-signature-256`.
- Whapi: header secret configure (`WHAPI_WEBHOOK_SECRET_HEADER`) + valeur attendue.
4. Comparaison:
- `timing-safe compare` obligatoire.
5. Canonicalisation:
- Interdite pour verification signature; aucune reserialisation JSON autorisee.
6. Rotation:
- Double secret supporte (secret courant + secret precedent) pendant `24 h` maximum.
7. Rejeu:
- Toute signature valide mais event deja connu DOIT etre neutralisee par idempotency.

## 5. Isolation multi-tenant renforcee (DB + WS)
1. DB:
- Colonnes `tenant_id` obligatoires sur `channels`, `whatsapp_chat`, `whatsapp_message`, `whatsapp_media`, `webhook_event_log`.
- Uniques composites obligatoires:
- `whatsapp_chat (tenant_id, chat_id)`
- `whatsapp_message (tenant_id, provider, provider_message_id, direction)`
- `webhook_event_log (tenant_id, provider, event_key)`
2. Resolution tenant:
- Uniquement via DB par `(provider, external_id)`.
- Aucun `tenant_id` issu du payload entrant n'est accepte comme source d'autorite.
3. WS:
- Namespace/room obligatoire: `tenant:{tenant_id}`.
- JWT obligatoire contenant `tenant_id`, `sub`, `exp`, `jti`.
- Verification de coherence `tenant_id` JWT vs conversation/message avant emission.
- Revalidation session WS toutes les `15 min`.
4. Tests anti-fuite:
- Test d'intrusion cross-tenant WS et DB obligatoire avant chaque release majeure.

## 6. Politique de gestion des secrets
1. Stockage:
- Secrets uniquement en secret manager (jamais en code, jamais en `.env` production).
2. Rotation:
- Rotation obligatoire tous les `90 jours`.
- Rotation immediate (< `15 min`) en cas d'incident.
3. Acces:
- Principe du moindre privilege, RBAC strict.
4. Audit:
- Journalisation de tout acces/lecture/rotation.
5. Redaction logs:
- Aucun secret en clair dans logs/metriques/traces.
6. Revocation:
- Procedure de revocation documentee et testee trimestriellement.

## 7. SLO et metriques obligatoires
1. SLO disponibilite webhook: `99.95%` mensuel.
2. SLO latence:
- `p95 <= 400 ms`
- `p99 <= 900 ms`
3. SLO erreur:
- `webhook_error_rate < 1%` sur 15 min.
4. SLO securite:
- `signature_invalid_rejected = 100%`.
5. MTTR incident P1:
- `<= 30 min`.
6. Metriques obligatoires:
- `webhook_received_total{provider,tenant_id}`
- `webhook_duplicate_total{provider,tenant_id}`
- `webhook_signature_invalid_total{provider}`
- `tenant_resolution_failed_total{provider}`
- `webhook_latency_ms_bucket{provider}`
- `webhook_error_total{provider,error_class}`
- `ws_cross_tenant_block_total`
- `idempotency_ttl_purge_total`

## 8. Tests obligatoires de securite
1. Tests signatures:
- Meta et Whapi, cas valides/invalides, headers manquants, rawBody absent.
2. Tests replay:
- same event x10, resultat unique persiste.
3. Tests spoofing tenant:
- `external_id` valide mauvais tenant doit etre rejete.
4. Tests flood:
- `2000 msg/min` nominal, `5000 msg/min` stress, verification quotas et 429.
5. Tests WS isolation:
- tentative abonnement a room d'un autre tenant doit echouer.
6. Tests secrets:
- rotation secret sans downtime.
7. Seuil de succes:
- 100% des tests securite critiques passants avant GO.

## 9. Conditions de levee du NO-GO
1. Toutes les decisions de section 1 implementees et auditees.
2. Tous les invariants sections 2 a 6 verifies en staging.
3. SLO section 7 tenus sur `7 jours` en pre-prod/staging.
4. Tests section 8 passes a `100%` sur la suite critique.
5. Runbook rollback execute avec succes (objectif rollback <= `5 min`).
6. Validation conjointe:
- CTO
- Security Lead
- SRE Lead
- DBA Lead

## 10. Signature CTO
Decision contractuelle: `NO-GO` maintenu tant que les conditions section 9 ne sont pas integralement satisfaites.  
Decision contractuelle: `GO` autorise uniquement sur preuves techniques horodatees et auditables.

Nom CTO: ____________________  
Date: ____________________  
Signature: ____________________

