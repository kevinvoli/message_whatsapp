# Plan — Fonctionnalités d'appels

**Rédigé le :** 2026-04-10  
**Auteur :** Kevin Voli  
**Statut :** En attente de validation

---

## ⚠️ Contexte urgent — Message Meta reçu

Meta a masqué les boutons d'appel du numéro **22574864287 (GICOP Cosmetics 05 Abidjan)** car les appels WhatsApp de clients n'ont pas reçu de réponse.

> **Action immédiate requise avant tout développement :**
> Aller dans WhatsApp Manager → Outils du compte → Numéros de téléphone → 22574864287 → **Appels → Désactiver temporairement** le temps d'implémenter la fonctionnalité.
> Cela stoppe l'hémorragie auprès de Meta le temps que la solution soit en place.

---

## Souscriptions webhook Meta à configurer

> **Où configurer :** [Meta for Developers](https://developers.facebook.com) → ton App → WhatsApp → Configuration → Webhooks

### État actuel vs état cible

| Field webhook Meta | Souscrit aujourd'hui | Requis Sprint 1 | Requis Sprint 2/3 | Utilité |
|--------------------|:-------------------:|:---------------:|:-----------------:|---------|
| `messages` | ✅ Oui | ✅ Oui | ✅ Oui | Messages entrants + **appels entrants** + statuts de livraison |
| `phone_number_quality_update` | ❌ Non | ✅ Oui | ✅ Oui | Alerte quand la note qualité change → boutons masqués/restaurés |
| `account_update` | ❌ Non | ✅ Oui | ✅ Oui | Alertes compte (ex. "call buttons hidden") + changements d'état |
| `message_template_status_update` | ❌ Non | ❌ Non | 🟡 Recommandé | Approbation/rejet des templates HSM |
| `flows` | ❌ Non | ❌ Non | ❌ Non | WhatsApp Flows — non utilisé dans ce projet |
| `security` | ❌ Non | ❌ Non | 🟡 Recommandé | Événements de sécurité du compte |

---

### Détail des events par field

#### `messages` — déjà souscrit, couvre les appels

Les appels WhatsApp arrivent dans le field `messages`, pas dans un field séparé. Le payload est :

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "22574864287",
          "phone_number_id": "<PHONE_NUMBER_ID>"
        },
        "messages": [{
          "from": "2250712345678",
          "id": "wamid.xxx",
          "timestamp": "1712345678",
          "type": "call",
          "call": {
            "call_id": "abc123",
            "status": "missed"
          }
        }]
      }
    }]
  }]
}
```

**Valeurs possibles de `call.status` :**
| Valeur | Description |
|--------|-------------|
| `missed` | Appel manqué (le plus courant — client appelle, personne ne répond) |
| `ended` | Appel terminé (présent si `call.duration` > 0 — rare côté serveur) |
| `rejected` | Appel rejeté manuellement par le destinataire |

> ⚠️ **Même field que les messages texte.** Le contrôleur actuel (`POST /webhook/whatsapp`) traite déjà ce field. **Aucune modification d'URL ni de souscription n'est nécessaire pour les appels** — seul le `mapType()` dans `MetaAdapter` doit être corrigé.

---

#### `phone_number_quality_update` — À SOUSCRIRE (Sprint 1)

Envoyé quand la note de qualité du numéro change. **C'est ce field qui prévient avant que Meta masque les boutons.**

```json
{
  "field": "phone_number_quality_update",
  "value": {
    "display_phone_number": "22574864287",
    "event": "FLAGGED",
    "current_limit": "TIER_50",
    "requested_tier": "TIER_1K"
  }
}
```

**Valeurs de `event` :**
| Valeur | Signification | Action recommandée |
|--------|--------------|-------------------|
| `FLAGGED` | Qualité dégradée — risque de restriction | Alerte urgente dans le dashboard admin |
| `UNRESTRICTED` | Qualité restaurée, restrictions levées | Notification info dans le dashboard |
| `RESTRICTED` | Numéro restreint (volume limité) | Alerte critique + ticket interne |
| `DISABLED` | Numéro désactivé par Meta | Alerte critique + contact Meta |

**Modification backend nécessaire :**

Le contrôleur ignore actuellement ce field (ligne 486 de `whapi.controller.ts`) :
```typescript
// ACTUELLEMENT — ignore tout sauf 'messages'
if (field !== 'messages') {
  return { status: 'ignored', reason: `unsupported_field:${field}` };
}
```

À transformer en liste de fields gérés :
```typescript
const HANDLED_FIELDS = ['messages', 'phone_number_quality_update', 'account_update'];
if (!HANDLED_FIELDS.includes(field)) {
  return { status: 'ignored', reason: `unsupported_field:${field}` };
}
```

Et ajouter les handlers dans `WhapiService` pour créer une `SystemAlert` automatiquement.

---

#### `account_update` — À SOUSCRIRE (Sprint 1)

Envoyé lors de changements d'état du compte WhatsApp Business. **C'est ce field qui a envoyé la notification "call buttons hidden".**

```json
{
  "field": "account_update",
  "value": {
    "phone_number": "22574864287",
    "event": "ACCOUNT_VIOLATION",
    "violation_info": {
      "violation_type": "CALL_DECLINED"
    }
  }
}
```

**Événements utiles :**
| `event` | Signification |
|---------|--------------|
| `ACCOUNT_VIOLATION` | Violation détectée (appels non répondus, messages ignorés…) |
| `ACCOUNT_REVIEW` | Compte en cours de revue par Meta |
| `PHONE_NUMBER_NAME_CHANGE` | Changement de nom du numéro |
| `ACCOUNT_UPDATE` | Mise à jour générale du compte |
| `PARTNER_ADDED` / `PARTNER_REMOVED` | Changement de partenaire BSP |

---

### Comment souscrire depuis le Meta Developer Console

```
1. Aller sur developers.facebook.com → Ton App → WhatsApp → Configuration
2. Section "Webhooks" → cliquer "Gérer"
3. Pour chaque field à ajouter :
   → Cliquer "S'abonner" en face du field
   → Renseigner l'URL de callback : https://ton-domaine.com/webhook/whatsapp
   → Renseigner le Verify Token (celui stocké en base pour le canal Meta)
