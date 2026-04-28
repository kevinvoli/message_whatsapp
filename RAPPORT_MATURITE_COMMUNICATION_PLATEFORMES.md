# Rapport de maturite du projet et communication entre plateformes

Date d'audit : 2026-04-27  
Projet : plateforme WhatsApp / GICOP / front commercial  
Perimetre analyse : `message_whatsapp`, `front`, modules DB2/order, realtime, fenetre glissante, rapports GICOP.

## 1. Synthese executive

Le projet a un niveau de maturite intermediaire avance. La base technique est solide : NestJS modulaire, Next.js cote front, Socket.IO pour le temps reel, TypeORM, separation DB1/DB2, modules metier bien identifies, logs de synchronisation, mecanismes de retry partiels et tests unitaires sur certaines zones critiques.

Le point le plus mature est la decomposition fonctionnelle : dispatch, conversations, rapports, DB2, obligations d'appel, fenetre glissante, realtime et front sont separes en modules comprehensibles.

Le point le plus fragile est la coherence transactionnelle entre les evenements temps reel, la base DB1 et la base DB2. Plusieurs flux reposent sur des evenements applicatifs et des crons de rattrapage plutot que sur une file durable ou un outbox transactionnel. Cela fonctionne, mais le systeme peut encore produire des etats transitoires difficiles a diagnostiquer : badge present mais rotation non visible, rapport soumis mais sync DB2 echouee, conversation fermee mais encore dans la fenetre, etc.

Niveau de maturite global estime :

```text
Architecture applicative          : 7 / 10
Maturite backend                  : 7 / 10
Maturite front temps reel         : 6.5 / 10
Maturite integration DB2          : 6 / 10
Observabilite / diagnostic        : 6 / 10
Robustesse transactionnelle       : 5.5 / 10
Tests automatises                 : 5.5 / 10
Maturite production globale       : 6.5 / 10
```

## 2. Structure generale du projet

Le repository contient principalement :

- `message_whatsapp` : backend NestJS principal.
- `front` : front commercial Next.js.
- `admin` : interface admin separee.
- `docs` et `memory` : documentation technique et traces d'analyse.
- `docker-compose.yml` / `docker-compose.local.yml` : orchestration locale.

Le backend `message_whatsapp` est organise par modules NestJS :

- `whatsapp_message`, `whatsapp_chat`, `whatsapp_contacts`, `whatsapp_media` : socle messagerie.
- `realtime` : publication Socket.IO et gestion de connexion agent.
- `dispatcher` : attribution/reinjection.
- `window` : fenetre glissante et renouvellement de conversations.
- `gicop-report` : rapport commercial et soumission.
- `order-db`, `order-write`, `order-read`, `order-call-sync` : communication DB2 / plateforme commandes.
- `call-obligations` : obligations d'appel.
- `integration-sync` : journalisation des synchronisations.
- `client-dossier`, `conversation-closure`, `follow-up`, `targets`, `analytics`, `business-metrics` : couche metier CRM / pilotage.
- `ai-assistant`, `flowbot`, `ai-governance` : automatisation et IA.

Cette modularisation est bonne. Elle permet de localiser les responsabilites, mais certains flux traversent beaucoup de modules, ce qui augmente la complexite de diagnostic.

## 3. Processus d'affichage des conversations

### 3.1 Connexion commerciale

Le flux commence dans :

```text
message_whatsapp/src/realtime/connections/agent-connection.service.ts
```

A la connexion socket :

1. Authentification du commercial.
2. Resolution du `posteId`.
3. Join des rooms Socket.IO :
   - `tenant:<tenantId>`
   - `poste:<posteId>`
   - `commercial:<commercialId>`
4. Activation du commercial et du poste.
5. Construction/reparation de la fenetre :
   ```ts
   windowRotation.buildWindowForPoste(posteId)
   ```
6. Chargement des conversations :
   ```ts
   sendConversationsToClient(client)
   ```

### 3.2 Chargement des conversations

Le chargement passe par :

```text
message_whatsapp/src/whatsapp_message/services/socket-conversation-query.service.ts
```

En mode fenetre glissante :

1. Charge d'abord les conversations avec `window_slot`.
2. Complete jusqu'a 50 avec des conversations non slottées.
3. Trie par `window_slot`.
4. Applique un fallback d'affichage si certains slots/status manquent.
5. Charge en bulk :
   - derniers messages ;
   - unread counts ;
   - contacts ;
   - etats de validation historiques ;
   - statut de soumission rapport GICOP.
6. Retourne `CONVERSATION_LIST`.

### 3.3 Affichage front

Le front recoit l'evenement dans :

```text
front/src/modules/realtime/services/socket-event-router.ts
```

Puis stocke les conversations dans le store Zustand.

Le rendu d'une conversation se fait dans :

```text
front/src/components/sidebar/ConversationItem.tsx
```

