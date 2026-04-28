# Rapport complet - Obligations d'appel GICOP

Date : 2026-04-28  
Projet : plateforme WhatsApp / E-GICOP  
Perimetre analyse : backend `message_whatsapp`, front commercial `front`, admin `admin`, rotation conversationnelle, lecture appels DB2.

## 1. Resume executif

Le projet contient deja un module avance d'obligations d'appel.

Objectif metier implemente :

```text
Avant de permettre une nouvelle rotation de conversations,
le poste commercial doit avoir valide 15 appels :
- 5 clientes avec commandes annulees
- 5 clientes avec commandes livrees
- 5 prospects / clients sans commande livree
avec une duree minimale de 90 secondes par appel.
```

Le module ajoute aussi une deuxieme condition :

```text
Le commercial doit avoir la derniere reponse sur les conversations actives.
```

Donc la rotation peut etre bloquee par deux raisons :

```text
call_obligations_incomplete
quality_check_failed
```

Etat global :

```text
Le socle technique est present, mais il reste fragile sur certains points :
- dependance forte a la synchronisation des appels DB2 ;
- feature flag desactive par defaut ;
- creation du nouveau batch apres rotation probablement incomplete ;
- peu de visibilite sur les taches detaillees ;
- tests partiellement incoherents avec le comportement actuel du service.
```

## 2. Fichiers principaux

### Backend obligations

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/call-obligations/call-obligation.service.ts` | Moteur principal des obligations |
| `message_whatsapp/src/call-obligations/call-obligation.controller.ts` | APIs commercial/admin |
| `message_whatsapp/src/call-obligations/call-obligation.module.ts` | Module NestJS |
| `message_whatsapp/src/call-obligations/obligation-quality-check.job.ts` | Controle qualite periodique |
| `message_whatsapp/src/call-obligations/entities/commercial-obligation-batch.entity.ts` | Batch d'obligations par poste |
| `message_whatsapp/src/call-obligations/entities/call-task.entity.ts` | Taches d'appel a valider |

### Synchronisation appels

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/order-call-sync/order-call-sync.service.ts` | Lit les appels DB2 et tente de valider les obligations |
| `message_whatsapp/src/order-call-sync/order-call-sync.job.ts` | Cron toutes les 5 minutes |
| `message_whatsapp/src/order-call-sync/entities/order-call-sync-cursor.entity.ts` | Curseur incremental de lecture DB2 |
| `message_whatsapp/src/order-read/entities/order-call-log.entity.ts` | Mapping read-only de `call_logs` DB2 |

### Rotation et gate commercial

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/window/services/window-rotation.service.ts` | Bloque ou autorise la rotation selon obligations |
| `message_whatsapp/src/commercial-action-gate/commercial-action-gate.service.ts` | Signale les obligations comme blocage prioritaire |

### Front commercial

| Fichier | Role |
| --- | --- |
| `front/src/components/sidebar/ObligationProgressBar.tsx` | Barre de progression obligations |
| `front/src/store/chatStore.ts` | Stocke `obligationStatus` |
| `front/src/components/sidebar/ConversationItem.tsx` | Explique pourquoi les conversations sont verrouillees |
| `front/src/modules/realtime/services/socket-event-router.ts` | Recharge les obligations apres events rotation/rapport |

### Admin

| Fichier | Role |
| --- | --- |
| `admin/src/app/modules/dispatch/components/CallObligationsView.tsx` | Vue admin obligations |
| `admin/src/app/ui/DispatchView.tsx` | Onglet dispatch `Obligations appels` |

### Migrations DB1

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/database/migrations/20260422_sprint6_call_obligations.ts` | Tables `commercial_obligation_batch` et `call_task` |
| `message_whatsapp/src/database/migrations/20260424_order_call_sync_cursor.ts` | Table `order_call_sync_cursor` |

## 3. Feature flag

Le module est controle par la configuration :

```text
FF_CALL_OBLIGATIONS_ENABLED
```

