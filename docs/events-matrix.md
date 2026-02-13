# Matrice Officielle des Events Socket

Date: 2026-02-13  
Perimetre: `message_whatsapp` (backend), `front`, `admin`

## 1) Inbound (Client -> Backend)

| Event | Type | Payload | Emetteur | Consommateur | Statut |
|---|---|---|---|---|---|
| `conversations:get` | - | `{ search?: string }` | Front | Backend (gateway) | actif |
| `contacts:get` | - | `{}` | Front | Backend (gateway) | actif |
| `messages:get` | - | `{ chat_id: string }` | Front | Backend (gateway) | actif |
| `messages:read` | - | `{ chat_id: string }` | Front | Backend (gateway) | actif |
| `message:send` | - | `{ chat_id: string; text: string; tempId?: string }` | Front | Backend (gateway) | actif |
| `chat:event` | `TYPING_START` / `TYPING_STOP` | `{ chat_id: string }` | Front | Backend (gateway) | actif |

## 2) Outbound (Backend -> Client)

### 2.1 `chat:event` (enveloppe unique)
| Type | Payload (canonique) | Emis par | Consomme par | Statut |
|---|---|---|---|---|
| `CONVERSATION_LIST` | `Conversation[]` | Backend | Front | actif |
| `MESSAGE_LIST` | `{ chat_id: string; messages: Message[] }` | Backend | Front | actif |
| `MESSAGE_ADD` | `Message` | Backend | Front | actif |
| `CONVERSATION_UPSERT` | `Conversation` | Backend | Front | actif |
| `MESSAGE_SEND_ERROR` | `{ tempId?: string; code?: string; message?: string }` | Backend | Front | actif |
| `CONVERSATION_ASSIGNED` | `Conversation` | Backend | Front | actif |
| `CONVERSATION_REMOVED` | `{ chat_id: string }` | Backend | Front | actif |
| `CONVERSATION_READONLY` | `{ chat_id: string; read_only: boolean }` | Backend | Front | actif |
| `TYPING_START` | `{ chat_id: string; commercial_id?: string }` | Backend | Front | actif |
| `TYPING_STOP` | `{ chat_id: string; commercial_id?: string }` | Backend | Front | actif |

### 2.2 `contact:event`
| Type | Payload (canonique) | Emis par | Consomme par | Statut |
|---|---|---|---|---|
| `CONTACT_LIST` | `Contact[]` | Backend | Front | actif |
| `CONTACT_UPSERT` | `Contact` | Backend | Front | actif |
| `CONTACT_REMOVED` | `{ contact_id: string; chat_id?: string }` | Backend | Front | actif |
| `CONTACT_CALL_STATUS_UPDATED` | `Contact` | Backend | Front | actif |

### 2.3 `queue:updated`
| Event | Payload (canonique) | Emis par | Consomme par | Statut |
|---|---|---|---|---|
| `queue:updated` | `QueuePosition[]` | Backend | Admin | actif |

## 3) Events Deprecies/Retires

| Event | Raison | Statut |
|---|---|---|
| `contact:get` | Pas de handler backend | retire |
| `message:status:update` | Non emis par backend | retire |
| `CONVERSATION_REASSIGNED` | Non emis par backend | retire |
| `AUTO_MESSAGE_STATUS` | Non emis par backend | retire |
| `typing:start` / `typing:stop` | Centralisation sur `chat:event` | retire |

## 4) Notes
- Tous les evenements metier chat doivent rester dans `chat:event` avec `type`.
- Tous les evenements contacts doivent rester dans `contact:event`.
- Les payloads doivent rester compatibles avec les transforms front (`transformToConversation`, `transformToMessage`, `transformToContact`).