4. Sauvegarder
```

> **Note :** Tous les fields partagent la **même URL de callback** et le **même verify token**. Il n'y a pas d'URL différente par field — Meta envoie tout au même endpoint, différencié uniquement par `change.field`.

---

### Récapitulatif des actions côté Meta par sprint

```
Sprint 1 — URGENT
  [ ] Souscrire au field "phone_number_quality_update"
  [ ] Souscrire au field "account_update"
  [ ] Vérifier que "messages" est bien souscrit (normalement déjà fait)
  [ ] Désactiver temporairement les boutons d'appel le temps du déploiement
  [ ] Réactiver après déploiement et test de l'auto-reply

Sprint 3 — Production
  [ ] Souscrire au field "message_template_status_update" (si templates HSM utilisés)
  [ ] Souscrire au field "security" (bonne pratique production)
```

---

## Diagnostic technique de la situation actuelle

### Pourquoi les appels sont ignorés aujourd'hui

Meta envoie les événements d'appel en tant que **message de type `"call"`** dans le champ `messages` du webhook standard. La chaîne de traitement existante reçoit ce webhook mais :

```
POST /webhook/meta
  └─ WhapiController.handleMetaWebhook()
       └─ MetaAdapter.normalizeMessages()
            └─ mapType('call') → retourne 'unknown'
                 └─ InboundMessageService → IGNORÉ silencieusement
```

Le webhook Meta pour un appel manqué ressemble à :
```json
{
  "messages": [{
    "from": "2250712345678",
    "id": "wamid.xxx",
    "timestamp": "1712345678",
    "type": "call",
    "call": {
      "call_id": "xxx",
      "status": "missed"
    }
  }]
}
```

### Ce qui existe déjà ✅

| Composant | État | Détail |
|-----------|------|--------|
| `CallLog` entity/service/controller | ✅ Complet | CRUD, indices, migrations |
| Champs appel sur `Contact` | ✅ Complet | `call_status`, `last_call_date`, `call_count`, etc. |
| Marquage manuel d'un appel | ✅ Complet | `PATCH /contact/:id/call-status` + WebSocket |
| Webhook Meta reçu et parsé | ✅ Complet | Le webhook arrive, est signé, est routé |
| `CallLogHistory` (frontend) | ✅ Complet | Affichage historique |
| `CallButton` (frontend) | ✅ Complet | Modal de saisie manuelle |

### Ce qui manque ❌

- `type: 'call'` ignoré dans `MetaAdapter` et `MetaMessageType`
- Aucun `auto-reply` texte lors d'un appel manqué (raison principale du blocage Meta)
- Aucune notification WebSocket pour le commercial
- Aucun log automatique des appels manqués
- Appels internes entre agents (WebRTC + signaling Socket.io)

---

## Fonctionnalité 1 — Réception des appels clients WhatsApp (Meta)

> **Objectif :** Quand un client appelle le numéro WhatsApp Business, le système répond automatiquement par un message texte (pour satisfaire Meta), crée un log d'appel manqué, et notifie le commercial assigné en temps réel.

> **Contrainte technique non-négociable :** L'API WhatsApp Business (Meta Cloud API) **ne permet pas de décrocher un appel vocal** — elle envoie uniquement une notification d'appel entrant/manqué. Il est impossible d'établir un flux audio depuis le backend. La réponse se fait uniquement par message texte.

---

### Architecture

```
Client WhatsApp appelle le numéro
        │
        ▼
Meta Cloud API (webhook)
POST /webhook/meta  { messages: [{ type: "call", call: { status: "missed" } }] }
        │
        ▼
WhapiController.handleMetaWebhook()
        │
        ▼
MetaAdapter.normalizeMessages()         ← MODIFICATION : mapper 'call' → 'call'
        │
        ▼
