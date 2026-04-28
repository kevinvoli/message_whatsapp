# Plan d'implementation - Relances sans modification DB2

Date : 2026-04-28  
Projet : plateforme WhatsApp / E-GICOP  
Source : `RAPPORT_FONCTIONNEMENT_RELANCES.md`  
Contrainte forte : ne pas modifier DB2.

## 1. Objectif

Ce plan vise a rendre le systeme de relances pleinement operationnel dans la plateforme actuelle, sans toucher a la DB2.

Objectif fonctionnel :

```text
Toute date de relance saisie par un commercial doit creer une vraie relance exploitable,
visible dans Mes relances, rappelable automatiquement, suivie dans les objectifs,
et controlee par le gate commercial.
```

Objectif technique :

```text
Centraliser la logique relance dans DB1, backend message_whatsapp, front commercial et admin,
sans migration, ecriture, trigger ou modification de schema DB2.
```

## 2. Regles de perimetre

### Autorise

- Modifier DB1.
- Ajouter ou modifier migrations DB1.
- Modifier backend `message_whatsapp`.
- Modifier front commercial `front`.
- Modifier admin `admin`.
- Ajouter tests unitaires et e2e.
- Lire DB2 si le code existant le fait deja.
- Utiliser les donnees DB2 existantes en lecture seule dans les menus metier.

### Interdit

- Modifier le schema DB2.
- Ajouter une table DB2.
- Ecrire des relances dans DB2.
- Ajouter un worker DB2 pour les relances.
- Modifier `messaging_client_dossier_mirror` pour les relances.
- Ajouter une migration DB2.

Decision :

```text
La table follow_up de DB1 devient la source de verite des relances.
```

## 3. Principe cible

Aujourd'hui, deux mecanismes coexistent :

```text
client_dossier.follow_up_at = date informative de dossier
follow_up = vraie file operationnelle des relances
```

La cible est :

```text
Quand un commercial saisit followUpAt dans le rapport/dossier,
le backend cree ou met a jour automatiquement une ligne follow_up dans DB1.
```

Le front ne doit pas porter cette logique metier. Il envoie les donnees, le backend decide.

## 4. Architecture cible sans DB2

```text
Front commercial
  -> GicopReportPanel
  -> FollowUpPanel
  -> ContactDetailView
  -> BusinessMenusPanel

Backend message_whatsapp
  -> ClientDossierService
  -> ConversationReportService
  -> FollowUpService
  -> FollowUpReminderService
  -> CommercialActionGateService
  -> TargetsService

DB1
  -> client_dossier
  -> conversation_report
  -> follow_up
  -> call_log
  -> whatsapp_chat
  -> whatsapp_message

DB2
  -> lecture seule si necessaire
  -> aucune modification
```

## 5. Phase 1 - Corriger le pont rapport/dossier vers vraie relance

Duree estimee : 2 a 3 jours  
Priorite : P0

### Probleme a corriger

Le front permet de saisir une date de relance dans `GicopReportPanel`, mais cette date reste dans :

```text
client_dossier.follow_up_at
conversation_report.followUpAt
```

Elle ne cree pas automatiquement de ligne dans :

```text
follow_up
```

### Tache 1.1 - Ajouter une methode d'upsert metier dans `FollowUpService`

Fichier :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
```

Ajouter une methode :

```text
upsertFromDossierOrReport()
```

Responsabilites :

- recevoir `contact_id`, `conversation_id`, `commercial_id`, `commercial_name`, `scheduled_at`, `next_action`, `notes` ;
- determiner le type de relance ;
- creer une relance si elle n'existe pas ;
- mettre a jour la relance existante si la date ou les notes changent ;
- eviter les doublons.

Cle logique recommandee :

```text
contact_id
conversation_id
commercial_id
status IN (planifiee, en_retard)
```

Regle :

```text
Une conversation active ne doit pas creer plusieurs relances ouvertes identiques.
```

### Tache 1.2 - Mapper `nextAction` vers `FollowUpType`

Mapping recommande :

```text
rappeler       -> rappel
relancer       -> relance_post_conversation
envoyer_devis  -> relance_post_conversation
fermer         -> aucune relance automatique sauf followUpAt explicite
archiver       -> aucune relance automatique sauf followUpAt explicite
```

Si `nextAction` est absent mais `followUpAt` existe :

```text
type = rappel
```

### Tache 1.3 - Brancher `ClientDossierService.upsertByChatId`

Fichier :

```text
message_whatsapp/src/client-dossier/client-dossier.service.ts
```

Apres sauvegarde du dossier :

```text
si dto.followUpAt est defini:
  creer / mettre a jour follow_up
