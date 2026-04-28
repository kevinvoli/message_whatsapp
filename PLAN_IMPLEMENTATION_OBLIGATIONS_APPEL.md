# Plan d'implementation - Obligations d'appel GICOP

Date : 2026-04-28  
Projet : plateforme WhatsApp / E-GICOP  
Source : `RAPPORT_OBLIGATIONS_APPEL.md`

## 1. Objectif

Ce plan vise a stabiliser et finaliser le module des obligations d'appel avant rotation des conversations.

Regle metier cible :

```text
Apres un bloc actif de 10 conversations dont les rapports sont soumis,
le commercial doit remplir ses obligations d'appel avant que la rotation ne libere le bloc.
```

Les obligations sont :

```text
5 appels clients commandes annulees
5 appels clients commandes livrees
5 appels prospects / clients sans commande livree
duree minimale par appel : 90 secondes
```

Controle qualite cible :

```text
Le controle qualite doit verifier uniquement les 10 conversations du bloc actif,
pas toutes les conversations actives du poste.
```

Activation :

```text
Les obligations d'appel sont desactivees par defaut.
Elles doivent etre activables/desactivables par l'admin.
```

## 2. Contraintes fonctionnelles

1. Les obligations ne bloquent la rotation que si `FF_CALL_OBLIGATIONS_ENABLED = true`.
2. La valeur par defaut reste `false`.
3. L'admin doit pouvoir activer/desactiver la regle depuis l'interface admin.
4. Le controle qualite porte uniquement sur les 10 conversations du bloc actif.
5. Les appels doivent avoir une duree minimale de 90 secondes.
6. Les appels manques ne comptent jamais.
7. Les appels DB2 restent lus en lecture seule.
8. Les etats operationnels restent stockes en DB1.

## 3. Etat actuel resume

Le projet possede deja :

- table DB1 `commercial_obligation_batch` ;
- table DB1 `call_task` ;
- service `CallObligationService` ;
- controller `/call-obligations` ;
- barre front `ObligationProgressBar` ;
- vue admin `CallObligationsView` ;
- sync incrementale des appels DB2 via `OrderCallSyncService` ;
- integration avec `WindowRotationService` ;
- feature flag `FF_CALL_OBLIGATIONS_ENABLED`, deja desactive par defaut.

Les corrections principales a faire :

```text
1. Restreindre le controle qualite aux 10 conversations du bloc actif.
2. Rendre l'activation admin claire et fiable.
3. Renforcer l'idempotence et la robustesse de la validation d'appels.
4. Ameliorer la visibilite admin.
```

## 4. Phase 1 - Perimetre exact du controle qualite

Priorite : P0  
Duree estimee : 1 a 2 jours

### Probleme actuel

Actuellement, `runQualityCheck(posteId)` charge toutes les conversations actives du poste :

```text
poste_id = posteId
status = actif
```

Ce comportement est trop large.

### Regle cible

Le controle qualite doit viser uniquement :

```text
les 10 conversations du bloc actif de la fenetre glissante
```

Criteres de selection recommandes :

```text
poste_id = posteId
window_status = active
window_slot entre 1 et quotaActive
deletedAt IS NULL
```

Le `quotaActive` doit venir du service existant :

```text
ConversationCapacityService.getQuotas()
```

### Tache 1.1 - Ajouter une methode de lecture du bloc actif

Fichier :

```text
message_whatsapp/src/window/services/window-rotation.service.ts
```

ou dans un service partage si plus propre :

```text
message_whatsapp/src/window/services/validation-engine.service.ts
```

Methode recommandee :

```text
getActiveBlockConversations(posteId: string): Promise<WhatsappChat[]>
```

Elle doit retourner uniquement les conversations du bloc actif courant.

### Tache 1.2 - Adapter `CallObligationService.runQualityCheck`

Fichier :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
```

Comportement cible :

```text
runQualityCheck(posteId):
  charger uniquement les conversations window_status=active du bloc actif
  verifier last_poste_message_at >= last_client_message_at
  enregistrer quality_check_passed sur le batch actif