Regle d'affichage principale :

```text
window_status = locked ou is_locked = true => conversation grisee et non cliquable
window_status = active => conversation cliquable
report_submission_status = sent => badge Rapport GICOP
report_submission_status = pending => badge Rapport soumis
report_submission_status = failed => badge Rapport KO
```

Le front ne decide pas la rotation. Il affiche l'etat recu du backend.

## 4. Processus de renouvellement des conversations

Le renouvellement est gere par :

```text
message_whatsapp/src/window/services/window-rotation.service.ts
```

### 4.1 Construction de la fenetre

La methode :

```ts
buildWindowForPoste(posteId)
```

construit une fenetre de conversations :

```text
quotaActive = 10
quotaTotal  = 50
```

Les conversations recoivent :

```text
window_slot
window_status = active | locked | released
is_locked
```

Les 10 premiers slots sont `active`, les suivants `locked`.

Point important : les conversations `fermé` peuvent rester slottées. Elles ne disparaissent pas seules si leur rapport doit encore compter dans le bloc.

### 4.2 Condition de rotation

La methode :

```ts
checkAndTriggerRotation(posteId)
```

verifie :

```text
Toutes les conversations ACTIVE du bloc courant ont un rapport soumis.
```

La source de verite n'est pas `window_status`.

La source de verite est `conversation_report` :

```text
isSubmitted = true
ou submittedAt non null
ou submissionStatus non null
```

Le statut metier de la conversation ne bloque pas :

```text
actif, en attente, ferme => peuvent compter si elles sont dans le bloc actif et rapport soumis
```

### 4.3 Rotation

Quand la rotation est declenchee :

```ts
performRotation(posteId)
```

fait :

1. prend les conversations `ACTIVE` du bloc courant ;
2. libere celles dont le rapport est soumis ;
3. met leur `window_status` a `released` ;
4. promeut des conversations `LOCKED` en `ACTIVE` ;
5. injecte de nouvelles conversations si la fenetre a moins de 50 entrees ;
6. reinitialise les statuts de soumission pour les conversations nouvellement promues/injectees afin d'eviter qu'un ancien rapport soumis declenche le nouveau bloc ;
7. emet l'evenement :
   ```text
   WINDOW_ROTATED
   ```

### 4.4 Rattrapage automatique

Le service contient un cron :

```ts
@Cron(CronExpression.EVERY_MINUTE)
autoCheckRotations()
```

Il verifie automatiquement les postes avec fenetre ouverte et construit les fenetres manquantes. Cela evite de devoir appeler manuellement :

```http
POST /window/rotate-check/:posteId
```

Ce cron est une bonne protection contre les etats bloques.

## 5. Communication front/backend temps reel

Le systeme Socket.IO utilise des evenements `chat:event`.

Evenements importants :

- `CONVERSATION_LIST` : liste initiale ou recharge.
- `CONVERSATION_UPSERT` : mise a jour d'une conversation.
- `CONVERSATION_REMOVED` : retrait direct.
- `REPORT_SUBMITTED` : mise a jour badge rapport.
- `WINDOW_BLOCK_PROGRESS` : progression du bloc.
- `WINDOW_ROTATED` : rotation reussie.
- `WINDOW_ROTATION_BLOCKED` : ancien mecanisme de blocage, encore present.

Lors d'un `WINDOW_ROTATED`, le front :

1. marque les conversations liberees ;
2. active l'animation ;
3. attend 500 ms ;
4. recharge la liste complete.

Ce mecanisme est simple et efficace, mais il depend de la bonne reception de l'evenement socket. Si l'evenement est perdu, la DB peut etre correcte mais l'ecran ne se mettra a jour qu'au prochain reload ou prochain `CONVERSATION_LIST`.

## 6. Communication entre les deux plateformes DB1 / DB2

### 6.1 DB1

DB1 est la base principale de la messagerie. Elle porte :

- conversations ;
- messages ;
- contacts ;
- rapports GICOP ;
- suivi de fenetre ;
- obligations ;
- logs d'integration ;
- utilisateurs/postes.

### 6.2 DB2

DB2 represente la plateforme commandes/GICOP.

La connexion est definie dans :

```text
message_whatsapp/src/order-db/order-db.module.ts
```

Regles actuelles :

- DB2 est optionnelle.
- Si `ORDER_DB_HOST` est absent ou la connexion echoue, l'application demarre quand meme.
- `synchronize: false`
- `migrationsRun: false`
- lecture sur les tables natives DB2 ;
- ecriture uniquement sur tables miroir `messaging_*`.

C'est une bonne approche de securite : le backend ne modifie pas le schema DB2 et limite son perimetre d'ecriture.

### 6.3 Ecriture vers DB2

L'ecriture principale est :

```text
message_whatsapp/src/order-write/services/order-dossier-mirror-write.service.ts
```