si dto.followUpAt est null:
  ne pas supprimer automatiquement l'historique
```

Regle de suppression :

```text
Ne pas annuler automatiquement une relance existante quand followUpAt est retire,
sauf si une action utilisateur explicite "Annuler la relance" existe.
```

### Tache 1.4 - Brancher la soumission du rapport si necessaire

Fichier probable :

```text
message_whatsapp/src/gicop-report/conversation-report.service.ts
```

Objectif :

S'assurer que la relance existe au plus tard au moment de la soumission du rapport.

Regle :

```text
Sauvegarde dossier = creation relance si followUpAt
Soumission rapport = verification de securite, pas doublon
```

### Criteres d'acceptation phase 1

- Une date de relance saisie dans le panneau GICOP cree une ligne `follow_up`.
- La relance apparait dans `Mes relances`.
- La relance apparait dans le dossier contact.
- Re-sauvegarder le rapport ne cree pas de doublon.
- Modifier la date met a jour la relance ouverte existante.
- Aucune ecriture DB2 n'est faite.

## 6. Phase 2 - Corriger le gate commercial sur les relances en retard

Duree estimee : 1 jour  
Priorite : P0

### Probleme a corriger

Le gate compte actuellement les relances en retard avec :

```text
status = planifiee
scheduled_at < now
```

Mais le cron transforme les relances depassees en :

```text
status = en_retard
```

Donc apres passage du cron, certaines relances ne sont plus vues par le gate.

### Tache 2.1 - Corriger `countOverdueFollowUps`

Fichier :

```text
message_whatsapp/src/commercial-action-gate/commercial-action-gate.service.ts
```

Nouvelle regle :

```text
(status = planifiee AND scheduled_at < now)
OR status = en_retard
```

ou :

```text
status IN (planifiee, en_retard)
AND scheduled_at < now
```

Option la plus stricte :

```text
status = en_retard
OR (status = planifiee AND scheduled_at < now)
```

### Tache 2.2 - Clarifier le niveau de blocage

Regle recommandee pour commencer :

```text
relance en retard = warning
```

Regle future configurable :

```text
relance en retard de plus de X heures = block
relance critique = redirect_to_task
```

### Criteres d'acceptation phase 2

- Une relance `planifiee` depassee apparait dans le gate.
- Une relance deja `en_retard` apparait aussi dans le gate.
- Une relance `effectuee` ou `annulee` ne bloque pas.
- Le warning `OVERDUE_FOLLOWUPS` reste visible apres le cron.

## 7. Phase 3 - Ajouter creation manuelle de relance dans le front commercial

Duree estimee : 2 a 3 jours  
Priorite : P1

### Probleme a corriger

Le backend expose :

```http
POST /follow-ups
```

Mais le front commercial ne semble pas fournir de creation de relance directe.

### Tache 3.1 - Ajouter `createFollowUp` dans l'API front

Fichier :

```text
front/src/lib/followUpApi.ts
```

Ajouter :

```text
createFollowUp(payload)
```

Payload :

```text
contact_id?
conversation_id?
type
scheduled_at
notes?
```

### Tache 3.2 - Ajouter un bouton `Nouvelle relance`

Emplacements recommandes :

1. `FollowUpPanel`
2. `ContactDetailView`
3. `GicopReportPanel`
4. `BusinessMenusPanel`

Approche progressive :

```text
Sprint 1 : FollowUpPanel + GicopReportPanel
Sprint 2 : ContactDetailView
Sprint 3 : BusinessMenusPanel
```

### Tache 3.3 - Ajouter un modal de creation

Champs :

```text
type
date et heure
notes
contact si connu
conversation si connue
```

Regles UI :

- date obligatoire ;
- type obligatoire ;
- notes optionnelles ;
- etat loading ;
- erreur visible ;
- refresh de la liste apres creation.

### Criteres d'acceptation phase 3

- Un commercial peut creer une relance manuellement.
- La relance apparait immediatement dans la liste.
- Le rappel temps reel fonctionne a echeance.
- La creation ne depend pas de DB2.

## 8. Phase 4 - Ameliorer l'admin relances sans DB2

Duree estimee : 1 a 2 jours  
Priorite : P1

### Tache 4.1 - Enrichir `/follow-ups/admin`

Fichier :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
```

