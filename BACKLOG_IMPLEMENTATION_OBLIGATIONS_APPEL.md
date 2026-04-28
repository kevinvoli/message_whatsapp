# Backlog d'implementation - Obligations d'appel GICOP

Date : 2026-04-28  
Projet : plateforme WhatsApp / E-GICOP  
Source : `PLAN_IMPLEMENTATION_OBLIGATIONS_APPEL.md`

## 1. Objectif du backlog

Ce backlog transforme le plan d'implementation des obligations d'appel en tickets exploitables.

Regle cible :

```text
Les obligations d'appel sont desactivees par defaut.
L'admin peut les activer/desactiver.
Quand elles sont actives, la rotation est bloquee tant que :
- les 15 appels requis ne sont pas valides ;
- ou le commercial n'a pas la derniere reponse sur les 10 conversations du bloc actif.
```

## 2. Contraintes non negociables

1. Le controle qualite cible uniquement les 10 conversations du bloc actif.
2. Les obligations restent desactivees par defaut.
3. L'activation/desactivation se fait par l'admin.
4. Les appels DB2 sont lus en lecture seule.
5. Les etats operationnels restent dans DB1.
6. Aucun changement DB2 n'est introduit.

## 3. Vue globale des epics

| Epic | Nom | Priorite | Estimation |
| --- | --- | --- | --- |
| OBL-E01 | Controle qualite limite au bloc actif | P0 | 2 jours |
| OBL-E02 | Activation admin fiable | P0 | 1 jour |
| OBL-E03 | Robustesse validation appels | P1 | 2 jours |
| OBL-E04 | Supervision admin detaillee | P1 | 3 jours |
| OBL-E05 | Observabilite et diagnostic | P1 | 2 jours |
| OBL-E06 | Front commercial et textes | P2 | 1 jour |
| OBL-E07 | Tests et non-regression | P0/P1 | continu |

## 4. Epic OBL-E01 - Controle qualite limite au bloc actif

### OBL-001 - Identifier le bloc actif de 10 conversations

Priorite : P0  
Type : Backend  
Estimation : 0.5 jour  
Fichiers cibles :

```text
message_whatsapp/src/window/services/window-rotation.service.ts
message_whatsapp/src/window/services/validation-engine.service.ts
```

Description :

Ajouter ou extraire une methode permettant de lire uniquement les conversations du bloc actif courant d'un poste.

Signature recommandee :

```text
getActiveBlockConversations(posteId: string): Promise<WhatsappChat[]>
```

Regles de selection :

```text
poste_id = posteId
window_status = active
window_slot entre 1 et quotaActive
deletedAt IS NULL
orderBy window_slot ASC
limit quotaActive
```

Critères d'acceptation :

- La methode retourne au maximum le quota actif, normalement 10 conversations.
- Les conversations `locked` sont exclues.
- Les conversations `released` sont exclues.
- Les conversations hors bloc actif sont exclues.
- Le quota vient de `ConversationCapacityService.getQuotas()`.

Dependances :

- Aucune.

### OBL-002 - Adapter `runQualityCheck` au bloc actif

Priorite : P0  
Type : Backend  
Estimation : 0.75 jour  
Fichier cible :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
```

Description :

Modifier le controle qualite pour qu'il ne charge plus toutes les conversations actives du poste.

Comportement cible :

```text
runQualityCheck(posteId):
  charger les 10 conversations du bloc actif
  verifier uniquement ces conversations
  enregistrer quality_check_passed dans le batch actif
```

Critères d'acceptation :

- Une conversation active hors bloc actif ne fait pas echouer le controle.
- Une conversation du bloc actif avec dernier message client fait echouer le controle.
- Une conversation du bloc actif avec derniere reponse commerciale passe le controle.
- Si aucune conversation du bloc actif n'a de message client, le controle passe.

Dependances :

- OBL-001.

### OBL-003 - Executer le controle qualite du bloc actif avant decision de rotation

Priorite : P0  
Type : Backend  
Estimation : 0.5 jour  
Fichier cible :

```text
message_whatsapp/src/window/services/window-rotation.service.ts
```

Description :

Avant de decider que la rotation est bloquee par `quality_check_failed`, s'assurer que le controle qualite a ete calcule sur le bloc actif courant.

Comportement cible :

```text
si obligations activees:
  si appels complets:
    lancer/rafraichir le controle qualite bloc actif
  puis lire getStatus(posteId)
