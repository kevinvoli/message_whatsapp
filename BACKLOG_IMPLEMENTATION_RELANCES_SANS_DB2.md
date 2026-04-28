# Backlog d'implementation - Relances sans DB2

Date : 2026-04-28  
Projet : plateforme WhatsApp / E-GICOP  
Source : `PLAN_IMPLEMENTATION_RELANCES_SANS_DB2.md`  
Contrainte : DB2 reste en lecture seule, aucune modification DB2.

## 1. Objectif du backlog

Ce backlog transforme le plan relances sans DB2 en tickets directement exploitables pour l'implementation.

Objectif :

```text
Faire de DB1 la source de verite operationnelle des relances,
connecter le rapport GICOP a la table follow_up,
et permettre aux commerciaux et superviseurs de piloter les relances sans toucher a DB2.
```

## 2. Regles non negociables

1. Aucune migration DB2.
2. Aucune nouvelle table DB2.
3. Aucune ecriture DB2 pour les relances.
4. Aucune modification de `messaging_client_dossier_mirror` pour ce sujet.
5. Les donnees DB2 deja lues par les menus metier peuvent rester en lecture seule.
6. Toute relance operationnelle doit vivre dans DB1, table `follow_up`.

## 3. Vue globale des epics

| Epic | Nom | Priorite | Estimation |
| --- | --- | --- | --- |
| REL-E01 | Pont rapport/dossier vers `follow_up` | P0 | 3 jours |
| REL-E02 | Gate commercial et relances en retard | P0 | 1 jour |
| REL-E03 | Creation manuelle front commercial | P1 | 3 jours |
| REL-E04 | Admin relances | P1 | 2 jours |
| REL-E05 | Rappel temps reel et badge | P2 | 2 jours |
| REL-E06 | Menus metier vers relances | P2 | 3 jours |
| REL-E07 | Audit et qualite | P2 | 2 jours |
| REL-E08 | Tests et non-regression | P0/P1 | continu |

## 4. Epic REL-E01 - Pont rapport/dossier vers `follow_up`

### REL-001 - Ajouter un contrat d'upsert relance metier

Priorite : P0  
Type : Backend  
Estimation : 0.5 jour  
Fichiers :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
message_whatsapp/src/follow-up/entities/follow_up.entity.ts
```

Description :

Definir le payload interne utilise pour creer ou mettre a jour une relance depuis le dossier ou le rapport.

Champs attendus :

```text
contact_id
conversation_id
commercial_id
commercial_name
scheduled_at
next_action
notes
source
```

Critères d'acceptation :

- Le type interne est clair et reutilisable.
- Le payload ne contient aucune notion DB2.
- Le code compile sans changer les APIs publiques.

Dependances :

- Aucune.

### REL-002 - Implementer `upsertFromDossierOrReport`

Priorite : P0  
Type : Backend  
Estimation : 1 jour  
Fichier :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
```

Description :

Ajouter une methode qui cree ou met a jour une relance ouverte depuis un dossier ou rapport.

Regle anti-doublon :

```text
contact_id + conversation_id + commercial_id + status IN (planifiee, en_retard)
```

Comportement :

- si aucune relance ouverte equivalente n'existe : creation ;
- si une relance ouverte existe : mise a jour de `scheduled_at`, `type`, `notes` ;
- si une relance est `effectuee` ou `annulee` : ne pas la modifier ;
- ne jamais ecrire dans DB2.

Critères d'acceptation :

- Une seule relance ouverte existe pour le meme contact/conversation/commercial.
- Modifier la date dans le dossier met a jour la relance ouverte.
- Les relances terminees restent intactes.
- Un event `follow_up.created` ou `follow_up.updated` peut etre loggue localement.

Dependances :

- REL-001.

### REL-003 - Mapper `nextAction` vers `FollowUpType`

