# Interactions avec Contact, ConversationReport, ClientDossier et tables liees

## Objectif

Eviter que `WhatsappMessage`, `WhatsappChat` et `ChatSession` deviennent les seules tables portant toute la connaissance client. Le projet dispose deja de tables reutilisables : il faut les exploiter au lieu de dupliquer les donnees.

## 1. Interaction avec `Contact`

### Role recommande

`Contact` doit etre la source principale de l'identite client cote messaging :

- nom ;
- telephone principal ;
- `chat_id` ;
- statut commercial ;
- categorie client ;
- source ;
- lien ERP via `order_client_id` ;
- proprietaire de portefeuille ;
- statistiques legeres.

### Probleme actuel

Les informations client existent aussi dans :

- `WhatsappChat.name`
- `WhatsappChat.contact_client`
- `ConversationReport.clientName`
- `ConversationReport.ville`, `commune`, `quartier`
- `ClientDossier`
- `messaging_client_dossier_mirror`

Cette duplication est utile pour certains snapshots, mais il faut eviter que chaque table devienne une source de verite concurrente.

### Recommandation

Regle cible :

- `Contact` = identite client actuelle.
- `ContactPhone` = telephones secondaires.
- `ClientDossier` = informations commerciales enrichies et semi-stables.
- `ConversationReport` = snapshot declare a la cloture d'une conversation.
- `WhatsappChat` = affichage operationnel rapide.

## 2. Interaction avec `ConversationReport`

### Role recommande

`ConversationReport` doit rester le rapport de fin ou de validation de conversation.

Il doit porter :

- interessement client ;
- besoin exprime ;
- action suivante ;
- notes ;
- objections ;
- statut de soumission ;
- validation ;
- donnees snapshot utiles pour l'historique.

### Ce qu'il ne doit pas remplacer

`ConversationReport` ne doit pas remplacer :

- `Contact` pour l'identite client vivante ;
- `ClientDossier` pour le dossier client consolide ;
- `WhatsappChat` pour le statut courant de conversation ;
- `FollowUp` pour les actions planifiees ;
- `integration_outbox` pour la file de synchronisation externe.

### Recommandation

Garder `conversation_report.chat_id` pour compatibilite, mais ajouter a terme :

- `whatsapp_chat_id` : FK interne vers `whatsapp_chat.id`
- `contact_id` : FK vers `contact.id`
- `chat_session_id` : optionnel, pour rattacher le rapport a une session precise
- `tenant_id` : isolation multi-tenant

## 3. Interaction avec `ClientDossier`

### Role recommande

`ClientDossier` doit etre le profil commercial consolide du client.

Il peut reutiliser :

- les donnees de `Contact` ;
- les donnees de `ConversationReport` ;
- les follow-ups ;
- les appels ;
- les informations ERP.

### Recommandation

Quand un rapport est soumis ou valide :

1. `ConversationReport` conserve le snapshot de la conversation.
2. `ClientDossier` est cree ou mis a jour.
3. `Contact` est enrichi si les donnees sont fiables.
4. `FollowUp` est cree si `next_action` le demande.
5. `integration_outbox` recoit l'evenement de synchronisation externe.

## 4. Interaction avec `FollowUp`

### Role recommande

`FollowUp` doit porter les actions planifiees apres conversation :

- rappel ;
- relance ;
- relance sans commande ;
- relance fidelisation ;
- relance sans reponse.

### Recommandation

Ne pas stocker uniquement `follow_up_at` dans `ConversationReport` ou `ClientDossier`.

Regle :

- `ConversationReport.followUpAt` = intention declaree dans le rapport.
- `FollowUp` = action executable, assignable et suivie.

## 5. Interaction avec `conversation_validation`

### Role recommande

`conversation_validation` peut rester la table de criteres de validation par conversation.

Elle est utile pour :

- verifier si une conversation peut etre fermee ;
- bloquer une fermeture incomplete ;
- alimenter `closure_attempt_log`.

### Recommandation

Relier progressivement `conversation_validation` a :

- `whatsapp_chat.id`
- `conversation_report.id`
- `chat_session.id` si la validation depend d'une session.

## 6. Interaction avec `messaging_client_dossier_mirror`

### Role recommande

Cette table ressemble a une projection d'integration vers un systeme externe.

Elle ne doit pas devenir source de verite interne.

### Recommandation

La garder comme miroir de synchronisation, mais alimenter depuis :

- `Contact`
- `ClientDossier`
- `ConversationReport`
- `WhatsappChat`

et non l'inverse, sauf cas de backfill controle.

## 7. Flux cible recommande

### A l'arrivee d'un message

1. `WhatsappMessage` est cree.
2. `Contact` est trouve ou cree.
3. `WhatsappChat` est mis a jour.
4. `ChatSession` est ouverte ou prolongee.

### A la reponse commerciale

1. `WhatsappMessage` sortant est cree.
2. `WhatsappChat` met a jour `last_poste_message_at`, `outbound_message_count`, `read_only`.
3. `ChatSession.lastPosteMessageAt` est mis a jour.

### A la cloture

1. `ConversationReport` est complete et soumis.
2. `WhatsappChat.conversation_result` est mis a jour comme projection.
3. `ChatSession` est fermee.
4. `ClientDossier` est enrichi.
5. `FollowUp` est cree si necessaire.
6. `integration_outbox` recoit l'evenement.

## 8. Priorite

### Urgent

- Ajouter les liens internes manquants dans `ConversationReport` progressivement.
- Formaliser le flux rapport -> dossier -> follow-up.
- Eviter de lire `ConversationReport` comme source principale du contact.

### Reportable

- Nettoyer les anciennes colonnes snapshot une fois `ClientDossier` stabilise.
- Fusionner ou supprimer les miroirs apres audit d'integration.