Definition dans :

```text
message_whatsapp/src/system-config/system-config.service.ts
```

Valeur par defaut :

```text
false
```

Effet :

- si `false`, les obligations ne bloquent pas la rotation ;
- si `true`, le backend cree des batches et bloque la rotation tant que les conditions ne sont pas remplies.

Point important :

```text
En production, si ce flag reste a false, tout le module existe mais n'a aucun effet bloquant.
```

## 4. Modele de donnees DB1

### 4.1 Table `commercial_obligation_batch`

Un batch represente le cycle d'obligations d'un poste.

Champs principaux :

```text
id
poste_id
batch_number
status
annulee_done
livree_done
sans_commande_done
quality_check_passed
created_at
completed_at
```

Statuts :

```text
pending
complete
```

Index :

```text
IDX_batch_poste_status(poste_id, status)
```

Interpretation :

```text
Un poste doit normalement avoir au plus un batch pending.
```

Limite :

```text
Il n'y a pas de contrainte unique DB garantissant un seul batch pending par poste.
```

### 4.2 Table `call_task`

Une tache represente un appel attendu dans une categorie.

Champs principaux :

```text
id
batch_id
poste_id
category
status
client_phone
call_event_id
duration_seconds
completed_at
created_at
```

Categories :

```text
commande_annulee
commande_avec_livraison
jamais_commande
```

Statuts :

```text
pending
done
```

Index :

```text
IDX_call_task_batch_cat(batch_id, category, status)
IDX_call_task_poste(poste_id, status)
```

## 5. Creation des obligations

### 5.1 Creation automatique du batch

Methode :

```text
CallObligationService.getOrCreateActiveBatch(posteId)
```

Comportement :

1. Cherche un batch `pending` pour le poste.
2. S'il existe, le retourne.
3. Sinon, calcule le prochain `batchNumber`.
4. Cree un batch `pending`.
5. Cree 15 taches `call_task`.

Composition des 15 taches :

```text
5 x commande_annulee
5 x commande_avec_livraison
5 x jamais_commande
```

Le batch est cree :

- lors de `buildWindowForPoste()` si le feature flag est actif ;
- via endpoint admin `POST /call-obligations/init-all` ;
- apres rotation, le service tente de creer un prochain batch.

### 5.2 Probleme potentiel apres rotation

Dans `performRotation()`, apres une rotation reussie, le code appelle :

```text
getOrCreateActiveBatch(posteId)
```

Mais si le batch precedent n'est pas passe en `complete`, cette methode retourne le batch existant au lieu d'en creer un nouveau.

Or le service met `status = complete` seulement quand les 15 appels sont faits, pas quand `qualityCheckPassed` est vrai.

Situation possible :

```text
15 appels faits -> batch.status = complete
qualityCheckPassed = true -> readyForRotation = true
rotation autorisee
```

Cela fonctionne si les appels ont bien marque le batch en `complete`.

Mais il y a une incoherence conceptuelle :

```text
readyForRotation depend de qualityCheckPassed,
mais status complete ne depend que des compteurs d'appels.
```

Donc un batch peut etre `complete` cote appels mais pas encore pret pour rotation si la qualite echoue.

Ce n'est pas bloquant, mais le nom `complete` est ambigu.

## 6. Validation d'un appel

### 6.1 Source des appels

Les appels sont lus depuis DB2, table :

```text
call_logs
```

Entite :

```text
OrderCallLog
```

Important :

```text
Le mapping DB2 est explicitement read-only.
Le code lit DB2, mais ne doit pas ecrire dedans.
```

### 6.2 Cron de synchronisation

Job :

```text
OrderCallSyncJob
```

Frequence :

```text
toutes les 5 minutes
```

Methode appelee :

```text
OrderCallSyncService.syncNewCalls()
```

Lecture incrementale :

```text
WHERE call_timestamp > last_call_timestamp
ORDER BY call_timestamp ASC, id ASC
LIMIT 200
```