InboundMessageService.handleUnified()   ← MODIFICATION : case 'call'
        ├─ InboundCallService.handleMissedCall()
        │   ├─ Trouver la conversation (chat_id du numéro appelant)
        │   ├─ Créer CallLog automatique (status: 'non_joignable', outcome: 'pas_de_réponse')
        │   ├─ Incrémenter contact.call_count
        │   ├─ Envoyer auto-reply texte via OutboundRouterService  ←  CLÉ ANTI-BLOCAGE META
        │   └─ Émettre WebSocket 'call:event' → CALL_INCOMING → poste assigné
        │
        ▼
Commercial (frontend)
        ├─ Bandeau "Appel manqué de {nom}" + bouton Rappeler
        └─ Son de notification
```

---

### Phase 1 — Backend : traitement des appels Meta

#### 1.1 Ajout du type `'call'` dans les interfaces Meta

**Fichier :** `message_whatsapp/src/whapi/interface/whatsapp-whebhook.interface.ts`

```typescript
// Étendre MetaMessageType
export type MetaMessageType =
  | 'text' | 'image' | 'audio' | 'video' | 'document'
  | 'location' | 'interactive' | 'button' | 'sticker'
  | 'call';   // ← AJOUTER

// Nouvelle interface pour le message d'appel
export interface MetaCallMessage extends MetaMessageBase {
  type: 'call';
  call: {
    call_id: string;
    status: 'missed' | 'ended' | 'rejected';
    duration?: number;  // secondes, présent si status = 'ended'
  };
}

// Ajouter à l'union MetaMessage
export type MetaMessage =
  | MetaTextMessage | MetaImageMessage | MetaAudioMessage
  | MetaVideoMessage | MetaDocumentMessage | MetaLocationMessage
  | MetaButtonMessage | MetaInteractiveMessage | MetaStickerMessage
  | MetaCallMessage;  // ← AJOUTER
```

**Fichier :** `message_whatsapp/src/webhooks/normalization/unified-message.ts`

```typescript
// Ajouter 'call' à UnifiedMessageType
export type UnifiedMessageType =
  | 'text' | 'image' | 'audio' | 'video' | 'voice' | 'document'
  | 'sticker' | 'location' | 'interactive' | 'unknown'
  | 'call';  // ← AJOUTER
```

#### 1.2 Mapping dans le MetaAdapter

**Fichier :** `message_whatsapp/src/webhooks/adapters/meta.adapter.ts`

```typescript
// Dans mapType()
case 'call':
  return 'call';