```

Critères d'acceptation :

- Le statut `qualityCheckPassed` est a jour au moment du check rotation.
- Si les appels sont incomplets, la raison reste `call_obligations_incomplete`.
- Si les appels sont complets mais qualite KO, la raison est `quality_check_failed`.
- Si appels complets + qualite OK, la rotation continue.

Dependances :

- OBL-002.

### OBL-004 - Ajuster le payload de blocage rotation

Priorite : P0  
Type : Backend + Front  
Estimation : 0.25 jour  
Fichiers cibles :

```text
message_whatsapp/src/window/services/window-rotation.service.ts
front/src/modules/realtime/services/socket-event-router.ts
front/src/store/chatStore.ts
```

Description :

S'assurer que le payload `WINDOW_ROTATION_BLOCKED` transporte un statut obligations coherent avec le bloc actif.

Critères d'acceptation :

- Le front recoit `obligations`.
- Le store met a jour `obligationStatus`.
- L'evenement local `obligations:reload` reste emis.

Dependances :

- OBL-003.

## 5. Epic OBL-E02 - Activation admin fiable

### OBL-005 - Confirmer le flag desactive par defaut

Priorite : P0  
Type : Backend config  
Estimation : 0.25 jour  
Fichier cible :

```text
message_whatsapp/src/system-config/system-config.service.ts
```

Description :

Verifier et documenter que :

```text
FF_CALL_OBLIGATIONS_ENABLED = false par defaut
```

Critères d'acceptation :

- Le defaultValue reste `false`.
- Aucun comportement bloquant n'est actif tant que l'admin n'active pas le flag.
- La configuration est visible dans l'admin.

Dependances :

- Aucune.

### OBL-006 - Renforcer le toggle admin

Priorite : P0  
Type : Admin front  
Estimation : 0.5 jour  
Fichier cible :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Description :

Ameliorer l'affichage du flag obligations.

Critères d'acceptation :

- Etat `Desactive` visible quand le flag est false.
- Message clair : la rotation n'est pas bloquee si desactive.
- Etat `Active` visible quand le flag est true.
- Apres changement, les statuts postes sont recharges.
- Le bouton gere loading et erreur.

Dependances :

- OBL-005.

### OBL-007 - Ajouter confirmation activation/desactivation

Priorite : P0  
Type : Admin front  
Estimation : 0.25 jour  
Fichier cible :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Messages :

```text
Activation : cette action bloquera la rotation tant que les appels et le controle qualite du bloc actif ne sont pas valides.
Desactivation : cette action permettra la rotation sans controle des obligations d'appel.
```

Critères d'acceptation :

- L'admin confirme avant activation.
- L'admin confirme avant desactivation.
- Annuler la confirmation ne modifie pas le flag.

Dependances :

- OBL-006.

## 6. Epic OBL-E03 - Robustesse validation appels

### OBL-008 - Ajouter idempotence par `call_event_id`

Priorite : P1  
Type : Backend  
Estimation : 0.75 jour  
Fichier cible :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
```

Description :

Avant de valider une tache, verifier si l'appel DB2 a deja ete utilise.

Regle :

```text
si call_task.call_event_id = params.callEventId existe:
  return { matched: false, reason: 'appel_deja_traite' }
```

Critères d'acceptation :

- Un meme appel ne peut pas valider deux taches.
- Le retour est explicite avec `appel_deja_traite`.
- Les appels nouveaux continuent de valider normalement.

Dependances :

- Aucune.

### OBL-009 - Corriger le curseur incremental DB2

Priorite : P1  
Type : Backend  
Estimation : 0.75 jour  
Fichier cible :

```text
message_whatsapp/src/order-call-sync/order-call-sync.service.ts
```

Description :

Utiliser `last_call_id` comme tie-breaker quand plusieurs appels DB2 ont le meme timestamp.

Condition cible :

```text
call_timestamp > lastCallTimestamp
OR (call_timestamp = lastCallTimestamp AND id > lastCallId)
```

Critères d'acceptation :

- Deux appels avec meme timestamp mais ids differents ne sont pas perdus.
- Le curseur continue de se mettre a jour avec timestamp + id.
- Le tri reste `call_timestamp ASC, id ASC`.
- Aucun changement DB2.

Dependances :

- Aucune.

