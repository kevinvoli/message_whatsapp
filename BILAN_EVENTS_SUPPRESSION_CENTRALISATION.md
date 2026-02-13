# Bilan Events - Suppression et Centralisation

Date: 2026-02-13
Perimetre: backend `message_whatsapp`, front `front`

## 1) Events a supprimer (ou corriger immediatement)

- `contact:get` cote front (`front/src/store/contactStore.ts:78`)
  - Aucun handler backend `@SubscribeMessage('contact:get')`.
  - Action: supprimer cet emit.

- `CONVERSATION_REASSIGNED` cote front (`front/src/components/WebSocketEvents.tsx:130`)
  - Non emis par le backend.
  - Action: supprimer le case front.

- `AUTO_MESSAGE_STATUS` cote front (`front/src/components/WebSocketEvents.tsx:118`)
  - Non emis par le backend.
  - Action: supprimer le case front.

- `message:status:update` listener front (`front/src/components/WebSocketEvents.tsx:216`)
  - Non emis par le backend.
  - Action: supprimer ce listener si standardisation sur `chat:event`.

## 2) Events a centraliser (decisions validees)

### 2.1 Flux conversation/message
Centraliser tout le metier sur `chat:event` + `type`.

Types deja utilises cote backend (`message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`):
- `CONVERSATION_LIST`
- `MESSAGE_LIST`
- `MESSAGE_ADD`
- `CONVERSATION_UPSERT`
- `MESSAGE_SEND_ERROR`
- `CONVERSATION_ASSIGNED`
- `CONVERSATION_REMOVED`
- `CONVERSATION_READONLY`

Action:
- conserver cette enveloppe unique pour le domaine chat.
- retirer les listeners hors enveloppe non utilises.

### 2.2 Typing
Decision:
- centraliser `typing:start` et `typing:stop` dans `chat:event`.

Contrat cible:
- `chat:event` + `type: 'TYPING_START' | 'TYPING_STOP'`
- `payload: { chat_id: string, commercial_id?: string }`

Action:
- supprimer emissions/listeners socket dedies `typing:start`/`typing:stop`.
- migrer tous les handlers front vers `chat:event`.

### 2.3 Contacts
Decision:
- conserver et enrichir `contact:event`.

Etat cible:
- canal unique `contact:event` avec plusieurs `type` metier.

Types cibles a implementer:
- `CONTACT_LIST`
- `CONTACT_UPSERT`
- `CONTACT_REMOVED`
- `CONTACT_CALL_STATUS_UPDATED`
- `CONTACT_SYNC_ERROR` (optionnel, observabilite)

Action:
- supprimer tout event contact hors ce canal (notamment `contact:get`).
- faire consommer ces types par le front dans un handler unique.

### 2.4 Queue
Etat actuel:
- `queue:updated` emis backend, pas de consumer front/admin identifie.

Decision:
- `queue:updated` doit etre consomme par l'admin via une nouvelle vue.

Action:
- creer une vue admin dediee (ex: `QueueView`) qui ecoute `queue:updated`.
- afficher positions, poste, statut actif, horodatage.
- garder l emission backend `queue:updated` telle quelle.

## 3) Plan de nettoyage recommande

1. Supprimer `contact:get` cote front.
2. Implementer les nouveaux types `contact:event` et leurs consumers front.
3. Migrer typing vers `chat:event` (`TYPING_START`/`TYPING_STOP`).
4. Creer la nouvelle vue admin de consommation `queue:updated`.
5. Documenter la matrice officielle des events (`event`, `payload`, `emetteur`, `consommateur`).

## 4) Impact attendu

- Protocole socket plus simple et stable.
- Moins de branches mortes et moins de regressions.
- Diagnostic incident plus rapide grace a un contrat evenementiel clair.