Objectif :

Retourner un DTO enrichi avec :

```text
contact_name
contact_phone
```

Methode :

- jointure avec `contact` en DB1 ;
- pas de lecture/ecriture DB2.

### Tache 4.2 - Corriger `getDueTodayAdmin`

Fichier :

```text
admin/src/app/lib/api/followup.api.ts
```

Changer :

```http
GET /follow-ups/due-today
```

vers :

```http
GET /follow-ups/admin/due-today
```

### Tache 4.3 - Ajouter filtres periode backend

Route :

```http
GET /follow-ups/admin
```

Ajouter :

```text
from
to
```

Regle :

```text
scheduled_at >= from
scheduled_at <= to
```

### Criteres d'acceptation phase 4

- L'admin voit nom et telephone du contact.
- L'admin peut filtrer par commercial.
- L'admin peut filtrer par statut.
- L'admin peut filtrer par periode.
- Aucune requete DB2 n'est ajoutee.

## 9. Phase 5 - Renforcer le rappel temps reel

Duree estimee : 1 a 2 jours  
Priorite : P2

### Probleme actuel

Une relance ne notifie qu'une seule fois car `reminded_at` est rempli.

### Option simple

Conserver le comportement actuel pour eviter trop de bruit.

### Option recommandee

Ajouter en DB1 :

```text
last_reminded_at
reminder_count
next_reminder_at
```

Mais cette evolution peut etre differee.

### Tache 5.1 - Ameliorer le badge front

Au lieu d'un compteur local uniquement base sur evenement socket, charger le nombre reel :

```http
GET /follow-ups/due-today
```

Puis afficher :

```text
nombre de relances dues ou en retard
```

### Tache 5.2 - Ajouter refresh apres reminder

Quand le front recoit :

```text
FOLLOW_UP_REMINDER
```

il doit :

- incrementer le badge ;
- recharger `FollowUpPanel` si la vue est ouverte ;
- eventuellement afficher une notification navigateur.

### Criteres d'acceptation phase 5

- Le badge correspond mieux a la realite DB1.
- Le panneau se met a jour apres rappel.
- Pas de modification DB2.

## 10. Phase 6 - Relances et menus metier

Duree estimee : 2 a 3 jours  
Priorite : P2

### Constat

Les menus metier :

```text
prospects
commandes annulees
anciennes clientes
```

identifient des clients a travailler, mais ne creent pas de relances structurees.

### Tache 6.1 - Ajouter action `Planifier relance`

Fichier :

```text
front/src/components/sidebar/BusinessMenusPanel.tsx
```

Pour chaque contact :

```text
Planifier relance
Ouvrir conversation
```

### Tache 6.2 - Mapper la source vers le type de relance

Mapping :

```text
prospects  -> relance_sans_commande
annulee    -> relance_post_annulation
anciennes  -> relance_fidelisation
```

### Tache 6.3 - Reutiliser `POST /follow-ups`

Aucune nouvelle route necessaire.

### Criteres d'acceptation phase 6

- Un prospect peut etre transforme en relance planifiee.
- Une commande annulee peut etre transformee en relance planifiee.
- Une ancienne cliente peut etre transformee en relance planifiee.
- Les donnees DB2 restent lues seulement via les services existants.
- La relance creee est stockee uniquement en DB1.

## 11. Phase 7 - Audit et qualite des relances

Duree estimee : 1 a 2 jours  
Priorite : P2

### Tache 7.1 - Ajouter motif d'annulation

Ajouter a DB1, table `follow_up` :

```text
cancelled_at
cancelled_by
cancel_reason
```

Adapter :

```http
PATCH /follow-ups/:id/cancel
```

DTO :

```text
reason?
```

### Tache 7.2 - Ajouter journalisation metier

Logs structures :

```text
FOLLOW_UP_CREATED
FOLLOW_UP_UPDATED
FOLLOW_UP_COMPLETED
FOLLOW_UP_CANCELLED
FOLLOW_UP_OVERDUE
FOLLOW_UP_REMINDER_SENT
```

Champs minimum :

```text
follow_up_id
contact_id
conversation_id
commercial_id
status
scheduled_at
```

### Criteres d'acceptation phase 7

- Les annulations sont auditables.
- Les actions relance sont tracables.
- Aucun flux DB2 n'est modifie.

