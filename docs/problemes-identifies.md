# Liste des problemes identifies - Audit flux messages

**Date** : 2026-02-15
**Source** : `docs/audit-flux-messages.md`
**References doc** : [Whapi Webhooks](https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message), [Meta WhatsApp Webhooks](https://docs.360dialog.com/docs/waba-basics/webhook-events-and-notifications)

---

## TABLEAU RECAPITULATIF

| ID | Severite | Titre | Fichiers concernes | Statut |
|----|----------|-------|-------------------|--------|
| P0 | BLOQUANT | Routage sortant mono-provider (toujours Whapi) | `whatsapp_message.service.ts`, `communication_whapi.service.ts` | A faire |
| P1 | CRITIQUE | Statuts (delivered/read) non broadcast au frontend | `inbound-message.service.ts`, `whatsapp_message.gateway.ts` | A faire |
| P2 | CRITIQUE | Erreurs de livraison silencieuses | `whapi.adapter.ts`, `meta.adapter.ts` | A faire |
| P3 | CRITIQUE | Champ `field` du webhook Meta non verifie | `whapi.controller.ts` | A faire |
| P4 | CRITIQUE | Interactive Whapi completement ignore | `whapi.adapter.ts` | A faire |
| P5 | CRITIQUE | Pas de rate limiting sur les evenements socket | `whatsapp_message.gateway.ts` | A faire |
| P6 | ~~MOYEN~~ | ~~Types de messages non geres (reactions, contacts, polls...)~~ | `whapi.adapter.ts`, `meta.adapter.ts` | VOULU |
| P7 | MOYEN | Donnees de facturation Meta ignorees | `meta.adapter.ts` | A faire |
| P8 | MOYEN | Attribution publicitaire (referral/ads) perdue | `meta.adapter.ts` | A faire |
| P9 | MOYEN | Evenements `put` et `patch` Whapi non geres | `whapi.controller.ts`, `unified-ingress.service.ts` | A faire |
| P10 | MOYEN | Resolution du channel en fallback cascade | `whatsapp_message.gateway.ts` | A faire |
| P11 | MOYEN | Evenements typing non scopes par tenant | `whatsapp_message.gateway.ts` | A faire |
| P12 | MOYEN | Pas d'idempotence pour les messages sortants via socket | `whatsapp_message.gateway.ts` | A faire |
| P13 | MOYEN | Check de duplicata incomplet (pas de tenant_id) | `whatsapp_message.service.ts` | A faire |
| P14 | ~~BAS~~ | ~~`request_welcome` Meta non gere~~ | `meta.adapter.ts` | VOULU |
| P15 | MOYEN | Historique des numeros client lors de changement | `meta.adapter.ts`, `contact entity`, `migration` | A faire |
| P16 | BAS | Pas de validation de taille pour les medias | `inbound-message.service.ts` | A faire |
| P17 | BAS | Recherche chat_id sensible a la casse | `dispatcher.service.ts` | A faire |

---

## DETAIL DES PROBLEMES

---

### P0 - BLOQUANT : Routage sortant mono-provider (toujours Whapi)

**Fichiers** :
- `src/whatsapp_message/whatsapp_message.service.ts` (createAgentMessage)
- `src/communication_whapi/communication_whapi.service.ts` (sendToWhapiChannel)

**Description** :
L'envoi de messages sortants est hardcode sur l'API Whapi. Quand une conversation est rattachee a un channel Meta, le message part quand meme via Whapi au lieu de l'API Meta Cloud (`graph.facebook.com`).

**Comportement actuel** :
```
createAgentMessage()
  └── communicationWhapiService.sendToWhapiChannel()  ← TOUJOURS
        └── POST https://gate.whapi.cloud/messages/text
```

**Comportement attendu** :
```
createAgentMessage()
  ├── Lire channel.provider
  ├── Si 'whapi' → communicationWhapiService.sendToWhapiChannel()
  |     └── POST https://gate.whapi.cloud/messages/text
  |           Body: { to, body }
  └── Si 'meta' → communicationMetaService.sendToMetaChannel()
        └── POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
              Body: { messaging_product: "whatsapp", to, type: "text", text: { body } }
```

**Ce qui manque** :
1. **`CommunicationMetaService`** avec methode `sendToMetaChannel()` - service d'envoi via Meta Cloud API
2. **Branchement dans `createAgentMessage()`** : lire `channel.provider` et router vers le bon service
3. **Stockage token Meta** : ajouter `meta_access_token` et `phone_number_id` sur l'entite channel (ou utiliser `external_id`)
4. **Format payload Meta** : `{ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }`
5. **Parsing reponse Meta** : `response.messages[0].id` au lieu de `response.message.id`
6. **Retry/erreurs pour Meta** : dupliquer la logique de retry de Whapi

**Infrastructure existante mais inutilisee** :
- `WhapiChannel.provider` : Champ `varchar(32)` en base, peuple a `'whapi'` par migration
- `ProviderChannel` : Table de mapping utilisee uniquement pour l'inbound
- `WhatsappMessage.provider` : Enregistre le provider mais l'outbound met toujours `'whapi'`

**Differences cles entre les deux API** :

| Aspect | Whapi | Meta Cloud API |
|--------|-------|----------------|
| Base URL | `gate.whapi.cloud` | `graph.facebook.com/v21.0` |
| ID dans URL | Non | Oui (`/{phone_number_id}/messages`) |
| Champs obligatoires | `to`, `body` | `messaging_product`, `to`, `type`, `text.body` |
| Auth | `Bearer {whapi_token}` | `Bearer {meta_access_token}` |
| Reponse ID | `response.message.id` | `response.messages[0].id` |
| Rate limit | Pas de limite stricte | 80 msg/sec (Business) |
| Templates hors 24h | Endpoint separe | Meme endpoint, `type: "template"` |

**Impact** : Les conversations entrantes via Meta sont recues correctement, mais les reponses de l'agent partent via Whapi = **echec d'envoi ou envoi depuis le mauvais numero**.

---

### P1 - CRITIQUE : Statuts (delivered/read) non broadcast au frontend

**Fichiers** :
- `src/webhooks/inbound-message.service.ts` (handleStatuses)
- `src/whatsapp_message/whatsapp_message.gateway.ts` (pas de handler status)

**Description** :
Les deux providers envoient des webhooks de statut quand un message est delivre ou lu par le client. Le code persiste ces statuts en base (UPDATE status = 'delivered'|'read') mais ne les pousse **jamais** au frontend via WebSocket.

**Flux actuel** :
```
Webhook statut (Whapi/Meta)
  → Adapter.normalizeStatuses() → UnifiedStatus[]
  → InboundMessageService.handleStatuses()
  → UPDATE whatsapp_message SET status = 'delivered'|'read'
  → ❌ FIN - Pas de socket.emit()
```

**Flux attendu** :
```
Webhook statut
  → ... (meme pipeline) ...
  → UPDATE whatsapp_message SET status = 'delivered'|'read'
  → gateway.notifyStatusUpdate(messageId, newStatus)
  → server.to(`tenant:${tenantId}`).emit('chat:event', {
      type: 'MESSAGE_STATUS_UPDATE',
      payload: { message_id, chat_id, status, timestamp }
    })
```

**Payload webhook statut (Whapi)** :
```json
{ "statuses": [{ "id": "msg_id", "status": "read", "recipient_id": "225...", "timestamp": "..." }] }
```

**Payload webhook statut (Meta)** :
```json
{ "entry": [{ "changes": [{ "value": { "statuses": [{ "id": "wamid.ID", "status": "delivered", "timestamp": "...", "recipient_id": "..." }] } }] }] }
```

**Impact** : L'agent voit toujours "envoye" (une seule coche). Les coches doubles (delivre) et bleues (lu) ne s'affichent jamais. L'agent ne sait pas si le client a recu/lu son message.

---

### P2 - CRITIQUE : Erreurs de livraison silencieuses

**Fichiers** :
- `src/webhooks/adapters/whapi.adapter.ts` (normalizeStatuses)
- `src/webhooks/adapters/meta.adapter.ts` (normalizeStatuses)

**Description** :
Quand un message echoue a la livraison (numero invalide, client a bloque le business, media non trouve, etc.), le webhook de statut contient des informations d'erreur. Ces informations sont completement ignorees.

**Donnees perdues - Whapi** :
```json
{
  "statuses": [{
    "id": "msg_id",
    "status": "failed",
    "code": 131014,          // ❌ IGNORE - code d'erreur specifique
    "recipient_id": "225..."
  }]
}
```

**Donnees perdues - Meta** :
```json
{
  "statuses": [{
    "id": "wamid.ID",
    "status": "failed",
    "errors": [{              // ❌ IGNORE - tableau d'erreurs complet
      "code": 131014,
      "title": "Request for url https://... failed with error: 404 (Not Found)"
    }]
  }]
}
```

**Codes d'erreur courants (Meta)** :
| Code | Signification |
|------|---------------|
| 131014 | Media URL invalide (404) |
| 131026 | Message non delivrable (client a bloque) |
| 131047 | Re-engagement requis (template necessaire) |
| 131051 | Type de message non supporte |
| 131053 | Limite de media depassee |

**Impact** : Quand un message echoue, l'agent ne voit aucune erreur. Le message reste en statut "envoye" alors qu'il n'a jamais ete delivre. Impossible de diagnostiquer la cause.

**Correction suggeree** : Ajouter `errorCode` et `errorTitle` a `UnifiedStatus`, les extraire dans les adapters, les sauvegarder en base, et les pousser au frontend.

---

### P3 - CRITIQUE : Champ `field` du webhook Meta non verifie

**Fichier** : `src/whapi/whapi.controller.ts`

**Description** :
La doc Meta indique que le webhook contient `changes[0].field` qui identifie le type de notification. Les valeurs possibles incluent :
- `messages` : Messages et statuts (ce qu'on veut traiter)
- `account_update` : Changements de compte
- `phone_number_quality_update` : Qualite du numero
- `phone_number_name_update` : Changement de nom
- `message_template_status_update` : Statut des templates

Le code ne verifie pas ce champ. Si Meta envoie un `account_update`, le code tente de le parser comme un message, ce qui peut provoquer des erreurs silencieuses ou des comportements imprevisibles.

**Payload problematique** :
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": { /* donnees account_update */ },
      "field": "account_update"     // ← PAS verifie, traite comme "messages"
    }]
  }]
}
```

**Correction suggeree** : Ajouter un guard `if (changes[0].field !== 'messages') return` avant le traitement.

---

### P4 - CRITIQUE : Interactive Whapi completement ignore

**Fichier** : `src/webhooks/adapters/whapi.adapter.ts`

**Description** :
L'adapter Whapi met `interactive` a `undefined` pour TOUS les types de messages. Les types `list` et `buttons` sont mappes vers le type `interactive` dans UnifiedMessage, mais aucun champ interactive n'est extrait.

**Comportement actuel** :
```typescript
// whapi.adapter.ts
type: mapType(message.type),     // 'list' → 'interactive', 'buttons' → 'interactive'
interactive: undefined,           // ← TOUJOURS undefined
```

**Comparaison avec Meta** :
```typescript
// meta.adapter.ts - FONCTIONNE
interactive: {
  kind: 'button_reply' | 'list_reply',
  id: reply.id,
  title: reply.title,
  description: reply.description
}
```

**Payload Whapi pour un button reply (doc)** :
```json
{
  "type": "reply",
  "reply": {
    "type": "buttons_reply",
    "buttons_reply": { "id": "btn_1", "title": "Oui" }
  }
}
```

**Impact** : Quand un client repond a un message interactif (boutons, listes) via un channel Whapi, la reponse est recue avec type `interactive` mais sans contenu. L'agent voit "[Reponse interactive client]" au lieu du choix reel du client.

**Correction suggeree** : Extraire `message.reply?.buttons_reply` dans l'adapter Whapi et peupler le champ `interactive` de `UnifiedMessage`.

---

### P5 - CRITIQUE : Pas de rate limiting sur les evenements socket

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts`