Elle fait un `upsert` dans :

```text
messaging_client_dossier_mirror
```

La cle naturelle est :

```text
messaging_chat_id
```

Avantages :

- idempotence ;
- pas de doublon pour une conversation ;
- table miroir dediee ;
- separation entre donnees DB1 et schema natif DB2 ;
- log de synchronisation via `IntegrationSyncLogService`.

### 6.4 Lecture depuis DB2

Le module :

```text
order-call-sync
```

lit les appels DB2 de facon incrementale via curseur :

```text
OrderCallSyncCursor
```

Il traite les nouveaux appels et tente de matcher les obligations d'appel.

Avantages :

- traitement incrementiel ;
- curseur persistant ;
- batch de 200 ;
- idempotence relative par progression du curseur.

Risque :

- si un appel echoue au milieu d'un batch, le curseur avance quand meme apres le batch. Les erreurs sont loggees, mais le reprocessing individuel n'est pas garanti.

## 7. Niveau de maturite par domaine

### 7.1 Backend NestJS

Maturite : 7 / 10

Points forts :

- modules bien separes ;
- TypeORM structure ;
- guards et validation config ;
- cron et event emitter ;
- Socket.IO organise ;
- separation DB1/DB2 ;
- tests unitaires sur modules critiques recents.

Points faibles :

- certains services sont longs et concentrent beaucoup de logique metier ;
- beaucoup de flux indirects via events ;
- certains commentaires et noms gardent des traces d'anciennes regles ;
- pas de transaction globale autour de certains changements de fenetre.

### 7.2 Front commercial

Maturite : 6.5 / 10

Points forts :

- Next.js moderne ;
- Zustand pour l'etat ;
- gestion Socket.IO centralisee ;
- mapping des payloads ;
- affichage riche des badges et statuts.

Points faibles :

- l'etat front depend fortement des evenements socket ;
- reload apres rotation base sur timeout 500 ms ;
- peu de garanties si un evenement est perdu ;
- certains textes et concepts historiques restent visibles dans les composants.

### 7.3 Fenetre glissante / renouvellement

Maturite : 6.5 / 10

Points forts :

- logique maintenant claire : rapports soumis => rotation ;
- cron de rattrapage ;
- prise en compte des conversations fermees ;
- reset des rapports pour nouveaux blocs ;
- tests unitaires.

Points faibles :

- logique encore complexe ;
- dependance a plusieurs statuts (`status`, `window_status`, `is_locked`, `report_submission_status`) ;
- absence de transaction stricte pendant rotation ;
- risque de concurrence si plusieurs checks arrivent en meme temps, meme si `rotatingPostes` limite en memoire.

Risque important : `rotatingPostes` est un verrou in-memory. Si plusieurs instances backend tournent, ce verrou ne suffit pas. Il faudrait un lock distribue DB/Redis.

### 7.4 Communication DB2

Maturite : 6 / 10

Points forts :

- DB2 optionnelle ;
- table miroir dediee ;
- pas de migration DB2 automatique ;
- logs de sync ;
- upsert idempotent ;
- lecture incrementale des appels.

Points faibles :

- pas d'outbox transactionnel DB1 ;
- retry des echecs partiel ;
- `IntegrationSyncLog` journalise, mais ne semble pas piloter une file de retry robuste pour tous les types ;
- pas de contrat versionne explicite avec DB2 ;
- les mappings DB1/DB2 peuvent etre absents, ce qui produit des lignes miroir avec `id_client/id_commercial` null.

### 7.5 Observabilite

Maturite : 6 / 10

Points forts :

- logs NestJS presents ;
- `IntegrationSyncLogService` ;
- endpoint debug de fenetre ;
- system-health present ;
- documentation existante dans `docs`.

Points faibles :

- peu de correlation end-to-end visible ;
- pas de trace unique `correlationId` obligatoire sur rapport => DB2 => rotation => socket ;
- pas de dashboard d'etat de rotation par poste visible dans le front commercial ;
- pas d'alerte automatique sur sync DB2 echouee ou rotation bloquee.

## 8. Risques principaux

### Risque 1 : coherence evenementielle

Le systeme fait :

```text
DB update
event emitter
socket event
cron de rattrapage
```

Mais sans outbox transactionnel, un crash peut arriver entre DB update et event socket.

Impact :

- la DB est correcte ;
- le front ne se met pas a jour ;
- l'utilisateur croit que rien ne s'est passe.

### Risque 2 : rotation concurrente multi-instance

`rotatingPostes` evite les doubles rotations dans une seule instance Node.js.

Si le backend est scale horizontalement :

```text
instance A et instance B peuvent lancer une rotation du meme poste
```

Il faut un verrou distribue.

### Risque 3 : DB2 partiellement disponible

La soumission commerciale est decouplee de DB2, ce qui est bon pour l'utilisateur. Mais si DB2 echoue :

