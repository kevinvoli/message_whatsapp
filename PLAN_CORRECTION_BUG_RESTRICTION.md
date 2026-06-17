# Plan de correction — Bug restriction commerciaux
Date : 2026-06-17

## Vue d'ensemble

Le `ConversationRestrictionService` est censé empêcher un commercial qui a trop de
conversations lues sans réponse d'en ouvrir / traiter de nouvelles. Deux failles le
contournent : (1) l'envoi de message (`message:send`) n'est jamais soumis à
`checkRestriction()` côté backend, et l'état `restrictionTriggered` est purement
frontend donc remis à `false` à chaque F5 / nouvel onglet / reconnect socket ;
(2) le filtre poste de `checkRestriction()` laisse passer les conversations
`poste_id = null`, qui sont comptées à tort dans le quota.

L'approche : ajouter un guard serveur sur `message:send` (source de vérité backend),
restaurer l'état de restriction au reconnect via un événement dédié **sans effet de
bord** (pas de `recordAccess`), et corriger la condition de filtrage poste.

---

## Bug #3 — Guard backend manquant + rechargement page

### Étape 1 — Guard backend sur `message:send`

Fichier : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
Localisation : dans `handleSendMessage` (déclaré ligne 889-890), après la résolution de
l'agent (ligne 899-900) et après les contrôles statut/fenêtre/canal déjà présents,
**avant** l'appel `createAgentMessage` (ligne 1017). Le bloc `restrictionCfg` est déjà
récupéré ligne 998 — on réutilise cette config plutôt que de la relire.

Modification : avant d'envoyer, recalculer la restriction pour le commercial. Si elle
est déclenchée **par une conversation autre que celle en cours d'envoi**, refuser
l'envoi et renvoyer un `MESSAGE_SEND_ERROR` + un `restriction:status` pour resynchroniser
le frontend. La conversation en cours d'envoi (`payload.chat_id`) ne doit jamais se
bloquer elle-même (même règle que le `shouldTrigger` frontend, chatStore.ts:241-243),
sinon le commercial ne pourrait jamais répondre.

Réutilisation : `this.restrictionService.checkRestriction()` (déjà importé/injecté
gateway ligne 105), `getDedicatedChannelIdsForPoste()` (déjà utilisé ligne 1068) pour
exempter les postes dédiés — exactement la même garde que celle déjà appliquée pour
`recordResponse` ligne 1066-1070. On factorise cette détection « poste dédié » plutôt
que de la dupliquer (voir note factorisation ci-dessous).

Code avant (extrait, autour de la ligne 997-1013) :
```typescript
// 🔒 Restriction min caractères d'envoi — bloque si le message est trop court
const restrictionCfg = await this.restrictionService.getRestrictionConfig();
if (restrictionCfg.minCharsSendEnabled) {
  const textLen = normalizedText.length;
  if (textLen < restrictionCfg.minResponseChars) {
    client.emit('chat:event', { /* MESSAGE_TOO_SHORT ... */ });
    return;
  }
}

let message: WhatsappMessage;
```

Code après :
```typescript
// 🔒 Restriction min caractères d'envoi — bloque si le message est trop court
const restrictionCfg = await this.restrictionService.getRestrictionConfig();
if (restrictionCfg.minCharsSendEnabled) {
  const textLen = normalizedText.length;
  if (textLen < restrictionCfg.minResponseChars) {
    client.emit('chat:event', { /* MESSAGE_TOO_SHORT ... */ });
    return;
  }
}

// 🔒 Guard restriction « conversations non répondues » — source de vérité backend.
// Empêche l'envoi quand une AUTRE conversation que celle-ci est non répondue,
// même après F5 / nouvel onglet (l'état frontend ne fait pas autorité).
if (restrictionCfg.enabled) {
  const isDedicatedPoste = agent.posteId
    ? (await this.channelService.getDedicatedChannelIdsForPoste(agent.posteId)).length > 0
    : false;
  if (!isDedicatedPoste) {
    const status = await this.restrictionService.checkRestriction(
      agent.commercialId,
      agent.posteId,
    );
    const blockingOther =
      status.triggered &&
      status.unrespondedConversations.some((c) => c.chat_id !== payload.chat_id);
    if (blockingOther) {
      client.emit('restriction:status', status); // resync modal frontend
      client.emit('chat:event', {
        type: 'MESSAGE_SEND_ERROR',
        payload: {
          chat_id: payload.chat_id,
          tempId: payload.tempId,
          code: 'RESTRICTION_TRIGGERED',
          message: 'Répondez aux conversations en attente avant d\'en traiter une nouvelle.',
        },
      });
      return;
    }
  }
}

let message: WhatsappMessage;
```