```

### Tache 1.3 - Adapter le controle dans la rotation

Fichier :

```text
message_whatsapp/src/window/services/window-rotation.service.ts
```

Avant de bloquer ou autoriser la rotation, s'assurer que le controle qualite a ete execute sur le bloc actif.

Regle :

```text
Si les 15 appels sont faits mais qualityCheckPassed = false,
la rotation reste bloquee avec reason = quality_check_failed.
```

### Criteres d'acceptation phase 1

- Une conversation active hors bloc actif ne peut plus bloquer la qualite.
- Une conversation du bloc actif dont le client a le dernier message bloque la rotation.
- Une conversation du bloc actif sans message client ne bloque pas.
- Une conversation du bloc actif avec derniere reponse commerciale ne bloque pas.
- Les tests couvrent le cas "conversation hors bloc ignoree".

## 5. Phase 2 - Activation admin et valeur par defaut

Priorite : P0  
Duree estimee : 1 jour

### Etat actuel

La configuration existe :

```text
FF_CALL_OBLIGATIONS_ENABLED
```

Valeur par defaut :

```text
false
```

La vue admin `CallObligationsView` contient deja un toggle.

### Tache 2.1 - Verifier la valeur par defaut

Fichier :

```text
message_whatsapp/src/system-config/system-config.service.ts
```

Confirmer :

```text
defaultValue = false
```

### Tache 2.2 - Renforcer le toggle admin

Fichier :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Ameliorations :

- afficher clairement `Desactive` quand le flag est false ;
- afficher que la rotation n'est pas bloquee quand c'est desactive ;
- afficher que la regle est active quand c'est true ;
- recharger les statuts apres activation/desactivation.

### Tache 2.3 - Ajouter une confirmation admin

Avant activation :

```text
Activer les obligations d'appel bloquera la rotation tant que les appels et le controle qualite ne sont pas valides.
```

Avant desactivation :

```text
Desactiver les obligations d'appel permettra la rotation sans controle des appels.
```

### Criteres d'acceptation phase 2

- Par defaut, les obligations sont desactivees.
- L'admin peut activer les obligations sans redeploiement.
- L'admin peut desactiver les obligations sans redeploiement.
- Si desactive, la rotation ne consulte pas les obligations.
- Si active, la rotation applique les obligations.

## 6. Phase 3 - Robustesse de la validation des appels

Priorite : P1  
Duree estimee : 2 jours

### Probleme 1 - Idempotence `call_event_id`

Aujourd'hui, le service ne verifie pas explicitement si un appel DB2 a deja valide une tache.

### Tache 3.1 - Ajouter une verification avant validation

Fichier :

```text
message_whatsapp/src/call-obligations/call-obligation.service.ts
```

Avant de chercher une tache pending :

```text
chercher call_task where call_event_id = params.callEventId
si existe -> return { matched: false, reason: 'appel_deja_traite' }
```

### Probleme 2 - Curseur DB2 timestamp incomplet

Le curseur garde :

```text
last_call_timestamp
last_call_id
```

mais la requete utilise seulement :

```text
call_timestamp > last_call_timestamp
```

### Tache 3.2 - Corriger la lecture incrementale

Fichier :

```text
message_whatsapp/src/order-call-sync/order-call-sync.service.ts
```

Condition cible :

```text
call_timestamp > lastCallTimestamp
OR (call_timestamp = lastCallTimestamp AND id > lastCallId)
```

### Probleme 3 - Plusieurs batches pending

Le code cherche un batch pending mais la DB ne garantit pas l'unicite.

### Tache 3.3 - Ajouter protection anti-concurrence

Option recommandee :

```text
utiliser un verrou distribue par poste avant getOrCreateActiveBatch
```

ou migration DB1 si compatible :

```text
index unique logique sur poste_id + status pending
```

Comme MySQL ne gere pas directement les index partiels selon statut, le verrou applicatif est plus simple.

### Criteres d'acceptation phase 3

- Un meme `call_event_id` ne peut pas valider deux taches.
- Deux appels ayant le meme timestamp DB2 ne sont pas perdus.
- Deux instances backend ne creent pas deux batches pending pour le meme poste.
- Aucun changement DB2 n'est necessaire.

## 7. Phase 4 - Admin detail des obligations

Priorite : P1  
Duree estimee : 2 a 3 jours

### Probleme actuel

L'admin voit les compteurs mais pas les taches detaillees.

### Tache 4.1 - Ajouter une API detail taches

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

### Tache 4.2 - Ajouter detail dans `CallObligationsView`

Fichier :

```text
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Ajouter une expansion par poste :

