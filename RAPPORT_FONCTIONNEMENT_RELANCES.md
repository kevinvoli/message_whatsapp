# Rapport complet - Fonctionnement des relances

Date : 2026-04-28  
Projet : plateforme WhatsApp / E-GICOP  
Perimetre analyse : backend `message_whatsapp`, front commercial `front`, admin `admin`, migrations DB.

## 1. Resume executif

Le projet possede deja un socle de relances :

- une table dediee `follow_up` ;
- un module backend `follow-up` ;
- des APIs commercial et admin ;
- un panneau front `Mes relances` ;
- un rappel temps reel via Socket.IO ;
- une integration partielle aux objectifs, au ranking, au dossier client et au gate commercial.

Mais le processus n'est pas encore complet pour le besoin E-GICOP.

Le point faible principal est le suivant :

```text
La date de relance saisie dans le rapport/dossier client ne cree pas automatiquement
une vraie relance dans la table follow_up.
```

Donc un commercial peut renseigner "Date et heure de relance" dans le panneau GICOP, sauvegarder le dossier, puis ne jamais voir cette relance dans `Mes relances`, car elle reste seulement dans `client_dossier.follow_up_at` et/ou `conversation_report.followUpAt`.

Conclusion :

```text
Le systeme de relance existe, mais il est deconnecte du formulaire principal
utilise par les commerciaux.
```

## 2. Modules et fichiers concernes

### Backend relances

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/follow-up/entities/follow_up.entity.ts` | Entite TypeORM `FollowUp` |
| `message_whatsapp/src/follow-up/follow_up.service.ts` | Creation, lecture, completion, annulation, retard |
| `message_whatsapp/src/follow-up/follow_up.controller.ts` | Routes HTTP `/follow-ups` |
| `message_whatsapp/src/follow-up/follow_up_reminder.service.ts` | Cron de rappel temps reel |
| `message_whatsapp/src/follow-up/follow_up.module.ts` | Module NestJS |
| `message_whatsapp/src/realtime/publishers/follow-up.publisher.ts` | Envoi Socket.IO `FOLLOW_UP_REMINDER` |

### Dossier client et rapport GICOP

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/client-dossier/client-dossier.service.ts` | Sauvegarde dossier, lit les relances d'un contact |
| `message_whatsapp/src/client-dossier/entities/client-dossier.entity.ts` | Champ `follow_up_at` |
| `message_whatsapp/src/client-dossier/dto/upsert-dossier.dto.ts` | DTO avec `followUpAt` et `nextAction` |
| `front/src/components/chat/GicopReportPanel.tsx` | Saisie date de relance dans le rapport |

### Front commercial

| Fichier | Role |
| --- | --- |
| `front/src/lib/followUpApi.ts` | Client API relances |
| `front/src/components/chat/FollowUpPanel.tsx` | Vue `Mes relances` |
| `front/src/components/sidebar/UserHeader.tsx` | Badge de rappel relance |
| `front/src/modules/realtime/services/socket-event-router.ts` | Reception `FOLLOW_UP_REMINDER` |
| `front/src/components/contacts/ContactDetailView.tsx` | Affichage relances d'un contact |

### Admin

| Fichier | Role |
| --- | --- |
| `admin/src/app/ui/FollowUpsView.tsx` | Vue admin des relances |
| `admin/src/app/lib/api/followup.api.ts` | Client API admin |
| `admin/src/app/lib/definitions.ts` | Types front admin |

### Autres modules connectes

| Fichier | Role |
| --- | --- |
| `message_whatsapp/src/commercial-action-gate/commercial-action-gate.service.ts` | Relances en retard comme warning |
| `message_whatsapp/src/targets/targets.service.ts` | Relances effectuees dans objectifs/ranking |
| `message_whatsapp/src/ai-assistant/ai-assistant.service.ts` | Generation de message de relance IA |
| `message_whatsapp/src/contact/business-menu.service.ts` | Menus metier prospects/annulees/anciennes |

## 3. Modele de donnees actuel

### 3.1 Table `follow_up`

La table `follow_up` est creee par la migration :

```text
message_whatsapp/src/database/migrations/20260420_phase7_follow_up.ts
```

Colonnes principales :