Impact : un commercial restreint ne peut plus envoyer dans une nouvelle conversation
même en contournant le modal (F5, second onglet, appel WS direct). Le frontend reçoit
`restriction:status` et réaffiche le modal automatiquement.

Risques :
- Coût : un `checkRestriction()` supplémentaire par envoi. Le service fait déjà des
  requêtes groupées (pas de N+1) ; acceptable, mais le surcoût s'ajoute au
  `checkRestriction()` déjà fait après envoi (ligne 1077). Mutualisable : on peut
  réutiliser le `status` calculé en pré-envoi pour éviter le double appel post-envoi
  quand aucune réponse n'a changé l'état (optimisation facultative, non bloquante).
- La condition « blocking other » doit impérativement exclure `payload.chat_id` sinon
  le commercial qui répond à la conversation bloquante serait lui-même bloqué (deadlock
  fonctionnel). Aligné avec la logique frontend existante.
- Le code `RESTRICTION_TRIGGERED` est nouveau : vérifier que le handler
  `MESSAGE_SEND_ERROR` frontend (WebSocketEvents.tsx / chatStore) nettoie bien le
  message optimiste `sending` correspondant au `tempId`.

### Étape 2 — Restauration de l'état de restriction au reconnect

Le frontend initialise `restrictionTriggered: false` (chatStore.ts:204) et ne le
recharge jamais à la connexion : `setSocket` (chatStore.ts:226-261) charge seulement
les *configs* (`loadRestrictionConfig`, `loadMessageRestrictionConfig`), pas le *statut*.
Le statut n'arrive que sur `conversation:accessed` (au clic d'une conv). Donc après F5
le modal disparaît tant que le commercial ne clique pas.

On ne peut PAS réutiliser `conversation:accessed` pour ça : ce handler appelle
`recordAccess()` (gateway.ts:836) et exige un `chat_id` — l'utiliser au reconnect
créerait un accès parasite. Il faut un événement de lecture pure du statut.

#### 2a — Backend : nouvel événement `restriction:check` (lecture seule)

Fichier : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
Localisation : ajouter un handler à côté de `handleConversationAccessed` (ligne 809-839).

Modification : nouveau `@SubscribeMessage('restriction:check')` qui réplique la garde
« config désactivée » + « poste dédié » de `handleConversationAccessed` (ligne 817-829)
puis émet `checkRestriction()` **sans** `recordAccess`.

Code (nouveau handler) :
```typescript
@SubscribeMessage('restriction:check')
async handleRestrictionCheck(@ConnectedSocket() client: Socket) {
  const agent = this.connectedAgents.get(client.id);
  if (!agent) return;

  const config = await this.restrictionService.getRestrictionConfig();
  if (!config.enabled) return;

  if (agent.posteId) {
    const dedicatedIds = await this.channelService.getDedicatedChannelIdsForPoste(agent.posteId);
    if (dedicatedIds.length > 0) {
      client.emit('restriction:status', {
        triggered: false, unrespondedCount: 0, unrespondedConversations: [], config,
      });
      return;
    }
  }

  const status = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
  client.emit('restriction:status', status);
}
```