- le rapport reste soumis ;
- la rotation peut avancer ;
- la ligne miroir DB2 peut rester en echec.

Il faut donc un retry robuste et visible.

### Risque 4 : etats historiques

Le projet a evolue :

- ancienne logique `validated` ;
- nouvelle logique `rapport soumis` ;
- conversations fermees qui gardent leur slot ;
- reset de soumission apres promotion.

Des donnees historiques peuvent encore etre incoherentes. Le cron corrige beaucoup de cas, mais une migration de nettoyage serait plus propre.

## 9. Moyen ideal de communication entre plateformes

Le moyen ideal est une architecture "DB1 source of truth + outbox + worker de synchronisation".

### 9.1 Principe

DB1 reste la source de verite pour la messagerie :

```text
conversation_report
whatsapp_chat
contact
client_dossier
window_status
```

DB2 recoit uniquement des projections metier via tables miroir ou API dediee.

### 9.2 Outbox transactionnelle

Au moment ou un rapport est soumis, dans la meme transaction DB1 :

1. Mettre a jour `conversation_report`.
2. Inserer un evenement dans une table `integration_outbox`.

Exemple :

```text
integration_outbox
- id
- event_type = REPORT_SUBMITTED
- entity_id = chat_id
- payload_json
- target = DB2_MIRROR
- status = pending
- attempts
- next_retry_at
- created_at
- processed_at
```

Ensuite, un worker lit l'outbox et synchronise DB2.

Avantages :

- aucun evenement perdu ;
- retry fiable ;
- audit complet ;
- separation claire entre transaction metier et integration externe.

### 9.3 Idempotence DB2

La table miroir actuelle est une bonne base.

Il faut conserver :

```text
PRIMARY KEY (messaging_chat_id)
upsert idempotent
sync_status
sync_error
submitted_at
updated_at
```

Idealement ajouter :

```text
last_event_id
last_payload_hash
last_synced_at
schema_version
```

### 9.4 Worker dedie

Le worker devrait :

1. lire les outbox `pending` ;
2. appliquer l'upsert DB2 ;
3. marquer success ;
4. reprogrammer en retry exponentiel si erreur ;
5. alerter apres N echecs.

### 9.5 Evenements front depuis DB1

Le front ne doit pas attendre DB2.

Ideal :

```text
Rapport soumis dans DB1 => badge soumis immediat
Outbox DB2 => sync asynchrone
Rotation => depend de DB1 uniquement
DB2 KO => affichage admin, pas blocage commercial
```

Cette approche correspond deja partiellement au projet actuel.

## 10. Recommandations prioritaires

### Priorite 1 : verrou distribue de rotation

Utiliser Redis/Redlock ou un lock DB :

```text
window_rotation_lock(poste_id)
```

Objectif : empecher deux rotations simultanees en multi-instance.

### Priorite 2 : outbox transactionnelle

Remplacer les sync directes critiques par :

```text
transaction DB1 -> outbox -> worker -> DB2
```

Cela rend la communication DB2 beaucoup plus mature.

### Priorite 3 : dashboard de diagnostic rotation

Afficher par poste :

```text
activeCount
lockedCount
submittedCount
requiredCount
rotationWouldTrigger
lastRotationAt
lastRotationError
```

Le backend a deja une base avec `getDebugState(posteId)`.

### Priorite 4 : migration de nettoyage historique

Nettoyer les anciens etats :

```text
window_status = validated -> active/locked selon slot
released avec slot non null -> slot null
locked avec is_locked false -> is_locked true
active avec is_locked true -> is_locked false
```

### Priorite 5 : tests d'integration

Ajouter des tests e2e sur :

1. soumission de 10 rapports ;
2. 5 conversations actives + 5 fermees ;
3. DB2 indisponible ;
4. socket `WINDOW_ROTATED` emis ;
5. refresh front apres rotation.

### Priorite 6 : clarifier les noms front

`blockProgress.validated` represente maintenant des rapports soumis. Renommer progressivement :

```text
validated -> submitted
blockProgress -> reportProgress
```

Cela evitera les confusions futures.

## 11. Conclusion

Le projet est fonctionnellement riche et architecturalement serieux. Il a depasse le stade prototype. Il est proche d'un niveau production correct, mais la maturite d'integration et de coherence transactionnelle doit encore monter.

La communication entre les deux plateformes est raisonnable aujourd'hui grace a :

- DB2 optionnelle ;
- table miroir ;
- upsert idempotent ;
- logs de synchronisation ;
- retry partiel ;
- separation lecture/ecriture.

Le moyen ideal pour la suite est :

```text
DB1 source de verite
+ outbox transactionnelle
+ worker de synchronisation DB2
+ verrou distribue pour rotation
+ dashboard de diagnostic
+ tests e2e sur les flux critiques
```