// Dans mapMessage() — extraire les données d'appel
// Ajouter un champ 'callData' dans UnifiedMessage ou utiliser le champ 'text' pour les métadonnées
```

Ajouter `callData` optionnel dans `UnifiedMessage` :
```typescript
interface UnifiedMessage {
  // ... champs existants
  callData?: {
    callId: string;
    status: 'missed' | 'ended' | 'rejected';
    duration?: number;
  };
}
```

#### 1.3 Nouveau service `InboundCallService`

**Fichier :** `message_whatsapp/src/webhooks/inbound-call.service.ts` *(nouveau)*

```typescript
@Injectable()
export class InboundCallService {
  constructor(
    @InjectRepository(WhatsappChat) private readonly chatRepo: Repository<WhatsappChat>,
    private readonly callLogService: CallLogService,
    private readonly contactService: ContactService,
    private readonly outboundRouter: OutboundRouterService,
    private readonly gateway: WhatsappMessageGateway,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  async handleMissedCall(msg: UnifiedMessage): Promise<void> {
    const { callData, chatId, channelId, tenantId, from, fromName } = msg;
    if (!callData) return;

    // 1. Trouver ou créer la conversation
    const chat = await this.chatRepo.findOne({
      where: { chat_id: chatId },
      relations: ['poste', 'contact'],
    });

    // 2. Logger l'appel manqué automatiquement
    const callLog = await this.callLogService.create({
      contact_id: chat?.contact?.id ?? null,
      commercial_id: chat?.poste?.commercial?.id ?? null,
      commercial_name: chat?.poste?.name ?? 'Non assigné',
      called_at: new Date(msg.timestamp * 1000),
      call_status: 'non_joignable',
      outcome: 'pas_de_réponse',
      duration_sec: callData.duration ?? null,
      notes: `Appel WhatsApp entrant — ${callData.status} (ID: ${callData.callId})`,
    });

    // 3. Incrémenter call_count sur le contact
    if (chat?.contact) {
      await this.contactService.incrementCallCount(chat.contact.id);
    }

    // 4. AUTO-REPLY — envoyer un message texte (obligatoire pour ne pas perdre les boutons Meta)
    // Configurable via FeatureFlag 'auto_reply_missed_call'
    const autoReplyEnabled = await this.featureFlags.isEnabled('auto_reply_missed_call');
    if (autoReplyEnabled && channelId) {
      const autoReplyText = await this.featureFlags.getValue('auto_reply_missed_call_text')
        ?? "Bonjour ! Nous avons bien reçu votre appel. Un conseiller vous rappellera dans les plus brefs délais. Merci de votre patience.";

      await this.outboundRouter.sendMessage({
        channelId,
        to: from,
        text: autoReplyText,
        tenantId,
      });
    }

    // 5. Notifier le commercial via WebSocket
    await this.gateway.emitIncomingCall(chat, callLog, fromName ?? from);
  }
}
```

#### 1.4 Mise à jour d'`InboundMessageService`

**Fichier :** `message_whatsapp/src/webhooks/inbound-message.service.ts`

```typescript
// Dans handleUnified(), ajouter avant le switch sur le type
if (unifiedMessage.type === 'call') {
  await this.inboundCallService.handleMissedCall(unifiedMessage);
  return;  // ne pas traiter comme un message classique
}
```

#### 1.5 Feature Flag : auto-reply appel manqué

Ajouter dans les flags existants (`FeatureFlagService`) :

| Clé | Type | Valeur par défaut | Description |
|-----|------|------------------|-------------|
| `auto_reply_missed_call` | boolean | `true` | Activer/désactiver la réponse automatique |
| `auto_reply_missed_call_text` | string | `"Bonjour ! Nous avons bien reçu votre appel..."` | Texte de la réponse automatique |

**Configurable depuis le panel admin** → vue Feature Flags existante.

#### 1.6 Nouveaux events WebSocket dans le Gateway

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

```typescript
public async emitIncomingCall(
  chat: WhatsappChat | null,
  callLog: CallLog,
  callerName: string,
): Promise<void> {
  if (!chat?.poste_id) return;
  this.server.to(`poste:${chat.poste_id}`).emit('call:event', {
    type: 'CALL_INCOMING',
    payload: {
      chat_id: chat.chat_id,
      contact_name: callerName,
      contact_phone: chat.contact_client,
      call_log_id: callLog.id,
      timestamp: callLog.called_at,
    },
  });
}
```

---

### Phase 2 — Frontend : notification d'appel manqué

#### 2.1 Mise à jour du store `callStore.ts`

**Fichier :** `front/src/store/callStore.ts` *(nouveau)*

```typescript
interface MissedCallNotif {
  call_log_id: string;
  chat_id: string;
  contact_name: string;
  contact_phone: string;
  timestamp: string;
  dismissed: boolean;
}

interface CallStore {
  missedCalls: MissedCallNotif[];
  addMissedCall: (call: MissedCallNotif) => void;
  dismissCall: (call_log_id: string) => void;
}
```

#### 2.2 Gestion de l'event dans `WebSocketEvents.tsx`

```typescript
// Écouter le channel 'call:event' (distinct de 'chat:event')
socket.on('call:event', (event) => {
  switch (event.type) {
    case 'CALL_INCOMING':
      callStore.addMissedCall(event.payload);
      playMissedCallSound();
      showBrowserNotification(`Appel manqué — ${event.payload.contact_name}`);
      break;
  }
});
```

#### 2.3 Composant `MissedCallBanner.tsx`

**Fichier :** `front/src/components/calls/MissedCallBanner.tsx` *(nouveau)*

- Bandeau rouge en haut de l'interface (z-index élevé)
- Affiche : icône téléphone barré, nom du contact, heure
- Bouton **"Voir la conversation"** → ouvre le chat + scrolle vers le bas
- Bouton **"Marquer comme traité"** → dismiss + met à jour le CallLog via API
- Disparaît automatiquement après 30 secondes si non interagi
- Notification Browser API si fenêtre non active

---

### Phase 3 — Panel admin : statistiques appels

#### 3.1 Endpoint métriques appels

**Fichier :** `message_whatsapp/src/metriques/metriques.service.ts`

```typescript
// Nouveau endpoint GET /api/metriques/calls
interface CallMetrics {
  total_missed_today: number;
  total_missed_week: number;
  auto_reply_sent_today: number;
  avg_callback_delay_minutes: number;    // délai entre appel manqué et rappel effectif
  calls_by_commercial: { name: string; count: number; answered: number }[];
  calls_by_hour: { hour: number; count: number }[];  // heatmap pour dimensionner les équipes
}
```

#### 3.2 Vue admin `CallsView.tsx`

**Fichier :** `admin/src/app/ui/CallsView.tsx` *(nouveau)*

- Tableau appels manqués (date, contact, commercial assigné, auto-reply envoyé, rappelé)
- Cards : appels aujourd'hui, taux de rappel, délai moyen de rappel
- Alerte si `auto_reply_missed_call = false` (risque Meta)

---

## Fonctionnalité 2 — Appels internes via WebSocket (WebRTC)

> **Objectif :** Permettre aux commerciaux et managers de s'appeler directement depuis l'interface sans quitter l'application. Communication audio peer-to-peer via WebRTC, avec signaling via Socket.io existant.

> Cette fonctionnalité est **indépendante de Meta/WhatsApp** — elle utilise uniquement le WebSocket interne du projet.

---

### Architecture

```
Commercial A (appelant)
      │  socket.emit('call:offer')
      ▼
  Gateway WebSocket (serveur de signaling uniquement)
      │  server.to('poste:B').emit('call:event', { type: 'CALL_OFFER' })
      ▼
Commercial B (appelé)
      │  Accepte → socket.emit('call:answer') → Commercial A
      │  Refuse  → socket.emit('call:reject') → Commercial A
      │
      ▼  Flux audio DIRECT peer-to-peer (ne passe PAS par le serveur)
Commercial A ←────────── WebRTC DataChannel ──────────── Commercial B
```

---

### Phase 1 — Backend : signaling WebRTC

#### 1.1 Nouveaux handlers dans le Gateway

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

```typescript
// Enrichir connectedAgents avec le nom du commercial
private connectedAgents = new Map<string, {
  commercialId: string;
  posteId: string;
  tenantId: string | null;
  tenantIds: string[];
  name: string;   // ← AJOUTER (récupéré depuis la table commercial à la connexion)
}>();

// ─── SIGNALING WebRTC ─────────────────────────────────────────────────────

@SubscribeMessage('call:offer')
async handleCallOffer(client: Socket, payload: {
  call_id: string;
  to_poste_id: string;
  offer: RTCSessionDescriptionInit;
}) {
  const caller = this.connectedAgents.get(client.id);
  if (!caller) return;
  this.server.to(`poste:${payload.to_poste_id}`).emit('call:event', {
    type: 'CALL_OFFER',
    payload: {
      call_id: payload.call_id,
      from_poste_id: caller.posteId,
      from_name: caller.name,
      offer: payload.offer,
    },
  });
}

@SubscribeMessage('call:answer')
handleCallAnswer(client: Socket, payload: {
  call_id: string;
  to_poste_id: string;
  answer: RTCSessionDescriptionInit;
}) {
  this.server.to(`poste:${payload.to_poste_id}`).emit('call:event', {
    type: 'CALL_ANSWER',
    payload: { call_id: payload.call_id, answer: payload.answer },
  });
}

@SubscribeMessage('call:ice_candidate')
handleIceCandidate(client: Socket, payload: {
  call_id: string;
  to_poste_id: string;
  candidate: RTCIceCandidateInit;
}) {
  this.server.to(`poste:${payload.to_poste_id}`).emit('call:event', {
    type: 'CALL_ICE_CANDIDATE',
    payload: { call_id: payload.call_id, candidate: payload.candidate },
  });
}

@SubscribeMessage('call:reject')
handleCallReject(client: Socket, payload: { call_id: string; to_poste_id: string }) {
  this.server.to(`poste:${payload.to_poste_id}`).emit('call:event', {
    type: 'CALL_REJECTED',
    payload: { call_id: payload.call_id },
  });
}

@SubscribeMessage('call:end')
async handleCallEnd(client: Socket, payload: {
  call_id: string;
  to_poste_id: string;
  duration_sec: number;
}) {
  const caller = this.connectedAgents.get(client.id);
  this.server.to(`poste:${payload.to_poste_id}`).emit('call:event', {
    type: 'CALL_ENDED',
    payload: { call_id: payload.call_id, duration_sec: payload.duration_sec },
  });
  // Logger l'appel interne
  await this.callLogService.create({
    commercial_id: caller?.commercialId ?? null,
    commercial_name: caller?.name ?? 'Inconnu',
    called_at: new Date(),
    call_status: 'appelé',
    outcome: 'répondu',
    duration_sec: payload.duration_sec,
    notes: `Appel interne → poste ${payload.to_poste_id}`,
  });
}

// Retourne la liste des agents disponibles (pour l'interface de sélection)
@SubscribeMessage('call:get_available_agents')
handleGetAvailableAgents(client: Socket) {
  const caller = this.connectedAgents.get(client.id);
  const agents = Array.from(this.connectedAgents.entries())
    .filter(([, a]) => a.posteId !== caller?.posteId)
    .map(([, a]) => ({ posteId: a.posteId, name: a.name }));
  client.emit('call:available_agents', agents);
}

// Credentials ICE éphémères — sécurisés HMAC, TTL 1h
@SubscribeMessage('call:get_ice_config')
handleGetIceConfig(client: Socket) {
  const ttl = Math.floor(Date.now() / 1000) + 3600;
  const username = `${ttl}:internal`;
  // credential HMAC calculé server-side (ne jamais exposer le secret TURN)
  client.emit('call:ice_config', {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // TURN configuré si env var présente
      ...(process.env.TURN_SERVER_URL ? [{
        urls: process.env.TURN_SERVER_URL,
        username,
        credential: '<hmac calculé>',
      }] : []),
    ],
  });
}
```

---

### Phase 2 — Frontend : interface d'appel interne

#### 2.1 Mise à jour du store `callStore.ts`

```typescript
interface InternalCall {
  call_id: string;
  direction: 'outgoing' | 'incoming';
  remote_poste_id: string;
  remote_name: string;
  status: 'ringing' | 'connected' | 'ended' | 'rejected';
  started_at: Date;
  duration_sec: number;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  peerConnection?: RTCPeerConnection;
}