Priorite : P0  
Type : Backend  
Estimation : 0.5 jour  
Fichier :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
```

Mapping :

```text
rappeler       -> rappel
relancer       -> relance_post_conversation
envoyer_devis  -> relance_post_conversation
fermer         -> rappel si followUpAt explicite
archiver       -> rappel si followUpAt explicite
null           -> rappel
```

Critères d'acceptation :

- Le mapping est centralise dans le backend.
- Le front n'a pas besoin de calculer le type automatiquement.
- Le fallback est `rappel`.

Dependances :

- REL-002.

### REL-004 - Brancher l'upsert dans `ClientDossierService.upsertByChatId`

Priorite : P0  
Type : Backend  
Estimation : 1 jour  
Fichiers :

```text
message_whatsapp/src/client-dossier/client-dossier.service.ts
message_whatsapp/src/client-dossier/client-dossier.module.ts
```

Description :

Apres sauvegarde du dossier, creer ou mettre a jour une relance si `dto.followUpAt` est defini.

Regle :

```text
si dto.followUpAt existe -> upsert follow_up
si dto.followUpAt est null -> ne pas annuler automatiquement
```

Critères d'acceptation :

- Enregistrer une date de relance dans `GicopReportPanel` cree une ligne `follow_up`.
- La relance est rattachee au contact.
- La relance est rattachee a la conversation si possible.
- La relance est rattachee au commercial connecte.
- Aucune dependance DB2 n'est introduite.

Dependances :

- REL-002.
- REL-003.

### REL-005 - Ajouter une verification de securite a la soumission du rapport

Priorite : P0  
Type : Backend  
Estimation : 0.5 jour  
Fichier probable :

```text
message_whatsapp/src/gicop-report/conversation-report.service.ts
```

Description :

Au moment de soumettre un rapport, verifier que la relance existe si le rapport contient `followUpAt`.

Regle :

```text
La sauvegarde dossier cree la relance.
La soumission rapport ne fait qu'assurer l'idempotence.
```

Critères d'acceptation :

- Soumettre un rapport avec `followUpAt` ne cree pas de doublon.
- Si la sauvegarde dossier a echoue avant, la soumission peut creer la relance manquante.
- Aucune ecriture DB2 n'est faite.

Dependances :

- REL-004.

## 5. Epic REL-E02 - Gate commercial et relances en retard

### REL-006 - Corriger le comptage des relances en retard dans le gate

Priorite : P0  
Type : Backend  
Estimation : 0.5 jour  
Fichier :

```text
message_whatsapp/src/commercial-action-gate/commercial-action-gate.service.ts
```

Regle actuelle a corriger :

```text
status = planifiee AND scheduled_at < now
```

Nouvelle regle :

```text
status = en_retard
OR (status = planifiee AND scheduled_at < now)
```

Critères d'acceptation :

- Une relance `planifiee` depassee est comptee.
- Une relance `en_retard` est comptee.
- Une relance `effectuee` n'est pas comptee.
- Une relance `annulee` n'est pas comptee.

Dependances :

- Aucune.

### REL-007 - Conserver les relances en retard comme warning

Priorite : P0  
Type : Backend  
Estimation : 0.25 jour  
Fichier :

```text
message_whatsapp/src/commercial-action-gate/commercial-action-gate.service.ts
```

Description :

Clarifier le comportement actuel :

```text
OVERDUE_FOLLOWUPS = warning
```

Critères d'acceptation :

- Le gate retourne `warn` si seules les relances en retard existent.
- Les vrais blockers existants gardent la priorite.
- Le message `Effectuer les relances en retard` reste visible.

Dependances :

- REL-006.

## 6. Epic REL-E03 - Creation manuelle front commercial

### REL-008 - Ajouter `createFollowUp` dans l'API front

Priorite : P1  
Type : Front  
Estimation : 0.5 jour  
Fichier :

```text
front/src/lib/followUpApi.ts
```

Payload :

```text
contact_id?
conversation_id?
type
scheduled_at
notes?
```

Critères d'acceptation :

- La fonction appelle `POST /follow-ups`.
- Les credentials sont inclus.
- Les erreurs HTTP remontent au composant appelant.

Dependances :

- Aucune.

### REL-009 - Creer un modal reutilisable de creation relance

Priorite : P1  
Type : Front  
Estimation : 1 jour  
Nouveau fichier recommande :

```text
front/src/components/chat/CreateFollowUpModal.tsx
```

Champs :

```text
type
date et heure
notes
```

Props :

```text
contactId?
conversationId?
defaultType?
onCreated()
onClose()
```

Critères d'acceptation :

- Type obligatoire.
- Date obligatoire.
- Etat loading.
- Affichage erreur.
- Callback `onCreated` appele apres succes.
- Pas de logique DB2.

Dependances :

- REL-008.

### REL-010 - Ajouter `Nouvelle relance` dans `FollowUpPanel`

Priorite : P1  
Type : Front  
Estimation : 0.5 jour  
Fichier :

```text
front/src/components/chat/FollowUpPanel.tsx
```

Critères d'acceptation :

- Bouton visible dans l'en-tete du panneau.
- Ouvre le modal de creation.
- Recharge la liste apres creation.
- La nouvelle relance apparait dans la liste generale.

Dependances :

- REL-009.

### REL-011 - Ajouter creation relance depuis `GicopReportPanel`

Priorite : P1  
Type : Front  
Estimation : 0.5 jour  
Fichier :

```text
front/src/components/chat/GicopReportPanel.tsx
```

Description :

Ajouter une action explicite pour creer une relance depuis le dossier courant, en plus de la creation automatique backend.

Critères d'acceptation :

- Le bouton utilise le contact/conversation courant si disponible.
- Le type par defaut est coherent avec `nextAction`.
- La creation manuelle ne cree pas de doublon si le backend detecte une relance ouverte equivalente.

Dependances :

- REL-009.
- REL-004.

### REL-012 - Ajouter creation relance depuis `ContactDetailView`

Priorite : P2  
Type : Front  
Estimation : 0.5 jour  
Fichier :

```text
front/src/components/contacts/ContactDetailView.tsx
```

Critères d'acceptation :

- Depuis le detail contact, un commercial peut planifier une relance.
- La liste des relances du contact est rechargee apres creation.
- Le contact_id est transmis.

Dependances :

- REL-009.

## 7. Epic REL-E04 - Admin relances

### REL-013 - Enrichir les DTO admin avec contact DB1

Priorite : P1  
Type : Backend  
Estimation : 1 jour  
Fichiers :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
message_whatsapp/src/follow-up/follow_up.controller.ts
```