```text
id
contact_id
conversation_id
commercial_id
commercial_name
type
status
scheduled_at
completed_at
result
notes
created_at
updated_at
deleted_at
```

La migration suivante ajoute le champ de rappel :

```text
message_whatsapp/src/database/migrations/20260424_sprint2_followup_reminder.ts
```

Champ ajoute :

```text
reminded_at
```

### 3.2 Types de relances

Le backend declare les types suivants :

```text
rappel
relance_post_conversation
relance_sans_commande
relance_post_annulation
relance_fidelisation
relance_sans_reponse
```

Ces types couvrent les besoins generaux :

- rappel simple ;
- relance apres conversation ;
- prospect sans commande ;
- commande annulee ;
- fidelisation ;
- client sans reponse.

### 3.3 Statuts de relance

Statuts disponibles :

```text
planifiee
en_retard
effectuee
annulee
```

Cycle normal :

```text
planifiee -> effectuee
planifiee -> annulee
planifiee -> en_retard -> effectuee
planifiee -> en_retard -> annulee
```

### 3.4 Index existants

La table contient des index sur :

```text
contact_id
commercial_id
scheduled_at
status
```

C'est correct pour :

- lister les relances d'un commercial ;
- lister les relances d'un contact ;
- chercher les relances dues ou en retard.

## 4. Processus actuel de creation d'une relance

### 4.1 Creation via API dediee

Route :

```http
POST /follow-ups
```

Guard :

```text
AuthGuard('jwt')
```

DTO attendu :

```text
contact_id?
conversation_id?
type
scheduled_at
notes?
```

Le backend ajoute automatiquement :

```text
commercial_id = utilisateur connecte
commercial_name = nom utilisateur connecte
status = planifiee
```

Apres sauvegarde, le service emet :

```text
follow_up.created
```

Probleme constate :

```text
Le front commercial actuel ne semble pas exposer de bouton ou formulaire direct
qui appelle POST /follow-ups.
```

Le fichier `front/src/lib/followUpApi.ts` permet seulement :

- lister ;
- lire les dues today ;
- completer ;
- annuler.

Il ne contient pas de fonction `createFollowUp`.

### 4.2 Creation via rapport GICOP

Dans `front/src/components/chat/GicopReportPanel.tsx`, le commercial saisit :

```text
Date et heure de relance
Prochaine action
```

Au clic sur `Enregistrer`, le front envoie les donnees vers :

```http
PUT /clients/by-chat/:chatId
PUT /gicop-report/:chatId
```

Le backend `ClientDossierService.upsertByChatId()` sauvegarde :

```text
client_dossier.follow_up_at
client_dossier.next_action
```

Mais il ne cree pas de ligne dans :

```text
follow_up
```

Impact :

```text
La relance saisie dans le rapport existe comme champ de dossier,
mais elle n'entre pas dans la file operationnelle des relances.
```

C'est le plus gros ecart fonctionnel.

## 5. Processus actuel d'affichage des relances

### 5.1 Front commercial - `Mes relances`

Composant :

```text
front/src/components/chat/FollowUpPanel.tsx
```

APIs appelees :

```http
GET /follow-ups/due-today
GET /follow-ups/mine
```

Le panneau affiche :

- les relances a traiter aujourd'hui ;
- toutes les relances du commercial ;
- filtre par statut ;
- bouton completer ;
- bouton annuler.

Regle d'affichage `due-today` :

```text
status IN (planifiee, en_retard)
scheduled_at <= fin de journee
```

Donc une relance prevue demain n'est pas dans la section "A traiter aujourd'hui", mais reste dans la liste generale.

### 5.2 Vue contact

Dans `ContactDetailView`, le front appelle :

```http
GET /follow-ups/by-contact/:contactId
```

Il affiche jusqu'aux 5 premieres relances du contact.

Limite :

```text
Cette vue est seulement informative : elle ne permet pas de creer ou completer
une relance directement depuis le detail contact.
```

### 5.3 Front admin

Vue :

```text
admin/src/app/ui/FollowUpsView.tsx
```

APIs :

```http
GET /follow-ups/admin
PATCH /follow-ups/:id/complete
PATCH /follow-ups/:id/cancel
```

L'admin peut :