Note factorisation : la garde « config désactivée + poste dédié » est désormais présente
dans `handleConversationAccessed`, le futur `handleRestrictionCheck` et le guard de
l'Étape 1. → Extraire une méthode privée du gateway
`private async isRestrictionExemptPoste(agent): Promise<boolean>` (ou un helper dans
`ConversationRestrictionService` prenant `posteId` + l'accès `ChannelService`) pour
éviter trois copies de la détection « poste dédié ». À faire en Étape 0 (voir ordre).

#### 2b — Frontend : émettre `restriction:check` au connect

Fichier : `front/src/store/chatStore.ts`
Localisation : `setSocket`, bloc `if (socket)` ligne 229-233.

Modification : après l'enregistrement du listener `restriction:status` (déjà présent
ligne 235), demander explicitement le statut au backend dès que le socket est connecté.
Comme le listener `restriction:status` est déjà branché (ligne 235-259) et qu'il gère
`pendingConversationId = null` sans navigation parasite, il suffit d'émettre l'événement.

Code avant (chatStore.ts:229-233) :
```typescript
if (socket) {
  // Charger les configs restriction au moment de la connexion socket
  void get().loadRestrictionConfig();
  void get().loadMessageRestrictionConfig();
```

Code après :
```typescript
if (socket) {
  // Charger les configs restriction au moment de la connexion socket
  void get().loadRestrictionConfig();
  void get().loadMessageRestrictionConfig();

  // Restaurer le statut de restriction au (re)connect : sans ça, restrictionTriggered
  // repart à false après F5 / second onglet et le commercial contourne le blocage.
  const emitRestrictionCheck = () => socket.emit('restriction:check');
  if (socket.connected) emitRestrictionCheck();
  socket.on('connect', emitRestrictionCheck);
```

Note : `setSocket` enregistre les listeners sans cleanup (pattern déjà en place pour
`restriction:status`). Vérifier que `setSocket` n'est pas appelé plusieurs fois sur le
même socket pour éviter d'empiler les listeners `connect` ; sinon utiliser
`socket.off('connect', emitRestrictionCheck)` avant le `on`, ou centraliser dans
`WebSocketEvents.tsx` (`refreshAfterConnect`, ligne 360) qui possède déjà le cycle de
vie propre des listeners.

Variante recommandée (cycle de vie propre) : ajouter l'émission dans
`refreshAfterConnect` de `front/src/components/WebSocketEvents.tsx` (ligne ~360) plutôt
que dans `setSocket`, car ce module gère déjà `socket.on('connect', ...)` avec cleanup.

Impact : après F5, reconnexion réseau, ou ouverture d'un second onglet, le frontend
réaffiche le modal si le commercial est effectivement restreint. Combiné à l'Étape 1
(guard serveur), le contournement par état frontend est neutralisé même si l'UI échoue.