### OBL-010 - Proteger `getOrCreateActiveBatch` contre la concurrence

Priorite : P1  
Type : Backend  
Estimation : 0.75 jour  
Fichiers cibles :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
message_whatsapp/src/redis/distributed-lock.service.ts
```

Description :

Eviter que deux instances creent deux batches pending pour le meme poste.

Approche recommandee :

```text
lock key = call-obligation-batch:{posteId}
```

Critères d'acceptation :

- Deux appels simultanes pour le meme poste ne creent qu'un seul batch.
- Si le lock n'est pas acquis, le service relit le batch actif.
- Le comportement reste compatible mono-instance.

Dependances :

- Aucune.

### OBL-011 - Aligner la regle client inconnu

Priorite : P1  
Type : Backend + Tests  
Estimation : 0.25 jour  
Fichier cible :

```text
message_whatsapp/src/call-obligations/__tests__/call-obligation.service.spec.ts
```

Regle retenue :

```text
client inconnu -> fallback jamais_commande
```

Critères d'acceptation :

- Les tests n'attendent plus `categorie_contact_inconnue`.
- Le comportement documente correspond au code.
- Le quota `jamais_commande` peut etre valide par fallback.

Dependances :

- Aucune.

## 7. Epic OBL-E04 - Supervision admin detaillee

### OBL-012 - Ajouter API detail des taches d'un poste

Priorite : P1  
Type : Backend API  
Estimation : 1 jour  
Fichiers cibles :

```text
message_whatsapp/src/call-obligations/call-obligation.controller.ts
message_whatsapp/src/call-obligations/call-obligation.service.ts
```

Nouvelle route :

```http
GET /call-obligations/poste/:posteId/tasks
```

Retour attendu :

```text
batchId
batchNumber
tasks[]
  id
  category
  status
  clientPhone
  callEventId
  durationSeconds
  completedAt
  createdAt
```

Critères d'acceptation :

- Route protegee par `AdminGuard`.
- Retourne le batch actif du poste.
- Retourne les taches triees par categorie puis statut.
- Retourne `null` ou liste vide si aucun batch actif.

Dependances :

- Aucune.

### OBL-013 - Ajouter expansion detaillee par poste dans admin

Priorite : P1  
Type : Admin front  
Estimation : 1 jour  
Fichier cible :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Description :

Permettre d'ouvrir une ligne poste pour voir ses taches.

Critères d'acceptation :

- L'admin voit les taches pending.
- L'admin voit les taches done.
- L'admin voit categorie, numero, duree, date de validation.
- Les donnees sont rechargeables.
- Etat loading/erreur gere.

Dependances :

- OBL-012.

### OBL-014 - Ajouter bouton controle qualite manuel par poste

Priorite : P1  
Type : Admin front  
Estimation : 0.5 jour  
Fichier cible :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

API existante :

```http
POST /call-obligations/quality-check/:posteId
```

Critères d'acceptation :

- L'admin peut lancer le controle qualite pour un poste.
- Le resultat est affiche.
- La ligne poste est rechargee.
- Le controle utilise le bloc actif, pas toutes les conversations actives.

Dependances :

- OBL-002.

### OBL-015 - Afficher le statut de synchronisation des appels

Priorite : P1  
Type : Admin front  
Estimation : 0.5 jour  
Fichier cible :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

API :

```http
GET /admin/order-sync/status
```

Afficher :

```text
DB2 disponible
dernier sync
nombre appels traites
nombre erreurs
```

Critères d'acceptation :

- L'admin voit si la sync appels fonctionne.
- Le statut est rechargeable.
- Si DB2 indisponible, l'admin voit une alerte claire.

Dependances :

- Aucune.

## 8. Epic OBL-E05 - Observabilite et diagnostic

### OBL-016 - Ajouter logs structures obligations

Priorite : P1  
Type : Backend  
Estimation : 0.75 jour  
Fichiers cibles :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
message_whatsapp/src/order-call-sync/order-call-sync.service.ts
```

Evenements :

```text
CALL_OBLIGATION_BATCH_CREATED
CALL_OBLIGATION_MATCHED
CALL_OBLIGATION_REJECTED
CALL_OBLIGATION_BATCH_CALLS_COMPLETE
CALL_OBLIGATION_QUALITY_PASSED
CALL_OBLIGATION_QUALITY_FAILED
CALL_OBLIGATION_READY_FOR_ROTATION
```