Avec ces evolutions, le projet passerait d'une maturite autour de 6.5/10 a un niveau proche de 8/10 pour une exploitation stable en production.

## 12. Lecture du projet selon la feuille de route E-GICOP

Cette section reprend la vision produit E-GICOP comme referentiel cible. Le but de la plateforme n'est pas seulement de gerer un chat commercial, mais de centraliser toutes les operations qui permettent d'augmenter fortement les ventes, le suivi client, la discipline commerciale et la logistique.

Objectif strategique annonce :

```text
Multiplier les ventes actuelles par 20 en 90 jours maximum.
```

Cet objectif impose une plateforme tres orientee execution, controle, mesure et automatisation. Le projet actuel contient deja plusieurs briques utiles, mais elles doivent etre assemblees en un systeme de pilotage commercial plus strict.

## 13. Ecart fonctionnel entre le code actuel et la cible E-GICOP

### 13.1 Gestion des comptes utilisateurs

Attendu E-GICOP :

- deux types d'utilisateurs front :
  - stagiaires ;
  - vendeuses confirmees ;
- difference de remuneration selon le type ;
- acces limite au bureau GICOP ;
- double verification par email a chaque connexion.

Etat actuel observe :

- le projet contient des modules `auth`, `auth_admin`, `rbac`, `geo-access`, `whatsapp_commercial`, `commercial-session`.
- la base technique existe donc pour gerer les roles, restrictions et sessions.
- la restriction geographique existe sous forme de module, mais l'audit n'a pas confirme une obligation stricte "bureau GICOP seulement" appliquee a chaque login commercial.
- la double verification email systematique n'apparait pas comme flux central actuel.

Maturite :

```text
Socle utilisateurs / roles       : 6.5 / 10
Restriction bureau               : 4.5 / 10
Double verification email         : 3 / 10
```

Actions recommandees :

1. Ajouter un champ type commercial :
   ```text
   commercial_type = trainee | confirmed
   ```
2. Connecter ce type aux objectifs, commissions et dashboards.
3. Rendre `geo-access` bloquant a la connexion front commercial.
4. Ajouter une verification email OTP a chaque login ou a chaque nouvelle session/jour.
5. Journaliser chaque connexion :
   ```text
   user_id, poste_id, ip, localisation, device, otp_status, login_at
   ```

### 13.2 Dashboard central

Attendu E-GICOP :

- barre fixe avec rang commercial mensuel ;
- meilleure vendeuse du mois ;
- meilleure de chaque groupe ;
- meilleure du jour en prise de commande ;
- objectifs du mois ;
- stats generales ;
- stats personnelles.

Etat actuel observe :

- modules presents :
  - `targets`
  - `business-metrics`
  - `analytics`
  - `metriques`
  - `commercial-session`
  - `order-read`
  - `order-call-sync`
- le front contient deja des composants comme `ObjectifsPanel`.
- la structure pour calculer des objectifs existe, mais le dashboard cible E-GICOP necessite une consolidation plus large entre DB1, DB2, appels, horaires, plaintes et notes client.

Maturite :

```text
Objectifs commerciaux             : 6 / 10
Stats commerciales generales      : 5.5 / 10
Classements / gamification        : 5 / 10
Dashboard executif unifie          : 4.5 / 10
```

Actions recommandees :

1. Creer un module `commercial-performance` qui agrege :
   - ventes ;
   - commandes livrees ;
   - appels ;
   - conversations traitees ;
   - relances ;
   - plaintes ;
   - heures de travail ;
   - notes client.
2. Creer une table de snapshots quotidiens :
   ```text
   commercial_daily_performance
   ```
3. Creer une table de classement :
   ```text
   commercial_rankings
   ```
4. Afficher les rankings en temps reel ou quasi temps reel sur le dashboard.

### 13.3 Objectifs et statistiques

Attendu E-GICOP :

Objectifs mensuels a suivre :

- comptes ouverts ;
- commandes livrees ;
- appels sur nouveaux messages ;
- appels sur commandes annulees ;
- appels sur clientes existantes ;
- appels sur potentiels clients ;
- messages repondus ;
- plaintes traitees ;
- heures de travail ;
- absences ;
- notes client ;
- commentaires positifs / negatifs ;
- appels en absence traites ;
- messages recus / traites.

Etat actuel observe :

- certaines sources existent deja :
  - messages : `whatsapp_message`
  - conversations : `whatsapp_chat`
  - commandes DB2 : `order-read`
  - appels DB2 : `order-call-sync`
  - obligations : `call-obligations`
  - objectifs : `targets`
  - sessions : `commercial-session`
  - plaintes : pas clairement centralise comme module complet
  - notes client : pas confirme comme flux complet de notation post-conversation

Maturite :

```text
Collecte des sources              : 6 / 10
Aggregation metier                : 5 / 10
Objectifs mensuels complets       : 4.5 / 10
Controle quotidien                : 4.5 / 10
```

