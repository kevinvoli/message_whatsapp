# Rapport - Fonctionnalite Conversations en lecture seule

**Date** : 2026-05-01
**Projet** : WhatsApp Business (NestJS + TypeORM + MySQL / Next.js)
**Auteur** : Team Lead (analyse automatisee du codebase)

---

## 1. Etat actuel

### 1.1 Definition de la lecture seule

La lecture seule (read_only = true) est un drapeau booleen sur whatsapp_chat.
Quand actif, le commercial ne peut plus envoyer de message. Verrou temporaire.

### 1.2 Declencheurs - Mise en lecture seule

D1 - Message texte commercial
  Fichier : message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts ligne 218
  Condition : data.poste_id et !channel.poste_id
  Traduction : commercial dans un poste ET canal non dedie
  Action : chatRepository.update({ chat_id }, { read_only: true })

D2 - Media commercial
  Fichier : whatsapp_message.service.ts ligne 390
  Condition : channel.poste_id ? {} : { read_only: true }

D3 - Localisation commercial
  Fichier : whatsapp_message.service.ts ligne 502
  Condition : data.poste_id et !channel.poste_id

D4 - Orchestrateur auto-message
  Fichier : auto-message-orchestrator.service.ts ligne 161
  Verrou pose pendant le delai avant envoi du message auto
  Action : chatService.update(chatId, { read_only: true }) + socket CONVERSATION_READONLY

D5 - Gateway WebSocket (apres confirmation envoi)
  Fichier : whatsapp_message.gateway.ts ligne 900
  Condition : !readOnlyBlocked (flag no_read_only du canal non active)

### 1.3 Declencheurs - Levee du verrou

1. Message client entrant : inbound-message.service.ts ligne 176 -> read_only: false
2. WebSocket nouveau message : whatsapp_message.gateway.ts ligne 969
3. Fin auto-message : auto-message-orchestrator.service.ts lignes 237 et 289
4. Erreur auto-message : auto-message-orchestrator.service.ts ligne 216
5. Fermeture conversation : read-only-enforcement.job.ts ligne 111

### 1.4 Exception - Canal avec no_read_only = true

Si canal.no_read_only actif, lecture seule jamais appliquee.
Verifie via channelService.isReadOnlyBlocked(channelId) qui lit channel.no_read_only.
Controle dans : whatsapp_message.gateway.ts, auto-message-orchestrator.service.ts.

### 1.5 Impact sur le dispatcher

dispatcher.service.ts ignore les conversations read_only = true :
Lignes 342, 434, 488, 719, 784, 829 (reinjection, dispatch, SLA, comptages)

---

## 2. Schema logique du flux

  COMMERCIAL ENVOIE UN MESSAGE
    -> createAgentMessage() / createAgentMediaMessage() / createAgentLocationMessage()
    -> canal.no_read_only = true ? SKIP (jamais en lecture seule)
    -> poste_id present ET canal non dedie ?
         -> chatRepository.update({ read_only: true })
         -> socket CONVERSATION_READONLY emis vers poste:xxx
         -> [FRONTEND] WebSocketEvents.tsx recoit CONVERSATION_READONLY
         -> chatStore.upsertConversationPatch({ readonly: true })
         -> ChatMainArea.tsx : disabled={selectedConversation.readonly}
         -> ChatInput.tsx : textarea + tous boutons disabled=true

  Sortie du verrou - deux voies :
    Voie A : CLIENT ENVOIE -> read_only=false -> socket CONVERSATION_UPSERT
    Voie B : AUTO-MESSAGE ENVOYE -> read_only=false -> socket CONVERSATION_READONLY

---

## 3. Faisabilite du parametrage admin

### 3.1 Ce qui existe deja

Parametrage BINAIRE par canal via WhapiChannel.no_read_only :
- Table whapi_channels, colonne no_read_only (boolean, defaut false)
- Modifiable dans ChannelsView.tsx (modal assignation poste)
- Badge RO visible dans la liste des canaux si active

CE QUI MANQUE :
- Parametre global activer/desactiver la lecture seule pour toute la plateforme
- Limite N messages (0=desactive, 1=actuel, N=nouveau comportement)
- Parametrage par poste

### 3.2 Options de parametrage

Option A - Parametre global dans DispatchSettings
  Table : dispatch_settings
  Colonne : read_only_max_messages INT DEFAULT 1
  0=desactive / 1=actuel / N=N messages autorises
  Avantage : minimal. Inconvenient : pas de granularite par canal.

Option B - Parametre par canal
  Table : whapi_channels
  Colonne : read_only_after_messages INT NULL (NULL=suivre global)

Option C - Hybride global + override par canal (RECOMMANDEE)
  dispatch_settings.read_only_max_messages (global, defaut=1)
  whapi_channels.read_only_after_messages (NULL=global, sinon override)

### 3.3 Granularite des valeurs

  0 = Desactive : commercial peut envoyer autant de messages que voulu
  1 = Comportement actuel : lecture seule apres le 1er message commercial
  2 = Commercial peut envoyer 2 messages, bloque au 3eme
  N = Commercial peut envoyer N messages, bloque au N+1eme