Description :

Faire retourner a `/follow-ups/admin` des champs enrichis :

```text
contact_name
contact_phone
```

Source :

```text
DB1 contact
```

Critères d'acceptation :

- L'admin ne voit plus `---` quand le contact existe.
- La pagination continue de fonctionner.
- Les filtres existants continuent de fonctionner.
- Aucune requete DB2 n'est ajoutee.

Dependances :

- Aucune.

### REL-014 - Corriger la route admin due today

Priorite : P1  
Type : Admin front  
Estimation : 0.25 jour  
Fichier :

```text
admin/src/app/lib/api/followup.api.ts
```

Correction :

```text
GET /follow-ups/due-today
```

devient :

```text
GET /follow-ups/admin/due-today
```

Critères d'acceptation :

- L'admin utilise la route protegee par `AdminGuard`.
- La fonction retourne les relances dues globales.

Dependances :

- Aucune.

### REL-015 - Ajouter filtres periode sur `/follow-ups/admin`

Priorite : P1  
Type : Backend + Admin front  
Estimation : 0.75 jour  
Fichiers :

```text
message_whatsapp/src/follow-up/follow_up.controller.ts
message_whatsapp/src/follow-up/follow_up.service.ts
admin/src/app/lib/api/followup.api.ts
admin/src/app/ui/FollowUpsView.tsx
```

Parametres :

```text
from
to
```