Actions recommandees :

1. Standardiser tous les indicateurs dans un dictionnaire :
   ```text
   metric_code
   label
   source
   period
   commercial_id
   target_value
   current_value
   ```
2. Ajouter un moteur de calcul quotidien.
3. Ajouter un ecran "Objectifs du mois" cote commercial.
4. Ajouter un ecran "Performance equipe" cote admin/superviseur.

### 13.4 Heures de travail et emploi du temps

Attendu E-GICOP :

- heure d'arrivee ;
- depart pause ;
- retour pause ;
- depart maison ;
- calcul heures par jour et par mois ;
- solde restant ;
- planning avec deux creneaux de pause ;
- consultation anticipee du planning.

Etat actuel observe :

- le module `commercial-session` existe.
- il peut servir de base pour les presences et heures de connexion.
- l'audit n'a pas confirme un systeme complet de pointage multi-etapes arrivee/pause/retour/depart.
- l'emploi du temps previsionnel et les groupes de pause ne semblent pas encore au niveau demande.

Maturite :

```text
Session commerciale               : 5.5 / 10
Pointage complet                  : 3.5 / 10
Planning / pauses                 : 3 / 10
Controle RH commercial            : 3.5 / 10
```

Actions recommandees :

1. Creer `work-schedule` :
   ```text
   commercial_id
   day
   start_at
   pause_group
   pause_start_allowed
   pause_end_allowed
   expected_end_at
   ```
2. Creer `work-attendance-events` :
   ```text
   arrivee
   depart_pause
   retour_pause
   depart
   ```
3. Bloquer certaines actions si le commercial n'est pas pointe.
4. Exposer le compteur d'heures dans le dashboard.

### 13.5 Chat WhatsApp / Messenger GICOP

Attendu E-GICOP :

1. Une cliente revient toujours au meme poste apres premiere affectation.
2. Chaque message entrant exige un rapport.
3. Maximum 10 conversations simultanees.
4. Chaque 10 conversations terminees, obligations d'appels :
   - 5 commandes annulees ;
   - 5 commandes livrees ;
   - 5 prospects sans commande ;
   - appels de plus de 1 min 30 ;
   - controle que le commercial a la derniere reponse.
5. Notation client en fin de conversation.
6. Message automatique apres relance.
7. Recap commande + photo si commande creee dans les 24h.
8. Envoi automatique code expedition.
9. Boutons d'envoi de categories d'information.

Etat actuel observe :

- affectation persistante / affinite : module `assignment-affinity` present.
- rapport conversationnel : module `gicop-report`, `client-dossier`.
- maximum 10 simultanees : logique `window` / `conversation-capacity`.
- obligations d'appels : module `call-obligations`.
- lecture DB2 appels : `order-call-sync`.
- categories d'informations : `catalog`, `canned-response`, medias.
- relances : `follow-up`.
- cloture conversationnelle : `conversation-closure`.
- recap commande / code expedition : des modules DB2/order existent, mais le flux automatique complet n'est pas confirme.
- notation client post-conversation : pas observee comme module mature complet.

Maturite :

```text
Affectation persistante           : 7 / 10
Rapport obligatoire               : 7 / 10
Limite 10 conversations           : 7 / 10
Rotation apres 10 rapports        : 7 / 10
Obligations d'appels              : 6 / 10
Controle derniere reponse          : 4.5 / 10
Notation client                   : 3 / 10
Relance automatique               : 5.5 / 10
Recap commande automatique         : 3.5 / 10
Code expedition automatique        : 3.5 / 10
Catalogue d'informations           : 6 / 10
```

Priorite produit :

Le chat est le coeur du systeme. Il doit devenir un poste de travail contraignant :

```text
pas de conversation sans rapport
pas de nouveau bloc sans rapports soumis
pas de rotation si obligations d'appels activees et non validees
pas de fermeture sans resultat commercial
```

### 13.6 Potentiel client - contacts a relancer

Attendu E-GICOP :

- liste des numeros venus sans commande ;
- historique complet conversation texte/audio/photo/video ;
- formulaire apres appel ;
- enregistrement audio.

Etat actuel observe :

- modules utiles :
  - `contact`
  - `client-dossier`
  - `follow-up`
  - `order-read`
  - `conversation-read-query`
  - `whatsapp_media`
  - `call-log`
- le potentiel client peut etre construit par croisement :
  ```text
  contact DB1 + absence commande DB2 + conversation history
  ```
- l'enregistrement audio d'appel n'est pas confirme comme flux complet de formulaire.

Maturite :

```text
Donnees contacts/prospects        : 6 / 10
Historique conversationnel        : 6.5 / 10
Formulaire post-appel             : 4.5 / 10
Audio appel rattache              : 4 / 10
```

### 13.7 Commandes annulees