### 3.4 Mecanisme du compteur necessaire

Nouveau champ : whatsapp_chat.poste_message_count_since_last_client INT DEFAULT 0
  INCREMENT : a chaque message sortant commercial
  REINIT    : a chaque message client entrant (inbound-message.service.ts)
  BLOCAGE   : poste_message_count_since_last_client >= maxMessages -> read_only = true

---

## 4. Plan implementation

Etape 1 - Migration BDD
  Fichier : message_whatsapp/src/database/migrations/ReadOnlyMaxMessages<TIMESTAMP>.ts
  whapi_channels : ADD read_only_after_messages INT NULL DEFAULT NULL
  whatsapp_chat : ADD poste_message_count_since_last_client INT NOT NULL DEFAULT 0
  dispatch_settings : ADD read_only_max_messages INT NOT NULL DEFAULT 1

Etape 2 - Entites TypeORM
  whatsapp_chat.entity.ts : ajouter poste_message_count_since_last_client (int, default 0)
  channel.entity.ts : ajouter read_only_after_messages (int, nullable)
  dispatch-settings.entity.ts : ajouter read_only_max_messages (int, default 1)

Etape 3 - Service resolveReadOnlyLimit()
  channel.service.ts : nouvelle methode resolveReadOnlyLimit(channelId: string): Promise<number>
  1. canal.no_read_only = true -> retourner 0
  2. canal.read_only_after_messages != null -> retourner cette valeur
  3. Sinon -> retourner dispatch_settings.read_only_max_messages

Etape 4 - Logique envoi
  whatsapp_message.service.ts (dans les 3 methodes)
  1. resolveReadOnlyLimit(channel.channel_id)
  2. limit === 0 -> pas de read_only
  3. limit > 0 -> incrementer poste_message_count_since_last_client
     Si compteur >= limit -> read_only = true

Etape 5 - Reinitialisation compteur
  inbound-message.service.ts
  Ajouter poste_message_count_since_last_client: 0 dans chatService.update() ligne ~176

Etape 6 - Gateway WebSocket
  whatsapp_message.gateway.ts ligne 900
  Remplacer logique simplifiee par logique compteur + limite resolue

Etape 7 - DTOs
  update-dispatch-settings.dto.ts : read_only_max_messages @IsInt @Min(0) @Max(100)
  DTOs channel : read_only_after_messages @IsInt @IsOptional

Etape 8 - Interface admin
  admin/src/app/lib/definitions.ts : types Channel et DispatchSettings mis a jour
  admin/src/app/ui/DispatchView.tsx : champ nombre max messages avant lecture seule
  admin/src/app/ui/ChannelsView.tsx : champ override lecture seule dans la modal

---

## 5. Risques

R1 - Retro-compatibilite no_read_only
  no_read_only utilise dans gateway, orchestrateur, admin.
  RECOMMANDATION : Garder no_read_only comme raccourci prioritaire (evalue en premier).
  read_only_after_messages est un enrichissement supplementaire.

R2 - Compteur conversations existantes
  Compteur=0 partout au deploiement.
  Conversations read_only=true bloquees jusqu au prochain message client.

R3 - Race condition Gateway vs Service
  Logique read_only dupliquee dans service.ts et gateway.ts.
  RECOMMANDATION : Centraliser dans le service. Gateway relit la DB.

R4 - Auto-message independant du compteur
  Orchestrateur pose read_only=true pour le delai auto. Ne pas toucher.

R5 - Canaux dedies non affectes
  channel.poste_id non null : lecture seule jamais appliquee. A conserver.

---

## 6. Resume des fichiers cles

| Fichier | Role |
|---|---|
| whatsapp_chat.entity.ts | Champ read_only (boolean) drapeau principal |
| channel.entity.ts | Champ no_read_only exception par canal |
| dispatch-settings.entity.ts | Parametres dispatch |
| whatsapp_message.service.ts | Declenchement lignes 218 390 502 |
| whatsapp_message.gateway.ts | Emission CONVERSATION_READONLY ligne 1307 |
| auto-message-orchestrator.service.ts | Verrou auto-message lignes 161 237 289 |
| inbound-message.service.ts | Levee verrou ligne 176 |
| read-only-enforcement.job.ts | Fermeture auto reset read_only ligne 111 |
| channel.service.ts | isReadOnlyBlocked() ligne 500 |
| dispatcher.service.ts | Ignore read_only dans dispatches |
| front/WebSocketEvents.tsx | Ecoute CONVERSATION_READONLY ligne 170 |
| front/ChatMainArea.tsx | Passe disabled au ChatInput ligne 65 |
| front/ChatInput.tsx | disabled sur textarea et boutons |
| front/types/chat.ts | Mapping raw.read_only vers readonly ligne 786 |
| admin/ChannelsView.tsx | Toggle no_read_only dans modal canal |
| admin/definitions.ts | Types Channel.no_read_only et DispatchSettings |