Regles :

```text
scheduled_at >= from
scheduled_at <= to
```

Critères d'acceptation :

- L'admin peut filtrer par date debut.
- L'admin peut filtrer par date fin.
- Les filtres peuvent se combiner avec statut et commercial.
- Pas de DB2.

Dependances :

- REL-013.

## 8. Epic REL-E05 - Rappel temps reel et badge

### REL-016 - Calculer le badge relances depuis DB1

Priorite : P2  
Type : Front  
Estimation : 0.75 jour  
Fichiers :

```text
front/src/components/sidebar/UserHeader.tsx
front/src/lib/followUpApi.ts
```

Description :

Le badge ne doit plus dependre uniquement des evenements socket en memoire.

Regle :

```text
badge = nombre de relances dues aujourd'hui ou en retard
```

Source :

```http
GET /follow-ups/due-today
```

Critères d'acceptation :

- Au chargement, le badge reflete les relances DB1.
- Au clic sur Relances, le badge peut etre remis a jour par reload.
- Un refresh page garde un badge coherent.

Dependances :

- Aucune.

### REL-017 - Recharger les relances apres `FOLLOW_UP_REMINDER`

Priorite : P2  
Type : Front temps reel  
Estimation : 0.5 jour  
Fichiers :

```text
front/src/modules/realtime/services/socket-event-router.ts
front/src/components/chat/FollowUpPanel.tsx
```

Description :

Quand le front recoit un rappel, le panneau relances doit pouvoir se recharger si ouvert.

Evenement local :

```text
followup:reminder
```

Critères d'acceptation :

- Si `FollowUpPanel` est ouvert, il recharge la liste.
- Si le panneau est ferme, le badge est mis a jour.
- La notification navigateur existante continue de fonctionner.

Dependances :

- REL-016.

## 9. Epic REL-E06 - Menus metier vers relances

### REL-018 - Ajouter action `Planifier relance` dans `BusinessMenusPanel`

Priorite : P2  
Type : Front  
Estimation : 1 jour  
Fichier :

```text
front/src/components/sidebar/BusinessMenusPanel.tsx
```

Description :

Ajouter un bouton sur les contacts des onglets :

```text
Prospects
Commandes annulees
Anciennes
```

Critères d'acceptation :

- Chaque contact affiche `Planifier relance`.
- Le bouton ouvre le modal de creation.
- Le contact_id est transmis quand disponible.
- Si seul le telephone existe, le front affiche une erreur claire ou bloque la creation.

Dependances :

- REL-009.

### REL-019 - Mapper l'onglet metier vers le type de relance

Priorite : P2  
Type : Front  
Estimation : 0.5 jour  
Fichier :

```text
front/src/components/sidebar/BusinessMenusPanel.tsx
```

Mapping :

```text
prospects -> relance_sans_commande
annulee   -> relance_post_annulation
anciennes -> relance_fidelisation
```

Critères d'acceptation :

- Le modal s'ouvre avec le bon type par defaut.
- Le commercial peut modifier le type avant creation.

Dependances :

- REL-018.

### REL-020 - Ajouter refresh visuel apres creation depuis menus metier

Priorite : P2  
Type : Front  
Estimation : 0.5 jour  
Fichier :

```text
front/src/components/sidebar/BusinessMenusPanel.tsx
```

Critères d'acceptation :

- Apres creation, le commercial voit une confirmation.
- Le contact reste visible dans la file metier, car la file vient du segment client.
- La relance creee apparait dans `Mes relances`.

Dependances :

- REL-019.

## 10. Epic REL-E07 - Audit et qualite

### REL-021 - Ajouter champs d'audit annulation en DB1

Priorite : P2  
Type : Migration DB1 + Backend  
Estimation : 1 jour  
Fichiers :

```text
message_whatsapp/src/database/migrations/*
message_whatsapp/src/follow-up/entities/follow_up.entity.ts
```

Champs :

```text
cancelled_at
cancelled_by
cancel_reason
```