Attendu E-GICOP :

- toutes les commandes non livrees ;
- formulaire apres appel ;
- audio.

Etat actuel observe :

- DB2 contient commandes et statuts.
- `order-read` et `order-call-sync` peuvent alimenter cette vue.
- `call-obligations` connait deja la categorie commande annulee.

Maturite :

```text
Acces donnees DB2                 : 6.5 / 10
Segmentation commandes annulees   : 6 / 10
Workflow commercial dedie         : 4.5 / 10
```

### 13.8 Clients a relancer apres 60 jours

Attendu E-GICOP :

- clients absents depuis plus de 60 jours ;
- formulaire apres appel ;
- audio.

Etat actuel observe :

- `follow-up`, `order-read`, `contact`, `client-dossier` sont disponibles.
- pas de confirmation d'une segmentation 60 jours complete et operationnelle.

Maturite :

```text
Relances                           : 5.5 / 10
Segmentation 60 jours              : 4.5 / 10
Workflow dedie                     : 4 / 10
```

### 13.9 Erreurs sur commande

Attendu E-GICOP :

- commandes avec erreur sur le poste ;
- joindre cliente ;
- reprogrammer livraison ;
- annuler et relancer commande ;
- annuler commande.

Etat actuel observe :

- lecture DB2 possible.
- pas de preuve d'un workflow complet d'erreurs commandes avec actions retour DB2.
- la regle actuelle limite l'ecriture DB2 a la table miroir, ce qui est prudent mais limite les actions directes sur commandes.

Maturite :

```text
Lecture erreurs commandes          : 4.5 / 10
Workflow resolution                : 3.5 / 10
Ecriture/action DB2                : 2.5 / 10
```

Decision d'architecture necessaire :

```text
Soit DB1 envoie des demandes d'action a DB2 via une table miroir/queue,
soit DB2 expose une API officielle pour modifier/reprogrammer/annuler.
```

### 13.10 Appels en absence et messages venus sur le telephone

Attendu E-GICOP :

- tous les appels en absence du poste doivent etre rappeles avant toute autre action ;
- tous les messages venus sur le poste doivent etre traites avant toute autre action.

Etat actuel observe :

- `order-call-sync` sait lire des appels manques DB2.
- `countMissedCallsSince` existe.
- les messages entrants sont dans DB1.
- pas de blocage global confirme "avant toute autre action".

Maturite :

```text
Detection appels manques           : 6 / 10
Detection messages non traites     : 6 / 10
Blocage workflow commercial        : 3.5 / 10
```

Recommandation :

Ajouter un module `commercial-action-gate` qui decide si le commercial peut :

```text
ouvrir nouvelle conversation
envoyer message
prendre pause
cloturer
soumettre rapport
```

selon les priorites :

```text
1. appels en absence
2. messages entrants non traites
3. obligations d'appels
4. conversations actives
```

### 13.11 Enregistrement des appels

Attendu E-GICOP :

- toutes les commandes doivent etre enregistrees par commercial ;
- monitoring constant.

Etat actuel observe :

- `call-log`
- `call-event`
- `order-call-sync`
- champs recording dans certains DTOs.

Maturite :

```text
Collecte appels                    : 6 / 10
Recording rattache                 : 4.5 / 10
Monitoring qualite                 : 4 / 10
```

### 13.12 Plaintes

Attendu E-GICOP :

- plainte commande non livree ;
- erreur produit ;
- code expedition non recu ;
- plainte livreur ;
- plainte commerciale ;
- plainte utilisation produit ;
- suivi jusqu'a resolution.

Etat actuel observe :

- pas de module plaintes complet identifie.
- certaines donnees peuvent venir de conversation, contact, commande DB2, notes client.

Maturite :

```text
Gestion plaintes                   : 2.5 / 10
Suivi resolution                   : 2 / 10
Reporting plaintes                 : 2 / 10
```

Module recommande :

```text
complaints
```

Champs minimum :

```text
complaint_id
client_id/contact_id
chat_id
order_id_db2
category
priority
status
assigned_to
resolution_note
created_at
resolved_at
```

## 14. Nouvelle evaluation de maturite selon E-GICOP

En tenant compte de la vision E-GICOP complete, le projet actuel est plus mature sur le chat et l'integration que sur la gestion commerciale globale.

```text
Chat commercial                    : 7 / 10
Rapport conversationnel            : 7 / 10
Fenetre 10 conversations           : 7 / 10
Integration DB2                    : 6 / 10
Objectifs et stats                 : 5 / 10
Gestion utilisateurs avancee       : 5 / 10
Temps de travail / planning        : 3.5 / 10
Potentiels clients                 : 5 / 10
Commandes annulees                 : 5 / 10
Clients a relancer                 : 4.5 / 10
Erreurs commandes                  : 3.5 / 10
Appels en absence prioritaires     : 4.5 / 10
Plaintes                           : 2.5 / 10
Pilotage global E-GICOP            : 4.5 / 10
```