// Fusionner avec la partie WhatsApp dans le même store
interface CallStore {
  // WhatsApp
  missedCalls: MissedCallNotif[];
  addMissedCall: (call: MissedCallNotif) => void;
  dismissCall: (id: string) => void;
  // Interne
  activeCall: InternalCall | null;
  incomingOffer: CallOffer | null;
  availableAgents: { posteId: string; name: string }[];
  initiateCall: (toPosteId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
}
```

#### 2.2 Hook `useWebRTC.ts`

**Fichier :** `front/src/hooks/useWebRTC.ts` *(nouveau)*

```typescript
export function useWebRTC(socket: Socket) {
  // 1. Récupérer la config ICE depuis le serveur (STUN/TURN)
  const iceConfig = await new Promise(resolve => {
    socket.emit('call:get_ice_config');
    socket.once('call:ice_config', resolve);
  });

  // 2. Créer la PeerConnection
  const pc = new RTCPeerConnection(iceConfig);

  // 3. Capturer le micro
  const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // 4. Écouter le flux distant
  pc.ontrack = (e) => callStore.setRemoteStream(e.streams[0]);

  // 5. Relayer les candidats ICE via socket
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('call:ice_candidate', {
        call_id: currentCallId,
        to_poste_id: remotePosteId,
        candidate: e.candidate.toJSON(),
      });
    }
  };

  return { pc, localStream };
}
```

#### 2.3 Composant `InternalCallModal.tsx`

**Fichier :** `front/src/components/calls/InternalCallModal.tsx` *(nouveau)*

```
États visuels du composant :