- taches restantes ;
- taches validees ;
- categorie ;
- numero client ;
- duree ;
- date de validation.

### Tache 4.3 - Ajouter bouton controle qualite manuel

Action admin :

```http
POST /call-obligations/quality-check/:posteId
```

Le bouton doit :

- lancer le controle ;
- afficher le resultat ;
- recharger la ligne poste.

### Criteres d'acceptation phase 4

- L'admin voit quels appels ont valide les obligations.
- L'admin voit quelles categories restent incompletes.
- L'admin peut relancer le controle qualite du bloc actif.
- L'admin comprend pourquoi la rotation est encore bloquee.

## 8. Phase 5 - Observabilite et diagnostic

Priorite : P1  
Duree estimee : 1 a 2 jours

### Tache 5.1 - Ajouter logs structures

Evenements a logguer :

```text
CALL_OBLIGATION_BATCH_CREATED
CALL_OBLIGATION_MATCHED
CALL_OBLIGATION_REJECTED
CALL_OBLIGATION_BATCH_CALLS_COMPLETE
CALL_OBLIGATION_QUALITY_PASSED
CALL_OBLIGATION_QUALITY_FAILED
CALL_OBLIGATION_READY_FOR_ROTATION
```

Champs minimum :

```text
posteId
batchId
batchNumber
callEventId
category
durationSeconds
reason
```

### Tache 5.2 - Exposer raisons de rejet

Les raisons deja presentes doivent etre mieux visibles :

```text
feature_disabled
duree_insuffisante
poste_introuvable
aucun_batch_actif
quota_categorie_atteint
appel_deja_traite
```

### Tache 5.3 - Ajouter statut sync appels

La vue admin doit afficher :

```text
DB2 disponible
dernier sync
nombre appels traites
nombre obligations matchees
nombre erreurs
```

en s'appuyant sur :

```http
GET /admin/order-sync/status
```

### Criteres d'acceptation phase 5

- Un appel non comptabilise peut etre diagnostique.
- L'admin sait si la sync DB2 tourne.
- Les logs permettent de comprendre pourquoi la rotation est bloquee.

## 9. Phase 6 - Front commercial

Priorite : P2  
Duree estimee : 1 jour

### Tache 6.1 - Corriger l'encodage visible

Fichiers :

```text
front/src/components/sidebar/ObligationProgressBar.tsx
front/src/components/sidebar/ConversationItem.tsx
admin/src/app/modules/dispatch/components/CallObligationsView.tsx
```

Corriger les textes visibles :

```text
Annulees / Annulées
Livrees / Livrées
Qualite / Qualité
Prete / Prête
Desactive / Désactivé
Active / Activé
```

Selon convention du projet, choisir ASCII ou UTF-8 propre.

### Tache 6.2 - Clarifier le message commercial

Quand rotation bloquee :

```text
Appels restants : X
Qualite messages : repondez aux clients du bloc actif
```

Ne pas dire "toutes les conversations" si la regle cible est seulement les 10 du bloc actif.

### Criteres d'acceptation phase 6

- Le commercial comprend que le controle qualite cible le bloc actif.
- Les textes ne sont plus corrompus.
- La barre obligations reste lisible.

## 10. Tests a ajouter ou corriger

Priorite : P0/P1

### Tests backend P0

Fichier :

```text
message_whatsapp/src/call-obligations/__tests__/call-obligation.service.spec.ts
```

Ajouter/corriger :