Maturite globale selon la feuille de route E-GICOP :

```text
5.2 / 10
```

Cette note ne signifie pas que le code est faible. Elle signifie que le produit cible E-GICOP est beaucoup plus large que le projet actuel. Le socle technique est exploitable, mais il faut encore construire plusieurs modules metier structurants.

## 15. Roadmap conseillee en 90 jours

### Phase 1 : stabiliser le moteur commercial existant (jours 1 a 15)

Objectif : rendre le chat commercial fiable et mesurable.

Priorites :

1. Verrou distribue de rotation.
2. Dashboard debug rotation/poste.
3. Tests e2e 10 rapports soumis + conversations fermees.
4. Nettoyage historique `window_status`.
5. Renommage progressif `validated` vers `submitted`.
6. Fiabilisation `REPORT_SUBMITTED` / `WINDOW_ROTATED`.

Livrable :

```text
Une vendeuse peut gerer strictement des blocs de 10 conversations sans blocage manuel.
```

### Phase 2 : outbox DB2 et synchronisation robuste (jours 10 a 30)

Objectif : fiabiliser la communication entre plateformes.

Priorites :

1. Creer `integration_outbox`.
2. Worker DB2 avec retry exponentiel.
3. Dashboard sync DB2.
4. Alertes sur echecs DB2.
5. Contrats de payload versionnes.

Livrable :

```text
Aucun rapport soumis ne peut etre perdu pour DB2.
```

### Phase 3 : dashboard commercial minimum viable (jours 20 a 45)

Objectif : rendre visible la performance commerciale.

Priorites :

1. Objectifs mensuels.
2. Stats personnelles.
3. Classements jour/semaine/mois.
4. Appels effectues.
5. Conversations traitees.
6. Commandes prises/livrees.

Livrable :

```text
Chaque commercial voit ses objectifs, son rang et ses retards.
```

### Phase 4 : gates de priorite commerciale (jours 35 a 60)

Objectif : forcer les bonnes actions avant les actions secondaires.

Priorites :

1. Appels en absence avant toute autre action.
2. Messages entrants non traites avant nouvelle action.
3. Obligations d'appels apres bloc de 10.
4. Derniere reponse commerciale obligatoire.
5. Blocage/cloture selon regles.

Livrable :

```text
La plateforme guide et contraint le travail quotidien.
```

### Phase 5 : modules clients a valeur commerciale (jours 50 a 75)

Objectif : transformer les donnees en ventes.

Priorites :

1. Potentiels clients.
2. Commandes annulees.
3. Clients inactifs 60 jours.
4. Erreurs commandes.
5. Relances avec formulaire post-appel.
6. Audio d'appel rattache.

Livrable :

```text
Chaque segment client devient une file d'action commerciale.
```

### Phase 6 : qualite et plaintes (jours 70 a 90)

Objectif : solidifier la relation client.

Priorites :

1. Notes client post-conversation.
2. Plaintes et resolution.

Livrable :

```text
La plateforme suit la qualite commerciale et la qualite client jusqu'a resolution.
```

## 16. Architecture cible E-GICOP recommandee

Architecture cible :

```text
Front commercial
  -> Dashboard
  -> Chat
  -> Objectifs
  -> Files d'action
  -> Planning
  -> Plaintes

Backend DB1
  -> Source de verite messagerie et execution commerciale
  -> Outbox transactionnelle
  -> Moteur de regles / action gates
  -> Moteur objectifs et classements
  -> Moteur fenetre 10 conversations

Worker integration
  -> Sync DB2
  -> Retry
  -> Logs
  -> Alertes

DB2 GICOP commandes
  -> Commandes
  -> Livraisons
  -> Call logs
  -> Tables miroir messaging_*
```

Principe important :

```text
DB1 pilote l'execution commerciale.
DB2 reste la source commandes/logistique.
Les deux communiquent par projections idempotentes et outbox.
```

## 17. Conclusion complementaire selon E-GICOP

Le projet actuel est une bonne base pour construire E-GICOP, surtout sur :

- chat commercial ;
- gestion des conversations ;
- rapports ;
- integration DB2 ;
- obligations d'appels ;
- temps reel.

Mais E-GICOP demande un niveau superieur : une plateforme de discipline commerciale, pas seulement une messagerie.

Les trois piliers a construire en priorite sont :

```text
1. Execution : bloquer/guider les actions commerciales selon les priorites.
2. Mesure : objectifs, rangs, stats, heures, ventes, appels, plaintes.
3. Integration robuste : outbox DB2, retry, logs, dashboard de sync.
```

Si ces trois piliers sont ajoutes, le projet peut devenir une vraie plateforme de pilotage commercial capable de soutenir l'objectif de croissance annonce.