┌─ SÉLECTION ─────────────────────────────────────┐
│  🔍 Rechercher un agent                          │
│  ● Jean-Paul (Poste 1)        [📞 Appeler]       │
│  ● Marie-Claire (Poste 3)     [📞 Appeler]       │
└──────────────────────────────────────────────────┘

┌─ SONNERIE SORTANTE ──────────────────────────────┐
│  📞 Appel en cours vers Jean-Paul...             │
│  ⏱  0:12                                         │
│  [🔴 Raccrocher]                                 │
└──────────────────────────────────────────────────┘

┌─ SONNERIE ENTRANTE ──────────────────────────────┐
│  📲 Jean-Paul vous appelle                       │
│  [✅ Accepter]    [❌ Refuser]                   │
└──────────────────────────────────────────────────┘

┌─ EN COMMUNICATION ───────────────────────────────┐
│  🟢 Jean-Paul                                    │
│  ⏱  2:34                                         │
│  ████▒▒▒▒  (visualiseur audio)                   │
│  [🎙 Micro]    [🔴 Raccrocher]                   │
└──────────────────────────────────────────────────┘
```

#### 2.4 Bouton d'appel dans le header

**Fichier :** `front/src/components/layout/Header.tsx`

- Icône téléphone dans la barre de navigation
- Badge rouge animé si appel entrant en attente
- Clic → ouvre `InternalCallModal` en mode liste d'agents

---

## Récapitulatif des fichiers à créer / modifier

### Nouveaux fichiers

| Fichier | Priorité | Description |
|---------|----------|-------------|
| `message_whatsapp/src/webhooks/inbound-call.service.ts` | 🔴 URGENT | Traitement appels entrants Meta + auto-reply |
| `front/src/store/callStore.ts` | 🔴 URGENT | État global appels |
| `front/src/components/calls/MissedCallBanner.tsx` | 🔴 URGENT | Bandeau appel manqué WhatsApp |
| `front/src/hooks/useWebRTC.ts` | 🟡 Normal | Logique WebRTC peer-to-peer |
| `front/src/components/calls/InternalCallModal.tsx` | 🟡 Normal | Interface appel interne |
| `admin/src/app/ui/CallsView.tsx` | 🟡 Normal | Vue admin statistiques appels |

### Fichiers modifiés

| Fichier | Modification | Priorité |
|---------|-------------|----------|
| `message_whatsapp/src/whapi/interface/whatsapp-whebhook.interface.ts` | Ajout `MetaCallMessage` + `'call'` dans `MetaMessageType` | 🔴 URGENT |
| `message_whatsapp/src/webhooks/normalization/unified-message.ts` | Ajout `'call'` dans `UnifiedMessageType` + champ `callData` | 🔴 URGENT |
| `message_whatsapp/src/webhooks/adapters/meta.adapter.ts` | `mapType('call') → 'call'` + extraction `callData` | 🔴 URGENT |
| `message_whatsapp/src/webhooks/inbound-message.service.ts` | Routage vers `InboundCallService` si `type === 'call'` | 🔴 URGENT |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | `emitIncomingCall()` + handlers signaling WebRTC | 🟡 Normal |
| `front/src/components/WebSocketEvents.tsx` | Écoute `call:event` | 🔴 URGENT |
| `front/src/components/layout/Header.tsx` | Bouton appel interne + badge | 🟡 Normal |

---

## Ordre d'implémentation recommandé

```
Sprint 1 — URGENT (résoudre le blocage Meta)
  ├─ Interfaces MetaCallMessage + UnifiedMessage.callData
  ├─ MetaAdapter.mapType('call')
  ├─ InboundCallService (log + auto-reply)
  ├─ InboundMessageService routing type 'call'
  ├─ Feature flag 'auto_reply_missed_call' (texte configurable admin)
  ├─ Gateway emitIncomingCall()
  ├─ callStore (partie WhatsApp missed calls)
  ├─ WebSocketEvents écoute call:event
  └─ MissedCallBanner frontend
     └─ Puis : re-activer les boutons d'appel dans WhatsApp Manager