**Description** :
Aucun handler Socket.IO n'a de rate limiting. Les evenements suivants sont tous illimites :
- `message:send` : Envoi de message (appelle l'API Whapi a chaque invocation)
- `messages:get` : Chargement de messages (requete DB)
- `conversations:get` : Chargement conversations (requete DB)
- `messages:read` : Marquage comme lu (update DB)
- `chat:event` (typing) : Indicateur de frappe

**Risques** :
1. **Spam API** : Un agent malveillant peut envoyer des centaines de messages/seconde, epuisant le quota Whapi/Meta
2. **Surcharge DB** : Des appels `messages:get` en boucle peuvent saturer la base
3. **Amplification** : Chaque `message:send` declenche un broadcast a TOUS les agents du tenant

**Correction suggeree** : Ajouter un middleware socket rate limiter par evenement :
- `message:send` : 10/sec max par agent
- `messages:get` : 5/sec max par agent
- `conversations:get` : 2/sec max par agent

---

### ~~P6 - VOULU : Types de messages non geres~~

**Statut** : VOULU - Les types non supportes (reactions, contacts, polls, orders, etc.) sont volontairement non geres dans le perimetre actuel. Pas d'action requise.

---

### P7 - MOYEN : Donnees de facturation Meta ignorees

**Fichier** : `src/webhooks/adapters/meta.adapter.ts` (normalizeStatuses)

**Description** :
Le webhook de statut Meta inclut des informations de facturation et d'origine de conversation qui sont completement ignorees.

**Donnees perdues** :
```json
{
  "conversation": {
    "id": "CONVERSATION_ID",
    "expiration_timestamp": "TIMESTAMP",
    "origin": {
      "type": "user_initiated"    // ou "business_initiated", "referral_conversion"
    }
  },
  "pricing": {
    "billable": true,             // Indique si la conversation est facturable
    "pricing_model": "CBP",
    "category": "service"         // service, authentication, marketing, utility
  }
}
```

**Impact** :
- Impossible de suivre les couts WhatsApp par conversation
- Impossible de distinguer les conversations initiees par le client vs le business
- Impossible de savoir quelles conversations sont facturees et dans quelle categorie
- Pas de donnees pour un dashboard de couts ou d'optimisation de facturation

---

### P8 - MOYEN : Attribution publicitaire (referral/ads) perdue

**Fichier** : `src/webhooks/adapters/meta.adapter.ts`

**Description** :
Les messages provenant de publicites Facebook (Click-to-WhatsApp Ads) contiennent des donnees d'attribution marketing. Elles sont completement ignorees.

**Payload Meta pour un message via publicite** :
```json
{
  "messages": [{
    "referral": {
      "source_url": "https://fb.com/ad/123",
      "source_id": "AD_ID",
      "source_type": "ad",
      "headline": "Titre de la pub",
      "body": "Description de la pub",
      "media_type": "image",
      "image_url": "https://...",
      "ctwa_clid": "CLICK_ID"        // ID de tracking publicitaire
    },
    "from": "225...",
    "type": "text",
    "text": { "body": "Bonjour" }
  }]
}
```

**Payload Whapi pour un message via publicite** :
```json
{
  "messages": [{
    "context": {
      "ad": {
        "title": "Titre de la pub",
        "body": "Description",
        "source": { "id": "AD_ID", "type": "ad", "url": "https://..." },
        "ctwa": "CLICK_ID"
      }
    }
  }]
}
```

**Impact** :
- Impossible de savoir quel client est arrive via quelle publicite
- Pas de ROI mesurable sur les campagnes Click-to-WhatsApp
- Donnees de tracking marketing perdues

---

### P9 - MOYEN : Evenements `put` et `patch` Whapi non geres

**Fichiers** :
- `src/whapi/whapi.controller.ts`
- `src/webhooks/unified-ingress.service.ts`

**Description** :
La doc Whapi documente trois types d'evenements webhook :
- `event.event = "post"` : Nouveau message (seul type gere)
- `event.event = "put"` : Message mis a jour (edit)
- `event.event = "patch"` : Mise a jour partielle (vote de sondage)

Le code traite implicitement tout comme `post`. Les messages edites et les votes de sondage sont soit ignores, soit traites comme de nouveaux messages (duplication potentielle).

**Payload d'un message edite (put)** :
```json
{
  "messages": [{ "id": "existing_msg_id", "type": "text", "text": { "body": "Texte modifie" } }],
  "event": { "type": "messages", "event": "put" }
}
```

**Payload d'un vote de sondage (patch)** :
```json
{
  "messages_updates": [{
    "id": "poll_msg_id",
    "trigger": { "action": { "type": "vote", "votes": ["option_1"] } },
    "before_update": { "poll": { "results": [...] } },
    "after_update": { "poll": { "results": [...] } }
  }],
  "event": { "type": "messages", "event": "patch" }
}
```

**Impact** : Un message edite est traite comme un nouveau message (doublon). Les votes de sondage sont ignores.

---

### P10 - MOYEN : Resolution du channel en fallback cascade

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` (resolveChannelIdForChat)

**Description** :
Le channel d'envoi est resolu en cascade :
1. `chat.last_msg_client_channel_id` (dernier channel utilise par le client)
2. `chat.channel_id` (channel par defaut du chat)
3. `lastMessage.channel_id` (channel du dernier message)

**Probleme** : Si le client change de channel (ex: passe de Whapi a Meta), le systeme continue a envoyer via l'ancien channel jusqu'a reception d'un nouveau message. Pire, si le provider change, le message part via le mauvais endpoint (cf. P0).

**Scenario problematique** :
```
1. Client envoie via Channel A (Whapi) → last_msg_client_channel_id = A
2. Admin reconfigure le client sur Channel B (Meta)
3. Agent repond → channel resolu = A (Whapi) ← MAUVAIS
4. Client envoie via Channel B (Meta) → last_msg_client_channel_id = B
5. Agent repond → channel resolu = B (Meta) ← CORRECT (enfin)
```

**Impact** : Messages envoyes depuis le mauvais numero ou via le mauvais provider entre la reconfiguration et le prochain message client.

---

### P11 - MOYEN : Evenements typing non scopes par tenant

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts`

**Description** :
Le handler d'evenements typing (`TYPING_START`/`TYPING_STOP`) ne verifie pas que le `chat_id` fourni appartient au tenant de l'agent emetteur.

**Risque** : Un agent pourrait declencher un indicateur de frappe sur un chat appartenant a un autre tenant (fuite d'information inter-tenant).

**Correction suggeree** : Ajouter `WHERE tenant_id = agent.tenantId` lors de la verification du chat_id.

---

### P12 - MOYEN : Pas d'idempotence pour les messages sortants via socket

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts`

**Description** :
Si le frontend retry un envoi `message:send` avec le meme `tempId` (coupure reseau, timeout), le backend n'a aucun mecanisme de deduplication. Le message est envoye et sauvegarde une deuxieme fois.

**Flux problematique** :
```
1. Frontend: socket.emit('message:send', { tempId: 'abc', text: 'Hello' })
2. Timeout reseau - pas d'ACK
3. Frontend: socket.emit('message:send', { tempId: 'abc', text: 'Hello' })  ← RETRY
4. Backend: createAgentMessage() x2 → DOUBLE envoi via Whapi + DOUBLE sauvegarde DB
```

**Correction suggeree** : Verifier si un message avec le meme `tempId` a deja ete cree dans les 60 dernieres secondes avant de traiter.

---

### P13 - MOYEN : Check de duplicata incomplet (pas de tenant_id)

**Fichier** : `src/whatsapp_message/whatsapp_message.service.ts` (saveIncomingFromUnified)

**Description** :
La verification de duplicata de message entrant filtre uniquement par `(provider, provider_message_id, direction)`. Le `tenant_id` et le `chat_id` ne sont pas inclus dans la requete.

**Risque theorique** : Si deux tenants utilisent le meme provider et recoivent un message avec le meme `provider_message_id` (improbable mais possible en cas de bug provider), le deuxieme serait considere comme duplicata.

**Correction suggeree** : Ajouter `tenant_id` au critere de deduplication : `WHERE provider = $1 AND provider_message_id = $2 AND direction = $3 AND tenant_id = $4`.

---

### ~~P14 - VOULU : `request_welcome` Meta non gere~~

**Statut** : VOULU - Le type `request_welcome` est volontairement non traite. Pas d'action requise.

---

### P15 - MOYEN : Historique des numeros client lors de changement

**Fichiers concernes** :
- `src/webhooks/adapters/meta.adapter.ts` (detection du changement)
- `src/webhooks/adapters/whapi.adapter.ts` (detection du changement)
- `src/contact/entities/contact.entity.ts` (entite a enrichir)
- Nouvelle entite : `contact_phone_history`
- `src/contact/contact.service.ts` (logique de mise a jour)

**Description** :
Meta envoie un message de type `system` quand un contact change de numero WhatsApp. Le systeme doit detecter ce changement et maintenir un historique des numeros du client en base de donnees.

**Payload Meta (declencheur)** :
```json
{
  "messages": [{
    "from": "225080000",
    "type": "system",
    "system": {
      "body": "John changed from 225070000 to 225080000",
      "new_wa_id": "225080000",
      "type": "user_changed_number"
    }
  }]
}
```

**Payload Whapi equivalent** :
```json
{
  "messages": [{
    "type": "action",
    "action": {
      "type": "phone_number_changed",
      "old_number": "225070000",
      "new_number": "225080000"
    }
  }]
}
```

**Etat actuel des entites** :
```
Contact {
  id: UUID (PK)
  phone: varchar(100)          ← UN SEUL numero, pas d'historique
  chat_id: varchar(100)        ← Lie au WhatsappChat
  name: varchar(100)
  ...
}

WhatsappChat {
  chat_id: varchar(100)        ← Format: "225070000@s.whatsapp.net"
  contact_client: varchar(100) ← Duplique le numero
  ...
}
```

**Probleme** : Le numero est stocke en un seul champ (`Contact.phone` et `WhatsappChat.contact_client`). Aucun historique n'est conserve. Quand un client change de numero, l'ancien est ecrase.

**Solution proposee** :

1. **Nouvelle table `contact_phone_history`** :
```sql
CREATE TABLE contact_phone_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id  UUID NOT NULL REFERENCES contact(id),
  tenant_id   CHAR(36) NOT NULL,
  phone       VARCHAR(100) NOT NULL,       -- Le numero (ancien ou actuel)
  chat_id     VARCHAR(100),                -- Le chat_id associe a ce numero
  status      VARCHAR(20) NOT NULL,        -- 'active' | 'replaced' | 'inactive'
  source      VARCHAR(50) NOT NULL,        -- 'meta_webhook' | 'whapi_webhook' | 'manual' | 'initial'
  replaced_by VARCHAR(100),                -- Le nouveau numero qui a remplace celui-ci
  started_at  TIMESTAMP NOT NULL DEFAULT NOW(),  -- Debut d'utilisation de ce numero
  ended_at    TIMESTAMP,                   -- Fin d'utilisation (quand remplace)
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phone_history_contact ON contact_phone_history(contact_id);
CREATE INDEX idx_phone_history_phone ON contact_phone_history(phone);
CREATE INDEX idx_phone_history_tenant ON contact_phone_history(tenant_id);
```

2. **Flux de traitement du changement de numero** :
```
Webhook system/user_changed_number recu
  |
  v
Adapter detecte type = 'system' + system.type = 'user_changed_number'
  |
  v
Extraire old_number (from) et new_number (system.new_wa_id)
  |
  v
ContactService.handlePhoneNumberChange(old_number, new_number, tenantId)
  |
  ├── 1. Trouver le contact par old_number
  |
  ├── 2. Creer entree historique pour l'ancien numero :
  |     { contact_id, phone: old_number, status: 'replaced',
  |       replaced_by: new_number, ended_at: now, source: 'meta_webhook' }
  |
  ├── 3. Mettre a jour Contact.phone = new_number
  |
  ├── 4. Creer entree historique pour le nouveau numero :
  |     { contact_id, phone: new_number, status: 'active',
  |       started_at: now, source: 'meta_webhook' }
  |
  ├── 5. Mettre a jour WhatsappChat :
  |     chat_id: "new_number@s.whatsapp.net"
  |     contact_client: new_number
  |
  └── 6. Broadcast CONTACT_UPSERT au frontend
```

3. **Migration des donnees existantes** :
```sql
-- Creer une entree 'initial' pour chaque contact existant
INSERT INTO contact_phone_history (contact_id, tenant_id, phone, status, source, started_at)
SELECT c.id, wc.tenant_id, c.phone, 'active', 'initial', c.created_at
FROM contact c
JOIN whatsapp_chat wc ON wc.chat_id = c.chat_id
WHERE c.phone IS NOT NULL;
```

**Impact actuel** : Le `new_wa_id` est perdu. Le chat reste associe a l'ancien numero. Les futurs messages envoyes a l'ancien numero echoueront. Pas de tracabilite du parcours client a travers ses numeros.

---

### P16 - BAS : Pas de validation de taille pour les medias entrants

**Fichier** : `src/webhooks/inbound-message.service.ts`

**Description** :
Les medias entrants (images, videos, documents) sont sauvegardes sans verification de taille. Whapi fournit `file_size` dans le payload, Meta ne le fournit pas.

**Risque** : Un client pourrait envoyer un fichier volumineux (video 100MB+) qui serait stocke sans controle. Accumulation possible menant a saturation du stockage.

**Correction suggeree** : Verifier `media.fileSize` quand disponible (Whapi) et imposer une limite (ex: 50MB). Pour Meta, verifier la taille lors du telechargement effectif.

---

### P17 - BAS : Recherche chat_id sensible a la casse

**Fichier** : `src/dispatcher/dispatcher.service.ts`

**Description** :
Le `chat_id` (format: `2250700000000@s.whatsapp.net`) est compare de maniere sensible a la casse. Bien que les numeros de telephone soient des digits, le suffixe `@s.whatsapp.net` pourrait varier en casse selon le provider.

**Risque** : Faible en pratique, car les providers utilisent toujours la meme casse. Mais un edge case pourrait creer une conversation dupliquee.

**Correction suggeree** : Normaliser les chat_id en lowercase avant comparaison.

---

## MATRICE DE PRIORITE

> P6 et P14 sont marques VOULU (exclus de la matrice)

```
                    Impact Eleve           Impact Moyen           Impact Bas
                ┌──────────────────┬──────────────────┬──────────────────┐
  Effort Bas    │ P3 (field check) │ P11 (typing)     │ P17 (casse)     │
                │ P4 (interactive) │ P13 (duplicata)  │                 │
                ├──────────────────┼──────────────────┼──────────────────┤
  Effort Moyen  │ P1 (statuts WS)  │ P10 (channel)    │ P16 (media sz)  │
                │ P2 (erreurs)     │ P12 (idempotence)│                 │
                │ P5 (rate limit)  │ P9 (put/patch)   │                 │
                │                  │ P15 (historique)  │                 │
                ├──────────────────┼──────────────────┼──────────────────┤
  Effort Eleve  │ P0 (routage)     │ P7 (facturation) │                 │
                │                  │ P8 (ads/referral)│                 │
                └──────────────────┴──────────────────┴──────────────────┘
```

**Ordre de traitement recommande** :
1. **P0** : Bloquant pour l'unification Whapi/Meta (branche actuelle)
2. **P3, P4** : Quick wins critiques (quelques lignes de code)
3. **P1, P2** : Statuts et erreurs - visibilite agent essentielle
4. **P5** : Securite - rate limiting
5. **P15** : Historique des numeros client (nouvelle table + logique)
6. **P11, P13** : Corrections moyennes rapides
7. **P10, P12** : Robustesse du flux sortant
8. **P7, P8, P9** : Enrichissement donnees metier
9. **P16, P17** : Ameliorations bas priorite
