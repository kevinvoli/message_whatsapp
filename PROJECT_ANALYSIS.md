# Analyse du Projet - Dispatcher WhatsApp Multi-Channels

Ce document détaille les fonctionnalités, les routes API, les méthodes et les événements WebSocket du projet.

## 1. Architecture Globale

Le projet est composé de trois parties principales :
- **Backend (message_whatsapp)** : Développé avec NestJS, TypeORM et MySQL. Il gère la logique métier, l'intégration avec l'API Whapi, le dispatching des conversations et la communication temps réel via WebSockets.
- **Frontend Agent (front)** : Développé avec Next.js et Zustand. C'est l'interface utilisée par les commerciaux pour gérer les conversations WhatsApp.
- **Interface Admin (admin)** : Interface de gestion pour les administrateurs (gestion des utilisateurs, channels, postes).

---

## 2. Fonctionnalités Principales

- **Multi-Channels** : Gestion de plusieurs comptes WhatsApp via Whapi.
- **Dispatcher Intelligent** : Assignation automatique des nouvelles conversations aux agents disponibles (Round-Robin).
- **Gestion des États Agents** : Suivi en temps réel de la connexion des agents (Online/Offline).
- **Communication Temps Réel** : Envoi et réception de messages instantanés via WebSockets.
- **Gestion des Postes** : Regroupement des agents par postes/services.
- **Réinjection de Conversations** : Réassignation automatique si un agent ne répond pas dans un délai imparti.
- **Messages Automatiques** : Envoi de messages de bienvenue ou de réponses automatiques.

---

## 3. Documentation de l'API Backend

### Authentification
- **POST `/auth/login`** : Connexion de l'utilisateur.
  - Body: `{ email, password }`
  - Retourne: `{ token, user }`

### Utilisateurs / Commerciaux (`/users`)
- **GET `/users`** : Liste tous les utilisateurs.
- **POST `/users`** : Crée un nouvel utilisateur.
  - Body: `{ email, name, password, poste_id, role }`
- **GET `/users/:id`** : Récupère un utilisateur par son ID.
- **PATCH `/users/:id`** : Met à jour un utilisateur.
- **DELETE `/users/:id`** : Supprime un utilisateur.

### Channels (`/channel`)
- **GET `/channel`** : Liste tous les channels Whapi configurés.
- **POST `/channel`** : Ajoute un nouveau channel.
  - Body: `{ token }`
- **GET `/channel/:id`** : Récupère les détails d'un channel.
- **PATCH `/channel/:id`** : Met à jour un channel.
- **DELETE `/channel/:id`** : Supprime un channel.

### Postes (`/poste`)
- **GET `/poste`** : Liste tous les postes.
- **POST `/poste`** : Crée un nouveau poste.
  - Body: `{ name, code }`
- **PATCH `/poste/:id`** : Met à jour un poste.
- **DELETE `/poste/:id`** : Supprime un poste.

### Contacts (`/contact`)
- **GET `/contact`** : Liste tous les contacts.
- **GET `/contact/:id`** : Récupère un contact spécifique.
- **PATCH `/contact/:id`** : Met à jour un contact.
- **DELETE `/contact/:id`** : Supprime un contact.

### Webhooks (`/webhooks/whapi`)
- **POST `/webhooks/whapi`** : Point d'entrée pour les webhooks Whapi (réception de messages, mises à jour de statut).

---

## 4. Événements WebSocket (Port 3001)

Le backend utilise Socket.io pour la communication temps réel.

### Client -> Serveur
- **`conversations:get`** : Demande la liste des conversations de l'agent.
- **`messages:get`** : Demande les messages d'une conversation (`{ chat_id }`).
- **`message:send`** : Envoie un message (`{ chat_id, text, tempId }`).
- **`typing:start`** : Indique que l'agent commence à écrire (`{ chat_id }`).
- **`typing:stop`** : Indique que l'agent a arrêté d'écrire (`{ chat_id }`).

### Serveur -> Client
- **`chat:event`** : Événement générique contenant un `type` et un `payload`.
  - Types: `CONVERSATION_LIST`, `MESSAGE_LIST`, `MESSAGE_ADD`, `CONVERSATION_UPSERT`, `CONVERSATION_REMOVED`, `CONVERSATION_ASSIGNED`.
- **`typing:start` / `typing:stop`** : Notifie l'état d'écriture de l'autre partie.
- **`queue:updated`** : Mise à jour de la file d'attente du dispatcher.

---

## 5. Structure du Projet

```
.
├── admin/               # Interface d'administration (React/Next.js)
├── front/               # Interface Agent (Next.js)
├── message_whatsapp/    # Backend (NestJS)
└── docker-compose.yml   # Orchestration des services
```