Le curseur est stocke dans DB1 :

```text
order_call_sync_cursor
```

### 6.3 Eligibilite d'un appel

Un appel compte uniquement si :

```text
call_type = outgoing
duration >= 90 secondes
id_commercial present OU local_number present
```

Un appel manque ne compte jamais.

Constantes :

```text
ORDER_CALL_TYPE_OUTGOING = 'outgoing'
ORDER_CALL_TYPE_MISSED = 'missed'
ORDER_CALL_MIN_DURATION_SEC = 90
```

### 6.4 Resolution du poste

Le service essaie de trouver le poste dans cet ordre :

1. `posteId` fourni directement ;
2. `idCommercialDb2` via `commercial_identity_mapping` ;
3. `commercialPhone` via `WhatsappCommercial.phone`.

Si aucun poste n'est trouve :

```text
matched = false
reason = poste_introuvable
```

### 6.5 Resolution de la categorie client

Le service determine la categorie de l'appel dans cet ordre :

1. categorie deja resolue par `OrderCallSyncService.resolveClientCategory()` ;
2. `idClientDb2` via `client_identity_mapping` puis `Contact.client_category` ;
3. `clientPhone` via `Contact.phone` ;
4. fallback `jamais_commande`.

Mapping DB1 :

```text
commande_annulee        -> commande_annulee
commande_avec_livraison -> commande_avec_livraison
jamais_commande         -> jamais_commande
commande_sans_livraison -> jamais_commande
```

Mapping DB2 dans `OrderCallSyncService` :

```text
aucune commande trouvee          -> jamais_commande
trueCancel = 1                   -> commande_annulee
dateLivree non null              -> commande_avec_livraison
commande existante non finalisee -> jamais_commande
```

Point important :

```text
Un client non identifie est classe par defaut en jamais_commande.
```

Cela permet de ne pas perdre l'appel, mais peut fausser la categorie.

### 6.6 Validation de la tache

Le moteur cherche une tache `pending` dans le batch actif :

```text
batch_id = batch actif
category = categorie resolue
status = pending
```

Si une tache existe :

```text
status = done
client_phone = numero client
call_event_id = id appel DB2
duration_seconds = duree
completed_at = now
```

Puis le compteur batch est incremente :

```text
annulee_done
livree_done
sans_commande_done
```

Si les trois compteurs atteignent 5 :

```text
batch.status = complete
batch.completed_at = now
```

## 7. Controle qualite messages

### 7.1 Regle

Le controle qualite verifie que le commercial a la derniere reponse sur chaque conversation active.

Regle code :

```text
si last_client_message_at est null -> OK
si last_poste_message_at est null -> KO
si last_poste_message_at >= last_client_message_at -> OK
sinon -> KO
```

Methode :

```text
CallObligationService.checkAndRecordQuality(posteId, activeConvs)
```

Le resultat est stocke dans :

```text
commercial_obligation_batch.quality_check_passed
```

### 7.2 Job periodique

Job :

```text
ObligationQualityCheckJob
```

Il est enregistre via :

```text
CronConfigService.registerHandler('obligation-quality-check')
```

Il ne s'execute que si :

```text
FF_CALL_OBLIGATIONS_ENABLED = true
```

Il recupere tous les postes avec batch actif et lance :

```text
runQualityCheck(posteId)
```

### 7.3 Limite

Le controle qualite regarde toutes les conversations actives du poste :

```text
where poste_id = posteId
and status = actif
```

Il ne filtre pas explicitement sur le bloc actif des 10 conversations qui declenchent la rotation.

Impact possible :

```text
Une conversation active hors bloc de 10 pourrait faire echouer le controle qualite.
```

Selon la regle metier, il faudrait confirmer si le controle doit porter sur :

- toutes les conversations actives du poste ;
- uniquement les 10 conversations du bloc actif ;
- uniquement les conversations dont le rapport est soumis.

## 8. Condition finale de rotation

### 8.1 Regle dans le code