Sprint 2 — Appels internes WebRTC
  ├─ Enrichir connectedAgents avec 'name'
  ├─ Handlers WebRTC dans Gateway (offer/answer/ICE/end/available_agents)
  ├─ callStore (partie interne + WebRTC state)
  ├─ useWebRTC hook
  ├─ InternalCallModal + sous-composants
  └─ Bouton header

Sprint 3 — Admin + TURN server (production)
  ├─ Métriques appels backend
  ├─ CallsView admin
  └─ Configuration TURN server (Coturn) pour NAT strict
```

---

## Points d'attention

### Re-activation des boutons Meta
Une fois le Sprint 1 déployé et l'auto-reply testé sur quelques appels :
→ WhatsApp Manager → Outils du compte → Numéros de téléphone → 22574864287 → Appels → **Réactiver les boutons d'appel**

### Texte de l'auto-reply
Le texte doit être professionnel et rassurer le client. Exemple recommandé :
> *"Bonjour ! Nous avons bien reçu votre appel et nous nous excusons de ne pas avoir pu répondre. Un conseiller vous rappellera dans les plus brefs délais. Merci pour votre compréhension."*

### Permissions navigateur (appels internes)
L'appel interne nécessite l'accès au microphone (`getUserMedia`). Gérer le cas de refus avec un message d'erreur explicite.

### TURN server (appels internes en production)
STUN seul fonctionne pour ~80% des connexions. Pour les 20% derrière un NAT strict (firewall d'entreprise, 4G), un TURN server est nécessaire. Option recommandée : **Coturn** auto-hébergé. Ne jamais exposer les credentials TURN côté client — utiliser des credentials éphémères HMAC (TTL 1h) générés côté backend.

### Idempotence des appels Meta
Un appel manqué peut générer plusieurs webhooks (ringing + missed). Utiliser le `call_id` de Meta comme clé d'idempotence pour ne pas créer plusieurs `CallLog` pour le même appel.

---

## Corrections et précisions d'implémentation

Les points ci-dessous corrigent des erreurs dans les exemples de code ci-dessus, découvertes à l'analyse des entités existantes.

### 1. `CallLog.contact_id` et `CallLog.commercial_id` sont NON-NULLABLES aujourd'hui

L'entité actuelle ne permet pas `null` sur ces deux colonnes. Il faut :

**Migration BDD :**
```sql
-- Fichier : message_whatsapp/src/migrations/YYYYMMDD_call_log_nullable_ids.ts
ALTER TABLE call_log MODIFY contact_id VARCHAR(36) NULL;
ALTER TABLE call_log MODIFY commercial_id VARCHAR(36) NULL;
```

**Entité à modifier :**
```typescript
// call_log.entity.ts
@Column({ name: 'contact_id', type: 'varchar', length: 36, nullable: true })
contact_id: string | null;

@Column({ name: 'commercial_id', type: 'varchar', length: 36, nullable: true })
commercial_id: string | null;
```

**DTO à modifier :**
```typescript
// create-call-log.dto.ts
@IsOptional()
@IsString()
contact_id?: string | null;

@IsOptional()
@IsString()
commercial_id?: string | null;
```

### 2. `ContactService.incrementCallCount()` n'existe pas

La méthode n'existe pas sur `ContactService`. Dans `InboundCallService`, injecter directement le repository :

```typescript
// NE PAS utiliser : await this.contactService.incrementCallCount(id)
// UTILISER :
@InjectRepository(Contact)
private readonly contactRepo: Repository<Contact>,