```text
controle qualite ignore conversation hors bloc actif
controle qualite echoue si client dernier message dans bloc actif
controle qualite passe si commercial dernier message dans bloc actif
call_event_id deja traite ne revalide pas une tache
client inconnu suit la regle choisie : fallback jamais_commande
```

### Tests rotation P0

Fichier :

```text
message_whatsapp/src/window/__tests__/window-rotation.service.spec.ts
```

Scenarios :

```text
obligations desactivees -> rotation autorisee apres rapports soumis
obligations activees + appels incomplets -> rotation bloquee
obligations activees + appels complets + qualite bloc KO -> rotation bloquee
obligations activees + appels complets + qualite bloc OK -> rotation autorisee
conversation hors bloc avec client dernier message -> n'empeche pas rotation
```

### Tests sync appels P1

Fichier a creer :

```text
message_whatsapp/src/order-call-sync/__tests__/order-call-sync.service.spec.ts
```

Scenarios :

```text
lecture avec meme timestamp et id superieur
appel sortant 90s valide
appel sortant 89s ignore
appel missed ignore
appel deja traite ignore
```

### Tests front/admin P2

Scenarios :

```text
admin active/desactive le flag
admin voit obligations desactivees
admin voit detail taches
front affiche appels restants
front affiche qualite bloc actif
```

## 11. Ordre de livraison recommande

### Lot 1 - Regle metier qualite bloc actif

1. Restreindre le controle qualite aux 10 conversations du bloc actif.
2. Adapter la rotation.
3. Corriger tests backend/rotation.

Livrable :

```text
La qualite ne bloque que sur les 10 conversations du bloc actif.
```

### Lot 2 - Activation admin fiable

1. Confirmer flag false par defaut.
2. Renforcer toggle admin.
3. Ajouter confirmation activation/desactivation.

Livrable :

```text
L'admin controle clairement l'activation des obligations.
```

### Lot 3 - Robustesse appels

1. Idempotence `call_event_id`.
2. Curseur DB2 robuste.
3. Protection anti double batch.

Livrable :

```text
Les appels sont comptabilises de maniere fiable.
```

### Lot 4 - Supervision admin

1. API detail taches.
2. Expansion admin par poste.
3. Bouton controle qualite manuel.
4. Statut sync appels.

Livrable :

```text
L'admin peut diagnostiquer pourquoi un poste n'est pas pret.
```

### Lot 5 - Finition front et observabilite

1. Logs structures.
2. Raisons de rejet visibles.
3. Correction encodage.
4. Messages commerciaux clarifies.

Livrable :

```text
Le systeme est exploitable en production.
```

## 12. Definition of Done

Une phase est terminee si :

1. Le comportement est implemente.
2. Les tests pertinents passent.
3. Les obligations restent desactivees par defaut.
4. L'admin peut activer/desactiver sans redeploiement.
5. Le controle qualite cible uniquement le bloc actif.
6. La rotation respecte le feature flag.
7. Aucun changement DB2 n'est introduit.
8. Les logs permettent de diagnostiquer un appel non comptabilise.

## 13. Risques principaux

| Risque | Impact | Protection |
| --- | --- | --- |
| Controle qualite trop large | Rotation bloquee injustement | Filtrer sur bloc actif seulement |
| Flag active sans preparation | Rotation bloquee en production | Confirmation admin + affichage clair |
| Appel DB2 lu deux fois | Double validation | Idempotence call_event_id |
| Appels meme timestamp ignores | Obligations non validees | Curseur timestamp + id |
| Deux batches pending | Compteurs incoherents | Verrou ou contrainte applicative |
| Admin sans detail | Support difficile | API tasks + vue detaillee |

## 14. Resultat attendu

Apres implementation :

```text
Les obligations d'appel restent desactivees par defaut.
L'admin peut les activer quand l'organisation est prete.
Quand elles sont actives, elles bloquent la rotation uniquement si :
- les 15 appels requis ne sont pas valides ;
- ou le commercial n'a pas la derniere reponse sur les 10 conversations du bloc actif.
```

Le module devient exploitable pour E-GICOP sans bloquer injustement les commerciaux a cause de conversations hors bloc actif.
