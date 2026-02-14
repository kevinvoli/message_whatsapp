# Audit Securite Externe - Angles Morts et Hypotheses Implicites

Document audite: `docs/ARCHITECTURE_CONTRACTUELLE_OFFICIELLE_WEBHOOK_MULTI_PROVIDER.md`  
Date: 2026-02-14  
Posture: audit externe independant.

## Synthese
- Niveau de maturite: bon cadre contractuel.
- Decision audit: `NO-GO` tant que les points critiques ci-dessous ne sont pas traites.

## Findings

## Critique
1. Incoherence d'unicite sur `channels`  
Ref: `docs/ARCHITECTURE_CONTRACTUELLE_OFFICIELLE_WEBHOOK_MULTI_PROVIDER.md:25`  
Constat: double contrainte annoncee `(provider, external_id)` et `(tenant_id, provider, external_id)`.  
Risque cache: contradiction de modele. Si `(provider, external_id)` est globalement unique, la seconde est redondante et empeche certains modes d'hebergement multi-tenant.  
Action: choisir une seule verite contractuelle. Recommande:
- soit unicite globale `(provider, external_id)` si un numero/appartenance tenant est strictement unique plateforme,
- soit unicite tenant-scopee `(tenant_id, provider, external_id)` si mutualisation possible.

2. Rejeu temporel non borne explicitement  
Ref: `...:97`, `...:103`  
Constat: fallback idempotency avec `minute_bucket` mais sans fenetre TTL normative, ni politique de retention.  
Risque cache: replay tardif non bloque de facon deterministic, ou explosion de table idempotency.  
Action: fixer des invariants:
- TTL idempotency (ex: 14 jours),
- retention/purge (job quotidien),
- fenetre d'acceptation temporelle provider.

3. Absence de contrat anti-deni de service  
Ref: flux et architecture `...:38-64`, observabilite `...:114-127`  
Constat: aucune exigence normative de rate limiting/WAF/circuit breaker.  
Risque cache: flood webhook peut provoquer saturation DB et indisponibilite multi-tenant.  
Action: ajouter invariants:
- rate-limit IP/provider,
- quota tenant,
- seuils d'auto-protection (429/503),
- backpressure.

## Eleve
4. Authentification Whapi non contractuelle  
Ref: invariants `...:12-13` traitent Meta seulement.  
Constat: aucune regle explicite pour validation secretes Whapi.  
Risque cache: surface d'entree asymetrique entre providers.  
Action: formaliser `Signature/secret verification` pour chaque provider, dont Whapi.

5. Ambiguite de statut HTTP de rejet mapping tenant  
Ref: `...:44` (`403/422`)  
Constat: deux codes possibles sans regle fixe.  
Risque cache: comportements heterogenes, telemetry et alerting difficiles.  
Action: figer mapping:
- `403` pour auth/signature/secret invalides,
- `422` pour payload valide mais channel inconnu.

6. Isolation DB deployee mais non verifiee au niveau execution SQL  
Ref: `...:109`, `...:110`  
Constat: obligation de filtrer par tenant en applicatif, mais pas de garde au niveau DB (RLS, vues securisees, policies).  
Risque cache: une regression code peut bypasser filtre tenant.  
Action: imposer defense en profondeur:
- contraintes composites,
- vues/procedures scopees tenant,
- audit SQL/requetes sensibles.

7. WebSocket isolation non detaillee  
Ref: `...:111`  
Constat: obligation formulee, pas de mecanisme contractuel (namespace, claims JWT, binding tenant-room).  
Risque cache: fuite cross-tenant en diffusion temps reel.  
Action: fixer contrat WS:
- room key inclut tenant,
- autorisation a la connexion + revalidation periodique,
- tests d'intrusion WS.

8. Preuve cryptographique non detaillee  
Ref: `...:100-101`  
Constat: HMAC mentionne, mais pas de normalisation du calcul (raw body exact, canonicalization interdite, comparaison constante).  
Risque cache: faux negatifs/positifs signature.  
Action: specifier:
- source bytes = `rawBody` strict,
- timing-safe compare obligatoire,
- rejet si `rawBody` absent en prod.

## Moyen
9. Definition of Done incomplète sur qualité de tests  
Ref: `...:129-137`  
Constat: DoD ne fixe pas seuils minimaux test (coverage critique, tests chaos, tests perf longue duree).  
Action: ajouter seuils:
- tests integration critiques 100% pass,
- test securite replay/spoofing obligatoire,
- charge min 2x pic nominal.

10. SLA non chiffre  
Ref: `...:51`, `...:149`  
Constat: mention "SLA contractuel" et "p95 conforme SLO defini" sans valeurs.  
Risque cache: impossibilite d'audit objectif GO/NO-GO.  
Action: figer valeurs numeriques:
- p95 webhook,
- erreur max,
- MTTR incident.

11. Absence de politique de gestion des secrets  
Ref: document entier  
Constat: pas de rotation/stockage/expiration des secrets providers.  
Risque cache: compromission durable si fuite secret.  
Action: ajouter politique:
- secret manager obligatoire,
- rotation trimestrielle,
- revocation immediate.

12. Absence de gouvernance des migrations de donnees sensibles  
Ref: `...:20`, `...:162`  
Constat: principe non destructif present, mais pas de plan de chiffrement, anonymisation, retention legale.  
Action: ajouter chapitre compliance:
- retention PII,
- chiffrement at-rest/in-transit,
- purge RGPD.

## Hypotheses implicites a expliciter
1. `provider_message_id` est stable et unique par provider (pas toujours garanti).  
2. Le `external_id` provider est non usurpable sans secret valide.  
3. La DB peut absorber idempotency writes en pic sans queue.  
4. Le legacy pipeline est suffisamment equivalent pour rollback sans derive fonctionnelle.  
5. Les adapters provider couvrent tous les types messages reels (pas seulement cas nominaux).

## Conditions de levee NO-GO (audit)
1. Corriger l'unicite `channels` en regle unique non contradictoire.  
2. Contractualiser anti-flood (WAF/rate-limit/backpressure).  
3. Ajouter validation provider Whapi equivalente a Meta.  
4. Figer codes HTTP de rejet et SLO chiffrés.  
5. Ajouter controles WS multi-tenant explicites et testes.  
6. Ajouter exigences cryptographiques detaillees sur signature et `rawBody`.

## Verdict externe
- `NO-GO` securite tant que les points `Critique` ne sont pas clos.  
- `GO conditionnel` possible apres cloture des points `Critique` + `Eleve`.