Risques :
- Double affichage : `restriction:status` est aussi émis sur `conversation:accessed` et
  après envoi. Le handler frontend est idempotent (set d'état), pas de risque de doublon.
- Le filtrage `shouldTrigger` (chatStore.ts:241-243) exclut la conversation active : au
  reconnect, `selectedConversation` est `null`, donc toute conv non répondue déclenche le
  modal — comportement voulu.

---

## Bug #7 — Filtre poste_id IS NULL

### Étape 3 — Correction condition de filtrage

Fichier : `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts`
Localisation : ligne 166, dans le `.filter()` de `checkRestriction()`.

Code avant :
```typescript
if (posteId && chat.poste_id !== null && chat.poste_id !== posteId) return false;
```

Code après :
```typescript
if (posteId && chat.poste_id !== posteId) return false;
```

Impact : retirer `chat.poste_id !== null` de la conjonction fait que les conversations
non assignées (`poste_id = null`) **ne correspondent plus** au poste du commercial et
sont donc exclues du décompte. Une conversation sans poste n'est imputable à aucun
commercial : elle ne doit pas peser dans son quota.

Risques :
- Sémantique inverse à vérifier avec le métier : aujourd'hui les conv `poste_id = null`
  comptent (bug), demain elles ne compteront plus. Confirmer que c'est bien l'intention
  (le ticket l'indique : « comptées à tort »).
- Cohérence avec `recordAccess` : une conv sans poste peut toujours être *enregistrée*
  comme accès (recordAccess ne filtre pas sur le poste, lignes 48-95). Elle sera créée en
  base mais exclue au comptage — pas de fuite, mais lignes « orphelines » dans
  `commercial_conversation_access`. Acceptable ; sinon ajouter le même filtre poste dans
  `recordAccess` (hors périmètre de ce ticket, à signaler).
- `posteId` peut être `undefined` (signature `checkRestriction(commercialId, posteId?)`).
  Dans ce cas la condition entière est ignorée (court-circuit `posteId &&`) — comportement
  inchangé, OK.

---

## Ordre d'implémentation recommandé

0. **Factorisation (backend)** — extraire la détection « poste exempté de restriction »
   (config désactivée OU poste dédié) en une méthode réutilisable, pour éviter la triple
   duplication entre `handleConversationAccessed`, le nouveau `handleRestrictionCheck`
   (Étape 2a) et le guard de l'Étape 1. *Justification : factoriser avant d'introduire la
   3e copie, conformément à la règle anti-duplication.*
1. **Étape 3 (Bug #7)** — correction d'une ligne, sans dépendance, corrige le décompte
   sur lequel s'appuient toutes les autres étapes. *Doit être faite en premier pour que
   le guard de l'Étape 1 raisonne sur un comptage juste.*
2. **Étape 1 (guard backend `message:send`)** — la protection serveur, indépendante du
   frontend. *Le filet de sécurité réel : même sans le frontend, le contournement est
   bloqué.*
3. **Étape 2a (backend `restriction:check`)** puis **2b (frontend connect)** — UX :
   réaffiche le modal au reconnect. *En dernier car purement confort : le guard de
   l'Étape 1 garantit déjà l'intégrité.*

---

## Points d'attention

- **Tests à vérifier** : suite Jest existante de `conversation-restriction.service`
  (`npm test -- --testPathPattern=conversation-restriction`). Ajouter / vérifier un cas
  « conversation poste_id=null exclue du décompte » (Étape 3) et un cas
  « envoi refusé quand une autre conv est non répondue » (Étape 1, niveau gateway).
- **Postes dédiés** : les trois étapes doivent rester exemptées (canal dédié = pas de
  restriction). La factorisation Étape 0 garantit que la règle reste cohérente partout.
- **Régression deadlock** : ne jamais bloquer l'envoi sur la conversation elle-même
  (`payload.chat_id`), sinon le commercial restreint ne peut plus se débloquer.
- **Nettoyage message optimiste** : le frontend crée un message `sending` avant l'émission
  (chatStore.ts:573-606). Le nouveau code d'erreur `RESTRICTION_TRIGGERED` doit déclencher
  la même purge du message optimiste que les autres `MESSAGE_SEND_ERROR` (vérifier le
  handler dans `WebSocketEvents.tsx`).
- **Listeners socket dupliqués** : si `setSocket` est susceptible d'être rappelé sur le
  même socket, privilégier l'ajout de l'émission `restriction:check` dans
  `WebSocketEvents.tsx > refreshAfterConnect` (cycle de vie propre) plutôt que dans
  `setSocket`.
- **Cohérence `recordAccess` / décompte** (Bug #7) : possibles lignes orphelines
  `poste_id=null` enregistrées mais non comptées — sans impact fonctionnel, à
  documenter ; alignement complet de `recordAccess` sur le filtre poste = hors périmètre.

---

## Fichiers impactés

- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
  — guard restriction dans `handleSendMessage` (~ligne 1013), nouveau handler
  `restriction:check` (~ligne 839), méthode privée d'exemption (Étape 0).
- `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts:166`
  — correction de la condition de filtrage poste.
- `front/src/store/chatStore.ts` (`setSocket`, ~ligne 229) **ou**
  `front/src/components/WebSocketEvents.tsx` (`refreshAfterConnect`, ~ligne 360)
  — émission `restriction:check` au connect (variante recommandée : WebSocketEvents).