Critères d'acceptation :

- Les logs contiennent posteId, batchId, batchNumber si disponibles.
- Les rejets contiennent reason.
- Les appels contiennent callEventId et durationSeconds si disponibles.
- Aucun log ne contient de secret.

Dependances :

- OBL-008.

### OBL-017 - Normaliser les raisons de rejet

Priorite : P1  
Type : Backend  
Estimation : 0.5 jour  
Fichier cible :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
```

Raisons attendues :

```text
feature_disabled
duree_insuffisante
poste_introuvable
aucun_batch_actif
quota_categorie_atteint
appel_deja_traite
```

Critères d'acceptation :

- Les raisons sont stables et documentees.
- Les tests couvrent au moins trois raisons critiques.
- Les raisons sont exploitables par l'admin.

Dependances :

- OBL-008.

### OBL-018 - Exposer les derniers rejets dans l'admin

Priorite : P2  
Type : Backend + Admin front  
Estimation : 1 jour  
Fichiers cibles :

```text
message_whatsapp/src/integration-sync/integration-sync-log.service.ts
message_whatsapp/src/order-call-sync/order-sync-admin.controller.ts
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Description :

Afficher les derniers appels non comptabilises ou erreurs de sync.

Critères d'acceptation :

- L'admin voit les erreurs recentes.
- L'admin voit les raisons principales.
- Le diagnostic ne necessite pas d'aller lire les logs serveur.

Dependances :

- OBL-016.
- OBL-017.

## 9. Epic OBL-E06 - Front commercial et textes

### OBL-019 - Corriger l'encodage visible

Priorite : P2  
Type : Front/Admin  
Estimation : 0.5 jour  
Fichiers cibles :

```text
front/src/components/sidebar/ObligationProgressBar.tsx
front/src/components/sidebar/ConversationItem.tsx
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Critères d'acceptation :

- Les libelles ne contiennent plus de caracteres corrompus.
- Les textes restent coherents avec la convention du projet.
- Les boutons et badges restent lisibles.

Dependances :

- Aucune.

### OBL-020 - Clarifier le message commercial du controle qualite

Priorite : P2  
Type : Front  
Estimation : 0.5 jour  
Fichiers cibles :

```text
front/src/components/sidebar/ObligationProgressBar.tsx
front/src/components/sidebar/ConversationItem.tsx
```

Message cible :

```text
Qualite messages : repondez aux clients du bloc actif
```

Critères d'acceptation :

- Le front ne dit plus que toutes les conversations sont concernees.
- Le commercial comprend que seules les conversations du bloc actif comptent.
- Les appels restants restent visibles par categorie.

Dependances :

- OBL-002.

## 10. Epic OBL-E07 - Tests et non-regression

### OBL-021 - Tests controle qualite bloc actif

Priorite : P0  
Type : Tests backend  
Estimation : 1 jour  
Fichier cible :

```text
message_whatsapp/src/call-obligations/__tests__/call-obligation.service.spec.ts
```

Scenarios :

```text
conversation hors bloc actif ignoree
conversation bloc actif avec client dernier message -> KO
conversation bloc actif avec commercial dernier message -> OK
conversation sans message client -> OK
```

Critères d'acceptation :

- Les tests echouent si le service reprend toutes les conversations actives.
- Les tests couvrent les 10 conversations du bloc actif.

Dependances :

- OBL-001.
- OBL-002.

### OBL-022 - Tests rotation avec obligations activees/desactivees

Priorite : P0  
Type : Tests backend  
Estimation : 1 jour  
Fichier cible :

```text
message_whatsapp/src/window/__tests__/window-rotation.service.spec.ts
```

Scenarios :

```text
obligations desactivees -> rotation apres rapports soumis
obligations activees + appels incomplets -> blocage call_obligations_incomplete
obligations activees + appels complets + qualite KO -> blocage quality_check_failed
obligations activees + appels complets + qualite OK -> rotation
conversation hors bloc KO -> rotation non bloquee
```

Critères d'acceptation :

- Les raisons de blocage sont correctes.
- Le feature flag est respecte.

Dependances :

- OBL-003.

### OBL-023 - Tests idempotence appel

Priorite : P1  
Type : Tests backend  
Estimation : 0.5 jour  
Fichier cible :

```text
message_whatsapp/src/call-obligations/__tests__/call-obligation.service.spec.ts
```

Scenarios :

```text
call_event_id deja utilise -> appel_deja_traite
call_event_id nouveau -> validation normale
```

Critères d'acceptation :

- Un meme appel ne valide pas deux taches.

Dependances :

- OBL-008.

### OBL-024 - Tests curseur sync appels

Priorite : P1  
Type : Tests backend  
Estimation : 1 jour  
Fichier cible :

```text
message_whatsapp/src/order-call-sync/__tests__/order-call-sync.service.spec.ts
```

Scenarios :

```text
meme timestamp + id superieur -> lu
meme timestamp + id inferieur/deja traite -> ignore
appel outgoing 90s -> eligible
appel outgoing 89s -> ignore
appel missed -> ignore
```

Critères d'acceptation :

- Le curseur ne perd pas les appels ayant le meme timestamp.

Dependances :

- OBL-009.

### OBL-025 - Tests admin toggle et detail

Priorite : P2  
Type : Tests front/admin  
Estimation : 1 jour  
Fichiers possibles :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.test.tsx
```