Methode :

```text
CallObligationService.isBatchReady()
```

Condition :

```text
annulee_done >= 5
livree_done >= 5
sans_commande_done >= 5
quality_check_passed = true
```

Le statut expose par API contient :

```text
readyForRotation
```

### 8.2 Integration avec la rotation

Dans :

```text
WindowRotationService.checkAndTriggerRotation(posteId)
```

Ordre de verification :

1. verifier que les rapports du bloc actif sont soumis ;
2. si obligations activees, lire `getStatus(posteId)` ;
3. si `readyForRotation = false`, emettre `WINDOW_ROTATION_BLOCKED` ;
4. sinon, executer `performRotation(posteId)`.

Payload de blocage :

```text
reason
progress
obligations
```

Raison :

```text
call_obligations_incomplete
quality_check_failed
```

La raison est choisie ainsi :

```text
si appels valides < total requis -> call_obligations_incomplete
sinon -> quality_check_failed
```

### 8.3 Effet front

Le front recoit `WINDOW_ROTATION_BLOCKED`, stocke les obligations dans Zustand, recharge la barre et affiche les raisons.

## 9. APIs disponibles

### Commercial

```http
GET /call-obligations/mine
```

Retour :

```text
batchId
batchNumber
status
annulee.done / required
livree.done / required
sansCommande.done / required
qualityCheckPassed
readyForRotation
```

Si le commercial n'a pas de poste :

```text
null
```

### Admin

```http
GET /call-obligations/poste/:posteId
```

Retourne le statut d'un poste.

```http
POST /call-obligations/init-all
```

Cree les batches manquants pour tous les postes.

```http
POST /call-obligations/quality-check/:posteId
```

Lance le controle qualite manuellement.

### Admin sync appels

```http
GET /admin/order-sync/status
GET /admin/order-sync/failed
```

Permet de voir l'etat global de la synchronisation DB2 et les erreurs.

## 10. Front commercial

### 10.1 Barre obligations

Composant :

```text
ObligationProgressBar
```

Appelle :

```http
GET /call-obligations/mine
```

Frequence :

```text
au montage
toutes les 60 secondes
sur evenement local obligations:reload
```

Affiche :

- batch number ;
- total appels valides sur 15 ;
- detail par categorie ;
- controle qualite messages.

Si tout est pret :

```text
status.readyForRotation = true
```

la barre ne s'affiche plus.

### 10.2 Conversations verrouillees

`ConversationItem` utilise `obligationStatus` pour afficher :

- nombre d'appels restants ;
- categories restantes ;
- message qualite si le dernier message client n'a pas de reponse.

Limite UI :

```text
Les textes visibles contiennent plusieurs problemes d'encodage UTF-8
comme AnnulÃ©es, LivrÃ©es, QualitÃ©.
```

## 11. Vue admin

Composant :

```text
CallObligationsView
```

Fonctions :

- affiche tous les postes ;
- affiche le batch actif par poste ;
- affiche progression par categorie ;
- affiche qualite messages ;
- affiche si la rotation est prete ;
- permet d'activer/desactiver le feature flag.

Point positif :

```text
L'admin peut piloter l'activation du module sans redeploiement.
```

Limites :

- l'admin ne voit pas les 15 taches detaillees ;
- l'admin ne voit pas quels clients/appels ont valide les taches ;
- pas de bouton de resynchronisation manuelle des appels DB2 dans cette vue ;
- pas de detail des raisons `poste_introuvable`, `quota atteint`, `duree insuffisante`.

## 12. Tests existants

Tests presents :

```text
message_whatsapp/src/call-obligations/__tests__/call-obligation.service.spec.ts
message_whatsapp/src/call-obligations/__tests__/obligation-quality-check.job.spec.ts
```

Ils couvrent :