## 12. Tests a implementer

### Tests unitaires backend P0

Fichiers a creer ou completer :

```text
message_whatsapp/src/follow-up/__tests__/follow_up.service.spec.ts
message_whatsapp/src/client-dossier/__tests__/client-dossier.service.spec.ts
message_whatsapp/src/commercial-action-gate/__tests__/commercial-action-gate.service.spec.ts
```

Scenarios :

```text
create follow_up depuis API
upsert depuis dossier avec followUpAt
pas de doublon sur sauvegarde multiple
mise a jour date relance existante
gate compte planifiee depassee
gate compte en_retard
gate ignore effectuee et annulee
```

### Tests front P1

Fichiers possibles :

```text
front/src/components/chat/FollowUpPanel.test.tsx
front/src/components/chat/GicopReportPanel.test.tsx
front/src/components/sidebar/BusinessMenusPanel.test.tsx
```

Scenarios :

```text
affichage relance
creation manuelle
completion
annulation
badge rappel
```

### Tests e2e P1

Scenario principal :

```text
1. Ouvrir une conversation.
2. Remplir le dossier GICOP avec followUpAt.
3. Enregistrer.
4. Aller dans Mes relances.
5. Verifier que la relance existe.
6. Marquer effectuee.
7. Verifier que l'objectif relances augmente.
```

Contraintes :

```text
Mocker ou ignorer DB2.
Ne verifier que DB1.
```

## 13. Ordre de livraison recommande

### Lot 1 - Correction critique

1. `FollowUpService.upsertFromDossierOrReport`
2. branchement dans `ClientDossierService.upsertByChatId`
3. correction gate relances en retard
4. tests backend P0

Livrable :

```text
La date de relance du rapport cree une vraie relance DB1 visible dans Mes relances.
```

### Lot 2 - Front commercial

1. `createFollowUp` dans `front/src/lib/followUpApi.ts`
2. modal creation relance
3. bouton `Nouvelle relance`
4. refresh apres creation

Livrable :

```text
Le commercial peut creer et gerer ses relances sans passer par DB2.
```

### Lot 3 - Admin

1. enrichissement contact dans `/follow-ups/admin`
2. correction route due today admin
3. filtres periode

Livrable :

```text
Le superviseur pilote les relances par commercial, statut et periode.
```

### Lot 4 - Menus metier

1. bouton `Planifier relance` dans prospects/annulees/anciennes
2. mapping source -> type relance
3. tests front

Livrable :

```text
Les files metier alimentent la file operationnelle de relances DB1.
```

### Lot 5 - Audit

1. motif annulation
2. logs structures
3. amelioration badge/reminder

Livrable :

```text
Les relances sont auditables et plus fiables operationnellement.
```

## 14. Definition of Done

Un lot est termine si :

1. Le comportement est implemente.
2. Les tests pertinents passent.
3. Aucun code ne modifie DB2.
4. Les migrations eventuelles ne ciblent que DB1.
5. Le front gere loading, erreur et succes.
6. Les logs permettent de diagnostiquer une relance non creee.
7. Les anciennes relances restent compatibles.

## 15. Risques et protections

| Risque | Impact | Protection |
| --- | --- | --- |
| Doublons de relances | Commercial voit plusieurs rappels identiques | Upsert par conversation/contact/commercial/status |
| Suppression involontaire | Perte d'historique relance | Ne pas annuler automatiquement sans action explicite |
| Gate incoherent | Relances en retard invisibles | Compter `en_retard` et `planifiee` depassee |
| Front calcule trop | Incoherence apres refresh | Logique creation dans backend |
| DB2 modifiee par erreur | Violation contrainte utilisateur | Aucun worker ni migration DB2 |
| Admin incomplet | Supervision faible | DTO enrichi depuis DB1 contact |

## 16. Resultat attendu

Apres implementation :

```text
Une relance saisie dans le rapport GICOP devient automatiquement une relance DB1.
Elle apparait dans Mes relances.
Elle declenche un rappel a echeance.
Elle est marquee en retard si non traitee.
Elle est visible dans le gate commercial.
Elle compte dans les objectifs quand elle est effectuee.
Elle est supervisable dans l'admin.
```

Sans toucher a DB2 :

```text
DB2 reste en lecture seule pour les segments existants.
Toutes les relances operationnelles vivent dans DB1.
```

Niveau de maturite vise pour le module relances :

```text
8 / 10
```