Scenarios :

```text
affiche desactive
confirmation activation
confirmation desactivation
affiche detail taches
affiche statut sync
```

Critères d'acceptation :

- Les interactions admin principales sont couvertes.

Dependances :

- OBL-006.
- OBL-012.
- OBL-015.

## 11. Ordre de livraison recommande

### Lot 1 - Regle metier P0

Tickets :

```text
OBL-001
OBL-002
OBL-003
OBL-004
OBL-021
OBL-022
```

Livrable :

```text
Le controle qualite cible uniquement les 10 conversations du bloc actif.
```

### Lot 2 - Activation admin P0

Tickets :

```text
OBL-005
OBL-006
OBL-007
```

Livrable :

```text
Les obligations restent desactivees par defaut et sont pilotables par l'admin.
```

### Lot 3 - Robustesse appels P1

Tickets :

```text
OBL-008
OBL-009
OBL-010
OBL-011
OBL-023
OBL-024
```

Livrable :

```text
Les appels sont comptabilises sans doublon et sans perte sur timestamp identique.
```

### Lot 4 - Supervision admin P1

Tickets :

```text
OBL-012
OBL-013
OBL-014
OBL-015
```

Livrable :

```text
L'admin peut voir les taches et diagnostiquer l'etat d'un poste.
```

### Lot 5 - Observabilite et front P1/P2

Tickets :

```text
OBL-016
OBL-017
OBL-018
OBL-019
OBL-020
OBL-025
```

Livrable :

```text
Le module est exploitable en production avec messages clairs et diagnostic suffisant.
```

## 12. Definition of Ready

Un ticket est pret si :

1. Le fichier cible est identifie.
2. La regle du bloc actif est respectee.
3. Le comportement attendu est testable.
4. Les dependances sont connues.
5. Le ticket ne demande aucun changement DB2.

## 13. Definition of Done

Un ticket est termine si :

1. Le code est implemente.
2. Les tests pertinents passent.
3. Les obligations restent desactivees par defaut.
4. L'admin peut piloter l'activation si le ticket touche le flag.
5. Le controle qualite ne depasse jamais les 10 conversations du bloc actif.
6. Aucune ecriture DB2 n'est ajoutee.
7. Les erreurs critiques sont logguees ou visibles admin.

## 14. Risques a surveiller

| Risque | Tickets concernes | Protection |
| --- | --- | --- |
| Controle qualite trop large | OBL-001, OBL-002 | Tests OBL-021 |
| Rotation bloquee alors que flag false | OBL-005, OBL-022 | Tests feature flag |
| Double validation d'un appel | OBL-008, OBL-023 | Idempotence call_event_id |
| Appels DB2 perdus meme timestamp | OBL-009, OBL-024 | Curseur timestamp + id |
| Double batch pending | OBL-010 | Lock applicatif |
| Admin sans diagnostic | OBL-012 a OBL-018 | Detail taches + logs |

## 15. Resultat attendu final

Apres execution du backlog :

```text
Les obligations d'appel sont pretes pour E-GICOP.
Elles restent desactivees par defaut.
L'admin peut les activer quand l'organisation est prete.
Quand elles sont actives, elles bloquent la rotation uniquement pour les bonnes raisons :
- appels requis incomplets ;
- qualite KO sur les 10 conversations du bloc actif.
```