- creation batch ;
- creation 15 taches ;
- increment batch number ;
- refus duree < 90s ;
- refus poste introuvable ;
- refus aucun batch actif ;
- refus quota atteint ;
- validation tache ;
- passage batch en `complete` ;
- controle qualite ;
- statut `readyForRotation` ;
- init all batches ;
- job qualite.

### Incoherence detectee dans les tests

Un test attend :

```text
reason = categorie_contact_inconnue
```

Mais le service actuel fait :

```text
Client non identifie -> bucket JAMAIS_COMMANDE par defaut
```

Donc ce test semble incoherent avec le code actuel.

Il faut choisir la regle metier :

1. soit client inconnu = jamais_commande ;
2. soit client inconnu = appel refuse.

Actuellement le code applique l'option 1.

## 13. Bugs et risques detectes

### Bug/Risque 1 - Feature flag desactive par defaut

Gravite : haute si l'entreprise pense que les obligations sont actives.

Le flag :

```text
FF_CALL_OBLIGATIONS_ENABLED
```

est par defaut a `false`.

Impact :

```text
La rotation ne sera pas bloquee par les obligations tant que le flag n'est pas active.
```

### Bug/Risque 2 - Pas de contrainte DB contre plusieurs batches pending

Gravite : moyenne.

Le code cherche un batch pending, mais la DB ne garantit pas l'unicite.

Impact possible :

```text
Deux instances backend ou deux appels concurrents peuvent creer deux batches pending pour le meme poste.
```

Correction recommandee :

```text
Ajouter une contrainte unique logique ou un verrou distribue/transactionnel.
```

### Bug/Risque 3 - Le batch `complete` ne veut pas dire pret pour rotation

Gravite : moyenne.

`status = complete` signifie :

```text
15 appels faits
```

Mais `readyForRotation` exige aussi :

```text
qualityCheckPassed = true
```

Impact :

```text
Le vocabulaire peut induire en erreur cote admin ou debug.
```

Correction possible :

```text
Renommer status ou ajouter un statut ready.
```

### Bug/Risque 4 - Controle qualite trop large

Gravite : haute selon regle metier.

Le controle qualite regarde toutes les conversations actives du poste.

Si la regle attend seulement les 10 conversations du bloc soumis, le code est trop strict.

Impact :

```text
Rotation bloquee par une conversation active hors bloc.
```

### Bug/Risque 5 - Dependances fortes aux mappings DB2/DB1

Gravite : haute.

La validation correcte depend de :

- `id_commercial` dans DB2 ;
- `id_client` dans DB2 ;
- `commercial_identity_mapping` ;
- `client_identity_mapping` ;
- fallback telephone commercial ;
- fallback telephone client.

Si ces donnees sont absentes ou mal normalisees :

```text
poste_introuvable
categorie mauvaise
appel non comptabilise
```

### Bug/Risque 6 - Fallback client inconnu vers `jamais_commande`

Gravite : moyenne.

Avantage :

```text
L'appel n'est pas perdu.
```

Risque :

```text
Le quota sans commande peut etre valide par des clients qui devraient etre dans une autre categorie.
```

### Bug/Risque 7 - Curseur DB2 base seulement sur timestamp

Gravite : moyenne.

La requete lit :

```text
call_timestamp > lastCallTimestamp
```

alors que le curseur garde aussi `lastCallId`.

Impact :

```text
Si plusieurs appels ont exactement le meme timestamp,
certains appels peuvent etre ignores apres avancement du curseur.
```

Correction recommandee :

```text
Utiliser condition :
call_timestamp > lastTimestamp
OR (call_timestamp = lastTimestamp AND id > lastCallId)
```

### Bug/Risque 8 - Pas d'idempotence par `call_event_id`

Gravite : moyenne.

Le code ne verifie pas explicitement si un `call_event_id` a deja valide une tache.

Impact :

```text
En cas de relecture, le meme appel pourrait valider plusieurs taches.
```

Le curseur limite ce risque, mais ne le supprime pas totalement.

Correction recommandee :

```text
Ajouter une recherche call_task.call_event_id avant validation.
```