Critères d'acceptation :

- Migration DB1 uniquement.
- L'entite TypeORM contient les nouveaux champs.
- Les anciennes donnees restent compatibles.
- Aucune DB2.

Dependances :

- Aucune.

### REL-022 - Adapter l'API d'annulation avec motif optionnel

Priorite : P2  
Type : Backend + Front  
Estimation : 0.75 jour  
Fichiers :

```text
message_whatsapp/src/follow-up/follow_up.controller.ts
message_whatsapp/src/follow-up/follow_up.service.ts
front/src/lib/followUpApi.ts
front/src/components/chat/FollowUpPanel.tsx
admin/src/app/lib/api/followup.api.ts
admin/src/app/ui/FollowUpsView.tsx
```

Payload :

```text
reason?
```

Critères d'acceptation :

- Annuler une relance renseigne `cancelled_at`.
- Annuler une relance renseigne `cancelled_by`.
- Le motif est optionnel au debut.
- Les anciens appels sans payload restent compatibles.

Dependances :

- REL-021.

### REL-023 - Ajouter logs structures relances

Priorite : P2  
Type : Backend  
Estimation : 0.5 jour  
Fichier :

```text
message_whatsapp/src/follow-up/follow_up.service.ts
message_whatsapp/src/follow-up/follow_up_reminder.service.ts
```

Evenements :

```text
FOLLOW_UP_CREATED
FOLLOW_UP_UPDATED
FOLLOW_UP_COMPLETED
FOLLOW_UP_CANCELLED
FOLLOW_UP_OVERDUE
FOLLOW_UP_REMINDER_SENT
```

Critères d'acceptation :

- Les logs contiennent `follow_up_id`, `contact_id`, `commercial_id`, `status`.
- Les logs permettent de diagnostiquer une relance non creee.
- Aucun dispatch DB2.

Dependances :

- REL-002.

## 11. Epic REL-E08 - Tests et non-regression

### REL-024 - Tests unitaires `FollowUpService`

Priorite : P0  
Type : Tests backend  
Estimation : 1 jour  
Fichier :

```text
message_whatsapp/src/follow-up/__tests__/follow_up.service.spec.ts
```

Scenarios :

```text
create cree une relance planifiee
upsertFromDossierOrReport cree une relance
upsertFromDossierOrReport ne cree pas de doublon
upsertFromDossierOrReport met a jour la date
complete passe en effectuee
cancel passe en annulee
markOverdue passe planifiee en en_retard
```

Critères d'acceptation :

- Tests automatises.
- Aucun test ne depend de DB2.

Dependances :

- REL-002.

### REL-025 - Tests unitaires `ClientDossierService`

Priorite : P0  
Type : Tests backend  
Estimation : 0.75 jour  
Fichier :

```text
message_whatsapp/src/client-dossier/__tests__/client-dossier.service.spec.ts
```

Scenarios :

```text
upsertByChatId sauvegarde followUpAt
upsertByChatId appelle FollowUpService si followUpAt existe
upsertByChatId ne supprime pas de relance si followUpAt null
```

Critères d'acceptation :

- Le pont dossier -> follow_up est couvert.
- Aucun mock DB2.

Dependances :

- REL-004.

### REL-026 - Tests unitaires `CommercialActionGateService`

Priorite : P0  
Type : Tests backend  
Estimation : 0.5 jour  
Fichier :

```text
message_whatsapp/src/commercial-action-gate/__tests__/commercial-action-gate.service.spec.ts
```

Scenarios :

```text
planifiee depassee -> warning
en_retard -> warning
effectuee -> ignoree
annulee -> ignoree
```

Critères d'acceptation :

- `OVERDUE_FOLLOWUPS` reste visible apres cron.

Dependances :

- REL-006.

### REL-027 - Tests front creation relance

Priorite : P1  
Type : Tests front  
Estimation : 1 jour  
Fichiers :