- filtrer par statut ;
- filtrer par commercial ;
- paginer ;
- marquer effectuee ;
- annuler.

Limites :

- pas de creation admin visible ;
- filtres `from` et `to` declares dans `admin/src/app/lib/api/followup.api.ts`, mais non traites par le backend ;
- la vue admin attend `contact_name` et `contact_phone`, mais le backend retourne l'entite `FollowUp` sans jointure contact.

## 6. Processus actuel de retard

### 6.1 Cron `markOverdue`

Service :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
```

Cron :

```text
EVERY_30_MINUTES
```

Regle :

```text
status = planifiee
scheduled_at < now
deleted_at IS NULL
```

Action :

```text
status = en_retard
```

Remarque :

Le commentaire indique "toutes les 15 minutes", mais le code utilise `EVERY_30_MINUTES`.

### 6.2 Gate commercial

Service :

```text
message_whatsapp/src/commercial-action-gate/commercial-action-gate.service.ts
```

Le gate compte les relances en retard avec :

```text
status = planifiee
scheduled_at < now
```

Puis ajoute un warning :

```text
OVERDUE_FOLLOWUPS
```

Probleme :

```text
Le gate ne compte que les relances encore status = planifiee.
Si le cron a deja transforme la relance en en_retard, le gate ne la compte plus.
```

Donc une relance vraiment en retard peut disparaitre du warning apres passage du cron.

Correction attendue :

```text
Compter status IN (planifiee, en_retard) avec scheduled_at < now,
ou compter directement status = en_retard en plus.
```

## 7. Processus actuel de rappel temps reel

### 7.1 Cron de rappel

Service :

```text
message_whatsapp/src/follow-up/follow_up_reminder.service.ts
```

Cron :

```text
*/5 * * * *
```

Toutes les 5 minutes, il cherche :

```text
status = planifiee AND scheduled_at <= now AND reminded_at IS NULL
OU
status = en_retard AND reminded_at IS NULL
```

Il emet ensuite :

```text
follow_up.reminder
```

Puis marque :

```text
reminded_at = now
```

### 7.2 Diffusion Socket.IO

Publisher :

```text
message_whatsapp/src/realtime/publishers/follow-up.publisher.ts
```

Il recupere le commercial et son poste, puis envoie dans la room :

```text
poste:{posteId}
```

Evenement :

```text
chat:event
type = FOLLOW_UP_REMINDER
```

Payload :

```text
commercial_id
follow_up_id
scheduled_at
type
```

### 7.3 Reception front

Routeur :

```text
front/src/modules/realtime/services/socket-event-router.ts
```

Il verifie que :

```text
reminder.commercial_id === userId
```

Puis il declenche :

```text
window.dispatchEvent(new CustomEvent('followup:reminder'))
```

Le header commercial ecoute cet evenement et incremente un badge local.

Limites :

- le badge est uniquement en memoire front ;
- il revient a zero quand l'utilisateur clique sur `Relances` ;
- il ne reflete pas le nombre exact de relances dues en base ;
- une relance ne notifie qu'une seule fois car `reminded_at` est rempli.

## 8. Processus actuel de completion et annulation

### 8.1 Completion

Route :

```http
PATCH /follow-ups/:id/complete
```

Regles backend :

- la relance doit exister ;
- la relance doit appartenir au commercial connecte ;
- sinon le backend retourne `NotFoundException`.

Champs modifies :

```text
status = effectuee
completed_at = now
result = dto.result
notes = dto.notes si fourni
```

Evenement emis :

```text
follow_up.completed
```

### 8.2 Annulation

Route :

```http
PATCH /follow-ups/:id/cancel
```

Regles backend :

- meme controle commercial ;
- status devient `annulee`.

Limite :

```text
cancel ne renseigne pas completed_at, cancelled_at, reason ou cancelled_by.
```

Pour l'audit commercial, il manque une trace de motif d'annulation.

## 9. Integration objectifs, ranking et dashboard

Le module `targets` compte les relances effectuees :

```text
status = effectuee
completed_at entre debut et fin periode
```

Ces relances entrent dans :

- objectifs `follow_ups` ;
- objectifs `relances` ;
- ranking commercial ;
- poids de classement `RANKING_WEIGHT_FOLLOW_UPS`.

Impact du bug de creation :

```text
Si les relances saisies dans le rapport ne creent pas de follow_up,
elles ne comptent jamais dans les objectifs et le ranking.
```

## 10. Integration DB2 / ERP

Le service `IntegrationService` possede des methodes :

```text
dispatchFollowUpCreated()
dispatchFollowUpCompleted()
```

Mais aucun listener actif ne les appelle.

Le fichier :

```text
message_whatsapp/src/integration/integration.listener.ts
```

est neutralise et ne fait rien.

Conclusion :

```text
Les evenements follow_up.created et follow_up.completed sont emis,
mais ne semblent pas synchronises vers DB2/ERP dans l'etat actuel.
```

Pour E-GICOP, les relances devraient passer par l'outbox fiable DB1 -> DB2, comme les rapports.

## 11. Menus metier et relances commerciales

Le front `BusinessMenusPanel` affiche trois files :

```text
prospects
commandes annulees
anciennes clientes
```

Backend :

```text
message_whatsapp/src/contact/business-menu.service.ts
```

Sources :

- DB2 si disponible ;
- fallback DB1 via `Contact.client_category` ou inactivite.

Ces menus identifient les clients a relancer, mais ils ne sont pas des relances planifiees.

Difference importante :

```text
BusinessMenusPanel = segments clients a travailler.
FollowUpPanel = relances planifiees dans follow_up.
```

Actuellement, il manque le pont entre les deux :

```text
Depuis un prospect / annulee / ancienne cliente,
le commercial ne peut pas directement creer une relance structuree.
```

## 12. Assistance IA relance

Le service IA contient :

```text
generateFollowUpMessage()
```

Il peut generer un message court de relance selon :

```text
contactName
followUpType
context
productsMentioned
```

Mais l'analyse du front ne montre pas encore d'integration claire dans le parcours relance.

Conclusion :

```text
La generation IA existe cote backend, mais elle n'est pas encore branchee
comme outil operationnel dans le panneau de relance.
```

## 13. Bugs et ecarts detectes

### Bug 1 - La date de relance du rapport ne cree pas de relance

Gravite : critique fonctionnel  
Zone : `GicopReportPanel` + `ClientDossierService`

Constat :

Le champ `followUpAt` est sauvegarde dans le dossier, mais aucune ligne `follow_up` n'est creee.

Impact :

- relance invisible dans `Mes relances` ;
- pas de rappel Socket.IO ;
- pas de retard automatique ;
- pas de scoring objectifs ;
- pas de pilotage superviseur.

Correction recommandee :

```text
Lors de upsertByChatId ou submitReport :
si followUpAt est defini et nextAction implique rappeler/relancer,
creer ou mettre a jour une ligne follow_up.
```

### Bug 2 - Pas de creation de relance depuis le front commercial

Gravite : haute  
Zone : `front/src/lib/followUpApi.ts`

Constat :

Le backend expose `POST /follow-ups`, mais le front ne semble pas l'utiliser.

Impact :

Le commercial peut traiter une relance existante, mais ne peut pas en creer simplement depuis le panneau relances/contact.

Correction recommandee :

Ajouter :

```text
createFollowUp()
```

Puis ajouter un bouton :

```text
Nouvelle relance
```

dans :

- dossier client ;
- detail contact ;
- files metier ;
- panneau Mes relances.

### Bug 3 - Le gate commercial ne compte pas correctement les relances en retard

Gravite : haute  
Zone : `CommercialActionGateService.countOverdueFollowUps`

Constat :

Le gate compte :

```text
status = planifiee AND scheduled_at < now
```

Mais le cron transforme ensuite ces lignes en :

```text
status = en_retard
```

Impact :

Une relance en retard peut ne plus apparaitre dans les warnings du gate.

Correction recommandee :

```text
status IN (planifiee, en_retard)
AND scheduled_at < now
```

ou :

```text
(status = planifiee AND scheduled_at < now) OR status = en_retard
```

### Bug 4 - Vue admin attend des champs contact non fournis

Gravite : moyenne  
Zone : `FollowUpsView` admin + `/follow-ups/admin`

Constat :

Le front admin affiche :

```text
contact_name
contact_phone
```

Mais l'entite `FollowUp` ne contient pas ces champs, et le backend ne fait pas de jointure contact.

Impact :

Les cartes admin peuvent afficher `---` au lieu du nom et numero client.

Correction recommandee :

Retourner un DTO enrichi :

```text
followUp + contact.name + contact.phone
```

### Bug 5 - API admin due-today mal ciblee

Gravite : moyenne  
Zone : `admin/src/app/lib/api/followup.api.ts`

Constat :

La fonction admin `getDueTodayAdmin()` appelle :

```http
GET /follow-ups/due-today
```

Cette route est protegee par `AuthGuard('jwt')`, pas `AdminGuard`.

La route admin equivalente existe :

```http
GET /follow-ups/admin/due-today
```

Correction recommandee :

Changer l'API admin vers :

```http
GET /follow-ups/admin/due-today
```

### Bug 6 - Les filtres `from` et `to` admin ne sont pas implementes backend

Gravite : moyenne  
Zone : `admin/src/app/lib/api/followup.api.ts` + `FollowUpController.findAdmin`

Constat :

Le client admin declare :

```text
from
to
```

Mais le controller backend ne les lit pas.

Impact :

Impossible de filtrer les relances par periode depuis l'API actuelle.

Correction recommandee :

Ajouter dans `/follow-ups/admin` :

```text
from -> scheduled_at >= from
to -> scheduled_at <= to
```

### Bug 7 - Evenements integration follow_up non connectes

Gravite : moyenne/haute selon besoin DB2  
Zone : `IntegrationService` / `IntegrationListener`

Constat :

Les events `follow_up.created` et `follow_up.completed` sont emis, mais aucun listener actif ne les consomme.

Impact :

Les relances ne sont probablement pas synchronisees vers DB2/ERP.

Correction recommandee :

Brancher ces events sur :

```text
integration_outbox
```

avec event types :

```text
FOLLOW_UP_CREATED
FOLLOW_UP_COMPLETED
FOLLOW_UP_CANCELLED
```

### Bug 8 - Annulation peu auditable

Gravite : moyenne  
Zone : `FollowUpService.cancel`

Constat :

L'annulation ne stocke pas :

```text
cancelled_at
cancelled_by
cancel_reason
```

Impact :

Difficile d'analyser les abus ou annulations commerciales.

Correction recommandee :

Ajouter ces champs ou un journal d'evenements.

### Bug 9 - Reminder envoye une seule fois

Gravite : faible/moyenne  
Zone : `FollowUpReminderService`

Constat :

Apres le premier rappel, `reminded_at` est rempli. Le systeme ne relance plus tant que la relance reste en retard.

Impact :

Une relance critique peut rester oubliee apres une seule notification.

Correction possible :

Remplacer `reminded_at` simple par :

```text
last_reminded_at
reminder_count
next_reminder_at
```

### Bug 10 - Texte encode de facon incorrecte dans plusieurs fichiers

Gravite : faible UI mais visible  
Zone : front et backend commentaires/messages

Constat :

Plusieurs libelles apparaissent avec caracteres corrompus :

```text
PlanifiÃ©e
EffectuÃ©e
RÃ©sultat
```

Impact :

Affichage non professionnel.

Correction recommandee :

Uniformiser encodage UTF-8 et corriger les chaines visibles.

## 14. Niveau de maturite actuel du systeme de relance

Evaluation :

```text
5.5 / 10
```

Points forts :

- table dediee ;
- statuts propres ;
- cron retard ;
- cron rappel ;
- socket temps reel ;
- vue commercial ;
- vue admin ;
- integration objectifs/ranking ;
- lecture dans dossier client.

Points faibles :

- creation relance non branchee au rapport GICOP ;
- pas de creation front claire ;
- pas de synchro DB2 active ;
- gate en retard incoherent ;
- admin non enrichi avec contact ;
- pas de workflow post-appel complet ;
- pas de priorisation forte des relances ;
- pas d'audit annulation.

## 15. Processus cible recommande

### 15.1 Creation automatique depuis rapport GICOP

Regle :

```text
Si followUpAt est defini ET nextAction IN (rappeler, relancer),
alors creer ou mettre a jour une relance follow_up.
```

Mapping recommande :

```text
nextAction = rappeler -> type = rappel
nextAction = relancer -> type = relance_post_conversation
conversation_result = a_relancer -> relance_post_conversation
conversation_result = sans_reponse -> relance_sans_reponse
conversation_result = annule -> relance_post_annulation
```

Idempotence :

```text
Une conversation ne doit pas creer 10 relances identiques.
```

Cle logique possible :

```text
conversation_id + commercial_id + scheduled_at + type
```

ou ajouter :

```text
source = gicop_report
source_id = conversation_report.id
```

### 15.2 Creation manuelle depuis le front

Ajouter une creation de relance dans :

- panneau dossier client ;
- detail contact ;
- menus metier prospects/annulees/anciennes ;
- panneau Mes relances.

DTO front :

```text
contact_id
conversation_id
type
scheduled_at
notes
```

### 15.3 Relance apres appel

Apres un appel commercial, afficher :

```text
Planifier prochaine relance ?
Date / heure
Type
Notes
```

Si le commercial choisit oui :

```text
create follow_up
```

### 15.4 Synchro DB2

Chaque evenement relance doit aller dans l'outbox :

```text
FOLLOW_UP_CREATED
FOLLOW_UP_COMPLETED
FOLLOW_UP_CANCELLED
FOLLOW_UP_OVERDUE
```

Puis worker DB2 :

```text
upsert table miroir relances ou table CRM DB2
```

### 15.5 Gate commercial

Les relances en retard devraient etre une priorite configurable :

```text
warn par defaut
block si retard > X heures ou relance critique
redirect_to_task si plusieurs relances prioritaires
```

## 16. Plan de correction recommande

### Priorite P0

1. Brancher `followUpAt` du rapport/dossier vers `follow_up`.
2. Corriger `countOverdueFollowUps`.
3. Ajouter des tests unitaires pour creation automatique depuis dossier.
4. Ajouter des tests pour le gate avec `en_retard`.

### Priorite P1

1. Ajouter `createFollowUp` dans le front commercial.
2. Ajouter bouton `Nouvelle relance`.
3. Enrichir `/follow-ups/admin` avec nom et telephone contact.
4. Corriger `getDueTodayAdmin`.
5. Ajouter filtres admin `from` / `to`.

### Priorite P2

1. Brancher relances sur `integration_outbox`.
2. Ajouter audit annulation.
3. Ajouter rappels repetes configurables.
4. Integrer generation IA dans le panneau relance.
5. Ajouter creation relance depuis files metier.

## 17. Tests a ajouter

### Backend

```text
FollowUpService.create cree une relance planifiee.
FollowUpService.complete refuse une relance d'un autre commercial.
FollowUpService.markOverdue passe planifiee -> en_retard.
FollowUpReminderService emet FOLLOW_UP_REMINDER et remplit reminded_at.
ClientDossierService.upsertByChatId cree une follow_up si followUpAt + nextAction.
CommercialActionGateService compte planifiee en retard et en_retard.
```

### Front

```text
FollowUpPanel affiche due-today.
FollowUpPanel complete une relance.
FollowUpPanel annule une relance.
GicopReportPanel planifie une relance visible apres sauvegarde.
UserHeader incremente le badge sur followup:reminder.
```

### E2E

```text
Commercial ouvre conversation.
Remplit dossier avec date de relance.
Sauvegarde.
La relance apparait dans Mes relances.
Le cron la marque en retard apres echeance.
Le gate affiche OVERDUE_FOLLOWUPS.
Le commercial la marque effectuee.
Le ranking/objectifs comptent la relance effectuee.
```

## 18. Conclusion

Le systeme de relance est deja bien amorce techniquement, mais il manque le raccord le plus important entre le parcours commercial reel et la table operationnelle `follow_up`.

La correction la plus rentable est :

```text
Transformer automatiquement la date de relance du rapport GICOP
en vraie ligne follow_up.
```

Ensuite il faut corriger le gate, enrichir l'admin, ajouter la creation front et brancher les evenements sur l'outbox DB2.

Apres ces corrections, le module relances pourra passer d'un niveau de maturite estime a :

```text
5.5 / 10
```

a environ :

```text
8 / 10
```

pour le besoin E-GICOP.