### Bug/Risque 9 - Pas de visibilite detaillee admin

Gravite : moyenne.

L'admin voit les compteurs, pas les appels.

Il manque :

- client appele ;
- duree ;
- heure ;
- categorie ;
- raison des appels refuses ;
- taches restantes detaillees.

### Bug/Risque 10 - Encodage visible degrade

Gravite : faible mais visible.

Plusieurs textes affichent :

```text
AnnulÃ©es
LivrÃ©es
QualitÃ©
PrÃªte
```

Cela doit etre corrige pour un front professionnel.

## 14. Niveau de maturite actuel

Evaluation :

```text
6.8 / 10
```

Points forts :

- modele DB1 dedie ;
- batches par poste ;
- 15 taches structurees ;
- duree minimale 90s ;
- lecture DB2 read-only ;
- synchro incrementale ;
- integration rotation ;
- integration front ;
- vue admin ;
- feature flag ;
- tests unitaires.

Points faibles :

- flag desactive par defaut ;
- risque de batches concurrents ;
- pas d'idempotence par call_event_id ;
- curseur timestamp incomplet ;
- controle qualite possiblement trop large ;
- admin sans detail taches/appels ;
- observabilite insuffisante sur appels rejetes ;
- encodage UI degrade.

## 15. Recommandations prioritaires

### Priorite P0

1. Confirmer la regle metier du controle qualite :
   - toutes les conversations actives ;
   - ou seulement les 10 conversations du bloc actif.

2. Corriger le curseur DB2 :

```text
call_timestamp > lastTimestamp
OR (call_timestamp = lastTimestamp AND id > lastCallId)
```

3. Ajouter idempotence sur `call_event_id`.

4. Ajouter protection contre plusieurs batches pending par poste.

5. Aligner les tests avec la regle client inconnu :
   - fallback `jamais_commande` ;
   - ou refus `categorie_contact_inconnue`.

### Priorite P1

1. Ajouter une API detaillee des taches :

```http
GET /call-obligations/poste/:posteId/tasks
```

2. Ajouter une vue admin detaillee :
   - taches pending ;
   - taches done ;
   - client_phone ;
   - duration_seconds ;
   - call_event_id ;
   - completed_at.

3. Ajouter logs structures pour les refus :

```text
CALL_OBLIGATION_REJECTED
reason
callEventId
posteId
duration
category
```

4. Ajouter bouton admin de sync manuelle des appels.

### Priorite P2

1. Corriger encodage UI.
2. Ajouter configuration dynamique du quota par categorie.
3. Ajouter configuration dynamique de la duree minimale.
4. Ajouter historique des batches termines par poste.
5. Ajouter alertes si DB2 call sync ne tourne plus.

## 16. Processus cible recommande

Flux cible :

```text
1. Le poste recoit 10 conversations actives.
2. Un batch d'obligations est cree automatiquement.
3. Le commercial soumet les 10 rapports.
4. Le commercial effectue les appels requis.
5. La sync DB2 lit les appels sortants >= 90s.
6. Chaque appel valide une tache dans la bonne categorie.
7. Le controle qualite verifie que le commercial a repondu aux derniers messages.
8. Si 15 appels + qualite OK, readyForRotation = true.
9. La rotation automatique libere le bloc et injecte/promouvoit les conversations suivantes.
10. Un nouveau batch est cree pour le prochain cycle.
```

## 17. Conclusion

Le module d'obligations d'appel est deja bien structure et proche du besoin E-GICOP. Il introduit un vrai controle operationnel avant rotation : appels requis, duree minimale et qualite de reponse.

Le point le plus important a clarifier est le perimetre du controle qualite. Ensuite, les corrections techniques les plus rentables sont l'idempotence `call_event_id`, le curseur DB2 robuste et la protection contre les batches concurrents.

Une fois ces points corriges, le module peut atteindre un niveau de maturite proche de :

```text
8 / 10
```

sans necessiter de refonte majeure.