```text
front/src/components/chat/FollowUpPanel.test.tsx
front/src/components/chat/CreateFollowUpModal.test.tsx
```

Scenarios :

```text
ouvrir modal
valider champs obligatoires
creer une relance
recharger la liste apres creation
afficher erreur API
```

Critères d'acceptation :

- Les tests passent sans backend reel.
- API mockee.

Dependances :

- REL-009.
- REL-010.

### REL-028 - Test e2e relance depuis rapport GICOP

Priorite : P1  
Type : E2E  
Estimation : 1 jour  
Scenario :

```text
1. Ouvrir une conversation.
2. Ouvrir le dossier GICOP.
3. Renseigner followUpAt.
4. Enregistrer.
5. Ouvrir Mes relances.
6. Verifier que la relance existe.
7. Marquer effectuee.
8. Verifier qu'elle sort des relances ouvertes.
```

Critères d'acceptation :

- Le scenario ne modifie pas DB2.
- Le test verifie DB1/API uniquement.

Dependances :

- REL-004.
- REL-010.

## 12. Ordre de livraison recommande

### Lot 1 - Correction critique P0

Tickets :

```text
REL-001
REL-002
REL-003
REL-004
REL-005
REL-006
REL-007
REL-024
REL-025
REL-026
```

Livrable :

```text
La relance saisie dans le rapport GICOP devient une vraie relance DB1.
Le gate continue de voir les relances en retard.
```

### Lot 2 - Front commercial P1

Tickets :

```text
REL-008
REL-009
REL-010
REL-011
REL-027
```

Livrable :

```text
Le commercial peut creer une relance manuellement et la gerer dans Mes relances.
```

### Lot 3 - Admin P1

Tickets :

```text
REL-013
REL-014
REL-015
```

Livrable :

```text
Le superviseur voit les relances enrichies, filtrables par commercial, statut et periode.
```

### Lot 4 - Menus metier P2

Tickets :

```text
REL-012
REL-018
REL-019
REL-020
```

Livrable :

```text
Les prospects, annulees et anciennes clientes peuvent alimenter la file relance DB1.
```

### Lot 5 - Rappel et audit P2

Tickets :

```text
REL-016
REL-017
REL-021
REL-022
REL-023
REL-028
```

Livrable :

```text
Les relances sont mieux notifiees, auditables et couvertes par e2e.
```

## 13. Definition of Ready

Un ticket est pret a developper si :

1. Le fichier cible est identifie.
2. Le comportement attendu est clair.
3. La contrainte DB2 est respectee.
4. Les criteres d'acceptation sont testables.
5. Les dependances sont connues.

## 14. Definition of Done

Un ticket est termine si :

1. Le code est implemente.
2. Les tests pertinents passent.
3. Aucun changement DB2 n'est present.
4. Les migrations, si presentes, ciblent DB1 seulement.
5. Les erreurs sont gerees proprement.
6. Le comportement apres refresh front reste correct.
7. Les logs permettent de diagnostiquer les echecs critiques.

## 15. Risques a surveiller

| Risque | Tickets concernes | Protection |
| --- | --- | --- |
| Doublons de relance | REL-002, REL-004, REL-005 | Upsert par relance ouverte |
| Relance non visible apres sauvegarde | REL-004, REL-010 | Test e2e REL-028 |
| Gate perd les relances apres cron | REL-006 | Test REL-026 |
| Admin affiche contact vide | REL-013 | Jointure DB1 contact |
| Creation depuis menu metier sans contact_id | REL-018 | Bloquer ou message clair |
| DB2 modifiee par erreur | Tous | Revue diff, pas de migration DB2 |

## 16. Resultat attendu final

Apres execution du backlog :

```text
La relance GICOP devient une vraie tache commerciale DB1.
Le commercial peut la creer, la voir, la recevoir en rappel, la completer ou l'annuler.
Le superviseur peut la suivre.
Le gate peut signaler les retards.
Les objectifs peuvent compter les relances effectuees.
DB2 reste intacte.
```