// Dans handleMissedCall() :
const contact = await this.contactRepo.findOne({ where: { chat_id: chatId } });
if (contact) {
  await this.contactRepo.update(contact.id, {
    call_count: (contact.call_count ?? 0) + 1,
    last_call_date: new Date(msg.timestamp * 1000),
    call_status: CallStatus.Non_Joignable,
  });
}
```

### 3. `WhatsappChat` n'a pas de relation `contact`

La relation `chat.contact` n'existe pas sur l'entité `WhatsappChat`. Pour retrouver le contact lié, passer par `contact_client` (le numéro de téléphone) ou chercher directement par `chat_id` :

```typescript
// NE PAS utiliser : chat.contact
// UTILISER :
const contact = await this.contactRepo.findOne({ where: { chat_id: chatId } });
```

### 4. `emitIncomingCall()` — gérer le cas "pas de poste assigné"

Si `chat` est null ou sans `poste_id`, ne pas silencieusement ignorer — broadcaster à tous les agents connectés (sécurité) :

```typescript
public async emitIncomingCall(chat, callLog, callerName) {
  if (!chat?.poste_id) {
    // Broadcast à tous — appel non assigné
    this.server.emit('call:event', {
      type: 'CALL_INCOMING',
      payload: {
        chat_id: chat?.chat_id ?? null,
        contact_name: callerName,
        contact_phone: chat?.contact_client ?? callerName,
        call_log_id: callLog.id,
        timestamp: callLog.called_at,
        unassigned: true,  // ← signaler au frontend que personne n'est assigné
      },
    });
    return;
  }
  this.server.to(`poste:${chat.poste_id}`).emit('call:event', {
    type: 'CALL_INCOMING',
    payload: {
      chat_id: chat.chat_id,
      contact_name: callerName,
      contact_phone: chat.contact_client,
      call_log_id: callLog.id,
      timestamp: callLog.called_at,
      unassigned: false,
    },
  });
}
```

### 5. Enregistrement d'`InboundCallService` dans le module

```typescript
// whapi.module.ts — ajouter dans providers[]
InboundCallService,
```

### 6. `OutboundRouterService.sendTextMessage()` — signature correcte

Vérifier la signature dans `outbound-router.service.ts` avant implémentation. Elle accepte :
```typescript
sendTextMessage(params: { text: string; to: string; channelId: string }): Promise<void>
```
Ne pas confondre avec `sendMessage()` qui a une signature différente.

---

## Variables d'environnement à ajouter (Sprint 2 + Sprint 3)

| Variable | Exemple | Description |
|----------|---------|-------------|
| `TURN_SERVER_URL` | `turn:turn.mondomaine.com:3478` | URL du serveur TURN (optionnel en dev) |
| `TURN_SECRET` | `supersecret` | Secret HMAC pour credentials éphémères TURN |
| `TURN_TTL_SECONDS` | `3600` | Durée de vie des credentials TURN (défaut 1h) |

À ajouter dans `.env` et dans la validation Joi de `main.ts` (Sprint 2 seulement).

---

## Plan de tests

### Sprint 1 — Tests backend

| Test | Type | Fichier |
|------|------|---------|
| `MetaAdapter` mappe correctement un message de type `call` | Unit | `meta.adapter.spec.ts` |
| `InboundCallService` crée un `CallLog` sur appel manqué | Unit | `inbound-call.service.spec.ts` |
| `InboundCallService` — idempotence (même `call_id` deux fois → 1 seul log) | Unit | `inbound-call.service.spec.ts` |
| `InboundCallService` — auto-reply envoyé via `OutboundRouterService` | Unit | `inbound-call.service.spec.ts` |
| `InboundMessageService` route `type: 'call'` vers `InboundCallService` | Unit | `inbound-message.service.spec.ts` |
| Webhook Meta avec payload d'appel → 200 + log créé | E2E | `whapi.e2e-spec.ts` |

### Sprint 1 — Tests manuels

1. Simuler un appel depuis un numéro de test vers le numéro Meta
2. Vérifier dans la BDD : un `CallLog` créé, `contact.call_count` incrémenté
3. Vérifier que l'auto-reply a été envoyé (côté client de test)
4. Vérifier que le commercial reçoit la notification WebSocket (`call:event` dans les DevTools)
5. Vérifier que le `MissedCallBanner` s'affiche dans le frontend

### Sprint 2 — Tests manuels appels internes

1. Ouvrir deux onglets avec deux comptes commerciaux différents
2. Agent A initie un appel vers Agent B → Agent B voit le bandeau entrant
3. Agent B accepte → flux audio établi (vérifier micro des deux côtés)
4. Agent A ou B raccroche → `CallLog` interne créé
5. Tester le cas Agent B refuse → notification "Appel refusé" côté Agent A
6. Tester la déconnexion en plein appel (fermeture d'onglet)

---

## Checklist de déploiement Sprint 1

```
Avant déploiement :
  [ ] Migration BDD exécutée (call_log.contact_id et commercial_id nullable)
  [ ] Feature flag 'auto_reply_missed_call' créé en base (valeur: true)
  [ ] Texte auto-reply vérifié et validé par le responsable commercial
  [ ] Tests unitaires passent (npm run test)
  [ ] Build TypeScript 0 erreur (npm run build)

Après déploiement :
  [ ] Tester un appel entrant sur le numéro de test
  [ ] Vérifier le CallLog en base
  [ ] Vérifier l'auto-reply reçu côté client
  [ ] Vérifier la notification WebSocket dans l'app commerciale
  [ ] Aller dans WhatsApp Manager → Réactiver les boutons d'appel sur 22574864287
  [ ] Tester un appel réel et confirmer que les boutons restent actifs (Meta mesure sur 7 jours)
```
