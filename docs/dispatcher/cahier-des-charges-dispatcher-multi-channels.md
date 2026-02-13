# 📘 Cahier des charges – Dispatcher Multi-Channels (WHAPI)

## 1. Contexte

Le système actuel gère :
- **un seul channel WhatsApp à la fois**
- un **dispatcher central**
- une **file d’attente (queue) d’agents**
- des **messages en attente (pending_messages)** lorsque aucun agent n’est disponible

L’objectif est d’**étendre le dispatcher existant pour gérer plusieurs channels simultanément**, **sans casser l’architecture actuelle**, et en garantissant :
- l’isolation stricte des channels
- la cohérence des messages réels et pending
- une communication fiable entre **WHAPI ↔ Backend ↔ Frontend**

---

## 2. Objectif principal

Permettre à un **dispatcher unique** de :
- gérer **plusieurs channels WHAPI**
- dispatcher les messages **par channel**
- maintenir des **queues, conversations et pending messages isolés par channel**
- redistribuer correctement les messages en attente dès qu’un agent devient disponible sur un channel donné

---

## 3. Périmètre (strict)

### Inclus
- Dispatcher
- Assignation agent
- Flux WHAPI → Backend → Frontend
- Vérification de cohérence des suppressions

### Exclus
- UI / design frontend
- Authentification
- Permissions avancées
- Analytics
- Historique multi-device

---

## 4. Définitions clés

| Terme | Description |
|-----|------------|
| Channel | Instance WhatsApp (WHAPI) identifiée par `channel_id` |
| Dispatcher | Service central d’assignation des conversations |
| Conversation | Session client ↔ agent sur un channel |
| Agent | Commercial connecté via WebSocket |

---

## 5. Principe fondamental (RÈGLE D’OR)

> **Aucun message, conversation, agent ou pending ne doit traverser les channels.**

Chaque traitement doit être **scopé par `channel_id`**.

---

## 6. Modèle de données (extensions obligatoires)

### 6.1 Channel

```ts


