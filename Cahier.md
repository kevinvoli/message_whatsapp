# Cahier des Charges - Dispatcher WhatsApp

## 📋 Vue d'ensemble du projet

### Objectif
Développer une plateforme de gestion et de distribution automatique des conversations WhatsApp aux commerciaux en temps réel, basée sur un système de file d'attente et de rotation équitable.

### Stack Technique

#### Backend
- **Framework** : NestJS
- **Base de données** : MySQL
- **ORM** : TypeORM
- **Validation** : class-validator (DTO)
- **Communication temps réel** : WebSocket (Socket.io)
- **Intégration** : Whapi.cloud WebSocket API

#### Frontend
- **Framework** : Next.js (React)
- **Styling** : TailwindCSS (pas de shadcn/ui)
- **Communication** : WebSocket (Socket.io-client)
- **Gestion d'état** : React Hooks

---

## 🏗️ Architecture Frontend (Respecter strictement)

```
├───app
│   │   favicon.ico
│   │   globals.css
│   │   layout.tsx
│   │   page.tsx
│   │
│   ├───login
│   │       page.tsx
│   │
│   └───whatsapp
│           page.tsx
│
├───components
│   ├───auth
│   │       loginForm.tsx
│   │
│   ├───chat
│   │       ChatHeader.tsx
│   │       ChatInput.tsx
│   │       ChatMessages.tsx
│   │
│   ├───sidebar
│   │       ConversationItem.tsx
│   │       Sidebar.tsx
│   │
│   └───ui
│           button.tsx
│           card.tsx
│           input.tsx
│
├───hooks
│       useAuth.ts
│       useConversations.ts
│       useWebSocket.ts
│
├───lib
│       utils.ts
│
└───types
        chat.ts
```

---

## 📐 Règles Métier du Dispatcher

### Règle 1 : Attribution des conversations
- **R1.1** : Une conversation est attribuée à un commercial connecté selon un système de rotation (round-robin)
- **R1.2** : Seuls les commerciaux dans la file d'attente peuvent recevoir des conversations
- **R1.3** : Après avoir attribué une conversation à chaque commercial, le dispatcher revient au premier commercial de la liste

### Règle 2 : Gestion de la déconnexion
- **R2.1** : Si un commercial se déconnecte pendant une conversation active, il est immédiatement retiré de la file d'attente
- **R2.2** : Si le client envoie un message pendant que son commercial est déconnecté, la conversation est réattribuée à un autre commercial
- **R2.3** : Tant que le client n'envoie pas de message, la conversation reste attribuée au commercial déconnecté
- **R2.4** : À la reconnexion, le commercial est placé en dernière position de la file d'attente

### Règle 3 : File d'attente des messages
- **R3.1** : Si tous les commerciaux sont déconnectés et que des clients envoient des messages, ces messages sont stockés dans une file d'attente
- **R3.2** : L'administrateur peut paramétrer une heure de distribution automatique des messages en attente
- **R3.3** : L'administrateur peut forcer la distribution immédiate, indépendamment de l'heure programmée

### Règle 4 — Inactivité commerciale (anti-sleep)
- **R4.1** : Dès qu’un commercial reçoit une conversation : un timer de réponse initiale démarre (ex: 5 min)
- ***R4.2** : Si aucune première réponse dans le délai : la conversation est réinjectée le commercial perd la priorité
- **R4.3** : Une réponse valide = message envoyé au client

### Règle 5 — Délai légal WhatsApp (24h)
- **R5.1** : Après 24h sans réponse commerciale : écriture bloquée
- **R5.2** : Lecture toujours autorisée
- **R5.3** : Le délai est paramétrable


### Règle 5 : Communication WebSocket obligatoire
- **R5.1** : Toutes les communications front-back doivent passer par WebSocket
- **R5.2** : Exception : l'authentification initiale du commercial peut utiliser HTTP/REST

### Règle 6 — WebSocket
- **R6.1** : Tout le flux temps réel passe par WebSocket
- **R6.2** : HTTP uniquement pour login / refresh token

---

## 🎯 Fonctionnalités de Base WhatsApp à Implémenter

### F1 : Messagerie instantanée
- Envoi/réception de messages texte en temps réel
- Affichage de l'état du message (envoyé, délivré, lu)
- Notification sonore/visuelle à réception

### F2 : Gestion des médias
- Envoi/réception d'images
- Envoi/réception de documents (PDF, etc.)
- Prévisualisation des médias

### F3 : Indicateurs de conversation
- Indicateur "en train d'écrire..."
- Affichage du dernier message reçu
- Compteur de messages non lus

### F4 : Informations client
- Nom/numéro du contact
- Photo de profil
- Historique complet de la conversation

### F5 : Recherche et filtres
- Recherche de conversations par nom/numéro
- Filtrage par statut (actif, en attente, fermé)
- Tri par date du dernier message

---

## 📦 PHASE 1 : Configuration et Architecture de Base

### Tâche 1.1 : Initialisation du Backend
**Objectif** : Créer la structure de base du projet NestJS

#### Sous-tâche 1.1.1 : Créer le projet NestJS
- Initialiser un nouveau projet NestJS
- Configurer TypeScript avec les options strictes
- Configurer ESLint et Prettier
- Créer le fichier `.env` avec les variables d'environnement
- **Commit** : "chore: initialize NestJS project with TS config"

#### Sous-tâche 1.1.2 : Installer les dépendances backend
- Installer TypeORM et mysql2
- Installer class-validator et class-transformer
- Installer @nestjs/websockets et socket.io
- Installer @nestjs/config pour la gestion des variables d'environnement
- Installer bcrypt pour le hashage des mots de passe
- **Commit** : "chore: install backend dependencies"

#### Sous-tâche 1.1.3 : Configurer TypeORM
- Créer le fichier `ormconfig.ts`
- Configurer la connexion à MySQL
- Configurer les migrations
- Tester la connexion à la base de données
- **Commit** : "feat: configure TypeORM and MySQL connection"

#### Sous-tâche 1.1.4 : Structure des modules backend
- Créer le module `auth`
- Créer le module `users`
- Créer le module `conversations`
- Créer le module `messages`
- Créer le module `dispatcher`
- Créer le module `settings`
- Créer le module `websocket`
- **Commit** : "feat: create base module structure"

### Tâche 1.2 : Initialisation du Frontend
**Objectif** : Créer la structure de base du projet Next.js

#### Sous-tâche 1.2.1 : Créer le projet Next.js
- Initialiser un nouveau projet Next.js avec TypeScript
- Configurer TailwindCSS
- Supprimer les fichiers de démarrage inutiles
- Configurer ESLint et Prettier (identique au backend)
- **Commit** : "chore: initialize Next.js project with TailwindCSS"

#### Sous-tâche 1.2.2 : Installer les dépendances frontend
- Installer socket.io-client
- Installer axios (pour l'authentification HTTP)
- Installer date-fns pour la gestion des dates
- Installer react-hot-toast pour les notifications
- **Commit** : "chore: install frontend dependencies"

#### Sous-tâche 1.2.3 : Créer l'architecture des dossiers
- Créer tous les dossiers selon la structure définie
- Créer les fichiers vides dans chaque dossier
- Ajouter des commentaires TODO dans chaque fichier
- **Commit** : "feat: create frontend folder structure"

#### Sous-tâche 1.2.4 : Configurer les types TypeScript partagés
- Créer `types/chat.ts` avec les interfaces de base
- Créer `types/user.ts`
- Créer `types/message.ts`
- Créer `types/conversation.ts`
- **Commit** : "feat: define TypeScript interfaces"

---

## 📦 PHASE 2 : Base de Données et Entités

### Tâche 2.1 : Création des Entités TypeORM
**Objectif** : Définir toutes les entités de la base de données

#### Sous-tâche 2.1.1 : Entité User (Commercial/Admin)
- Créer `src/users/entities/user.entity.ts`
- Champs : id, email, password, firstName, lastName, role (ADMIN/COMMERCIAL), isConnected, lastConnectionAt, createdAt, updatedAt
- Ajouter les décorateurs TypeORM
- Ajouter les relations
- **Commit** : "feat: create User entity"

#### Sous-tâche 2.1.2 : Entité Conversation
- Créer `src/conversations/entities/conversation.entity.ts`
- Champs : id, clientPhone, clientName, clientProfilePic, assignedToUserId, status (PENDING/ACTIVE/CLOSED), lastMessageAt, unreadCount, assignedAt, createdAt, updatedAt
- Ajouter les relations avec User et Message
- **Commit** : "feat: create Conversation entity"

#### Sous-tâche 2.1.3 : Entité Message
- Créer `src/messages/entities/message.entity.ts`
- Champs : id, conversationId, content, type (TEXT/IMAGE/DOCUMENT), mediaUrl, sender (CLIENT/COMMERCIAL), status (SENT/DELIVERED/READ), sentAt, createdAt
- Ajouter les relations avec Conversation
- **Commit** : "feat: create Message entity"

#### Sous-tâche 2.1.4 : Entité QueuePosition
- Créer `src/dispatcher/entities/queue-position.entity.ts`
- Champs : id, userId, position, addedAt, updatedAt
- Relation avec User
- **Commit** : "feat: create QueuePosition entity"

#### Sous-tâche 2.1.5 : Entité PendingMessage
- Créer `src/dispatcher/entities/pending-message.entity.ts`
- Champs : id, clientPhone, clientName, content, type, mediaUrl, receivedAt
- **Commit** : "feat: create PendingMessage entity"

#### Sous-tâche 2.1.6 : Entité Settings
- Créer `src/settings/entities/settings.entity.ts`
- Champs : id, key, value, type (STRING/NUMBER/BOOLEAN/TIME), description, updatedAt
- Paramètres : RESPONSE_TIMEOUT (24h par défaut), AUTO_DISTRIBUTE_TIME (heure de distribution)
- **Commit** : "feat: create Settings entity"

#### Sous-tâche 2.1.7 : Générer et exécuter les migrations
- Générer la migration initiale
- Vérifier le schéma SQL généré
- Exécuter la migration
- Vérifier la création des tables dans MySQL
- **Commit** : "feat: generate and run initial migration"

---

## 📦 PHASE 3 : Module d'Authentification

### Tâche 3.1 : Backend - Authentification
**Objectif** : Implémenter l'authentification JWT

#### Sous-tâche 3.1.1 : Configuration JWT
- Installer @nestjs/jwt et @nestjs/passport
- Créer `src/auth/strategies/jwt.strategy.ts`
- Créer `src/auth/guards/jwt-auth.guard.ts`
- Configurer JWT dans le module Auth
- **Commit** : "feat: configure JWT authentication"

#### Sous-tâche 3.1.2 : DTOs d'authentification
- Créer `src/auth/dto/login.dto.ts` avec validations
- Créer `src/auth/dto/register.dto.ts` avec validations
- Ajouter les décorateurs de validation (IsEmail, MinLength, etc.)
- **Commit** : "feat: create auth DTOs with validation"

#### Sous-tâche 3.1.3 : Service d'authentification
- Créer `src/auth/auth.service.ts`
- Implémenter `validateUser()` avec bcrypt
- Implémenter `login()` pour générer le JWT
- Implémenter `register()` pour créer un commercial
- **Commit** : "feat: implement authentication service"

#### Sous-tâche 3.1.4 : Controller d'authentification
- Créer `src/auth/auth.controller.ts`
- Route POST `/auth/login`
- Route POST `/auth/register` (protégée, admin seulement)
- Route GET `/auth/profile` (protégée)
- **Commit** : "feat: implement authentication controller"

### Tâche 3.2 : Frontend - Authentification
**Objectif** : Créer l'interface de connexion

#### Sous-tâche 3.2.1 : Hook useAuth
- Créer `hooks/useAuth.ts`
- Implémenter la logique de connexion/déconnexion
- Gérer le stockage du token JWT
- Gérer le state de l'utilisateur connecté
- **Commit** : "feat: implement useAuth hook"

#### Sous-tâche 3.2.2 : Composant LoginForm
- Créer `components/auth/loginForm.tsx`
- Formulaire avec email et password
- Validation côté client
- Affichage des erreurs
- Bouton de soumission avec état de chargement
- **Commit** : "feat: create login form component"

#### Sous-tâche 3.2.3 : Page de connexion
- Créer `app/login/page.tsx`
- Intégrer le LoginForm
- Design avec TailwindCSS (centré, carte élégante)
- Redirection après connexion réussie
- **Commit** : "feat: create login page"

#### Sous-tâche 3.2.4 : Protection des routes
- Créer un middleware de protection
- Rediriger vers /login si non authentifié
- Rediriger vers /whatsapp si déjà authentifié (page login)
- **Commit** : "feat: implement route protection"

---

## 📦 PHASE 4 : Module WebSocket

### Tâche 4.1 : Backend - Configuration WebSocket
**Objectif** : Mettre en place la communication temps réel

#### Sous-tâche 4.1.1 : Gateway WebSocket principal
- Créer `src/websocket/websocket.gateway.ts`
- Configurer Socket.io avec authentification JWT
- Implémenter `handleConnection()` et `handleDisconnect()`
- Gérer la liste des utilisateurs connectés en mémoire
- **Commit** : "feat: create WebSocket gateway with JWT auth"

#### Sous-tâche 4.1.2 : Service de gestion des connexions
- Créer `src/websocket/websocket.service.ts`
- Méthode `addConnectedUser(userId, socketId)`
- Méthode `removeConnectedUser(userId)`
- Méthode `getConnectedUsers()`
- Méthode `isUserConnected(userId)`
- **Commit** : "feat: implement WebSocket connection service"

#### Sous-tâche 4.1.3 : Événements WebSocket de base
- Événement `user:connected` (émis au serveur)
- Événement `user:disconnected` (émis au serveur)
- Événement `user:status:update` (broadcast)
- **Commit** : "feat: implement basic WebSocket events"

### Tâche 4.2 : Frontend - Configuration WebSocket
**Objectif** : Connecter le frontend au WebSocket

#### Sous-tâche 4.2.1 : Hook useWebSocket
- Créer `hooks/useWebSocket.ts`
- Initialiser la connexion Socket.io avec le token JWT
- Gérer la reconnexion automatique
- Gérer les événements de connexion/déconnexion
- Exposer les méthodes `emit()` et `on()`
- **Commit** : "feat: implement useWebSocket hook"

#### Sous-tâche 4.2.2 : Context WebSocket
- Créer un context React pour partager la connexion WebSocket
- Provider qui englobe l'application
- Hook personnalisé `useWebSocketContext()`
- **Commit** : "feat: create WebSocket context"

#### Sous-tâche 4.2.3 : Indicateur de connexion
- Ajouter un indicateur visuel de l'état de connexion
- Badge dans le header (connecté/déconnecté)
- Notification toast en cas de déconnexion
- **Commit** : "feat: add connection status indicator"

---

## 📦 PHASE 5 : Module Dispatcher (Cœur du Système)

### Tâche 5.1 : Backend - Service Dispatcher
**Objectif** : Implémenter la logique de distribution des conversations

#### Sous-tâche 5.1.1 : Service de file d'attente
- Créer `src/dispatcher/services/queue.service.ts`
- Méthode `addToQueue(userId)` : ajouter un commercial à la fin
- Méthode `removeFromQueue(userId)` : retirer un commercial
- Méthode `getNextInQueue()` : obtenir le prochain commercial (rotation)
- Méthode `getQueuePositions()` : obtenir toute la file
- Méthode `moveToEnd(userId)` : déplacer à la fin (reconnexion)
- **Commit** : "feat: implement queue service with round-robin"

#### Sous-tâche 5.1.2 : Service de distribution
- Créer `src/dispatcher/services/dispatcher.service.ts`
- Méthode `assignConversation(clientPhone)` : attribuer une conversation
- Logique : vérifier si conversation existe déjà
- Si nouvelle conversation : obtenir le prochain commercial et créer la conversation
- Si conversation existante mais commercial déconnecté : réattribuer
- **Commit** : "feat: implement conversation assignment logic"

#### Sous-tâche 5.1.3 : Gestion des messages en attente
- Méthode `addPendingMessage(clientPhone, content, type, mediaUrl)`
- Méthode `getPendingMessages()` : récupérer tous les messages en attente
- Méthode `distributePendingMessages()` : distribuer tous les messages en attente
- Vérifier qu'il y a des commerciaux connectés avant distribution
- **Commit** : "feat: implement pending messages handling"

#### Sous-tâche 5.1.4 : Gestion du délai de réponse (24h)
- Méthode `checkResponseTimeout()` : vérifier les conversations sans réponse
- Marquer les conversations comme "lecture seule" après le délai
- Tâche cron pour vérifier toutes les 30 minutes
- Utiliser le paramètre RESPONSE_TIMEOUT depuis Settings
- **Commit** : "feat: implement 24h response timeout"

#### Sous-tâche 5.1.5 : Gestion de la connexion/déconnexion
- Méthode `handleUserConnected(userId)`
- Ajouter à la file d'attente (à la fin si reconnexion)
- Méthode `handleUserDisconnected(userId)`
- Retirer de la file d'attente
- Émettre un événement WebSocket de mise à jour de la file
- **Commit** : "feat: handle user connection/disconnection in queue"

#### Sous-tâche 5.1.6 : Distribution automatique programmée
- Créer un cron job avec @nestjs/schedule
- Lire AUTO_DISTRIBUTE_TIME depuis Settings
- À l'heure programmée, appeler `distributePendingMessages()`
- Méthode `forceDistribute()` pour distribution manuelle (admin)
- **Commit** : "feat: implement scheduled auto-distribution"

### Tâche 5.2 : Backend - Événements WebSocket Dispatcher
**Objectif** : Exposer les fonctionnalités via WebSocket

#### Sous-tâche 5.2.1 : Événements de conversation
- `conversation:new` (serveur → client) : nouvelle conversation attribuée
- `conversation:assigned` (serveur → client) : conversation attribuée
- `conversation:reassigned` (serveur → client) : conversation réattribuée
- `conversation:locked` (serveur → client) : conversation verrouillée (24h dépassées)
- **Commit** : "feat: implement conversation WebSocket events"

#### Sous-tâche 5.2.2 : Événements de file d'attente
- `queue:updated` (serveur → tous) : mise à jour de la file
- `queue:position` (serveur → client) : position dans la file
- **Commit** : "feat: implement queue WebSocket events"

#### Sous-tâche 5.2.3 : Événements de messages en attente
- `pending:messages:count` (serveur → admin) : nombre de messages en attente
- `pending:distribute` (admin → serveur) : forcer la distribution
- **Commit** : "feat: implement pending messages WebSocket events"

---

## 📦 PHASE 6 : Module Conversations

### Tâche 6.1 : Backend - Service Conversations
**Objectif** : Gérer les conversations et les messages

#### Sous-tâche 6.1.1 : CRUD Conversations
- Créer `src/conversations/conversations.service.ts`
- Méthode `findAllByUser(userId)` : conversations d'un commercial
- Méthode `findOne(id, userId)` : une conversation avec vérification propriétaire
- Méthode `updateStatus(id, status)` : changer le statut
- Méthode `incrementUnreadCount(conversationId)`
- Méthode `resetUnreadCount(conversationId)`
- **Commit** : "feat: implement conversations service CRUD"

#### Sous-tâche 6.1.2 : Service Messages
- Créer `src/messages/messages.service.ts`
- Méthode `create(conversationId, content, type, sender, mediaUrl)`
- Méthode `findByConversation(conversationId, limit, offset)` : pagination
- Méthode `updateStatus(messageId, status)` : DELIVERED/READ
- **Commit** : "feat: implement messages service"

#### Sous-tâche 6.1.3 : Événements WebSocket Messages
- `message:send` (client → serveur) : envoyer un message
- `message:receive` (serveur → client) : recevoir un message
- `message:typing` (client → serveur) : indicateur "en train d'écrire"
- `message:stop-typing` (client → serveur)
- `message:status:update` (serveur → client) : statut du message
- **Commit** : "feat: implement message WebSocket events"

#### Sous-tâche 6.1.4 : Logique d'envoi de message
- Vérifier que le commercial a le droit d'écrire (pas de timeout 24h)
- Vérifier que la conversation appartient bien au commercial
- Créer le message en base
- Envoyer le message via Whapi.cloud WebSocket
- Émettre l'événement `message:receive` au client
- **Commit** : "feat: implement message sending logic"

### Tâche 6.2 : Frontend - Liste des Conversations
**Objectif** : Afficher la liste des conversations

#### Sous-tâche 6.2.1 : Hook useConversations
- Créer `hooks/useConversations.ts`
- Récupérer la liste des conversations via WebSocket
- Gérer l'état des conversations (tableau)
- Méthode `selectConversation(id)`
- Écouter les événements de nouvelles conversations
- **Commit** : "feat: implement useConversations hook"

#### Sous-tâche 6.2.2 : Composant ConversationItem
- Créer `components/sidebar/ConversationItem.tsx`
- Afficher : photo de profil, nom, dernier message, heure, badge non lus
- Style : actif si sélectionné
- Clic pour sélectionner
- **Commit** : "feat: create ConversationItem component"

#### Sous-tâche 6.2.3 : Composant Sidebar
- Créer `components/sidebar/Sidebar.tsx`
- Afficher la liste des ConversationItem
- Barre de recherche en haut
- Scrollable si beaucoup de conversations
- Badge total de messages non lus
- **Commit** : "feat: create Sidebar component"

### Tâche 6.3 : Frontend - Interface de Chat
**Objectif** : Interface pour envoyer/recevoir des messages

#### Sous-tâche 6.3.1 : Composant ChatHeader
- Créer `components/chat/ChatHeader.tsx`
- Afficher : photo, nom, numéro du client
- Indicateur "en ligne" / "en train d'écrire..."
- Bouton pour fermer/marquer comme résolu
- **Commit** : "feat: create ChatHeader component"

#### Sous-tâche 6.3.2 : Composant ChatMessages
- Créer `components/chat/ChatMessages.tsx`
- Afficher la liste des messages (scroll inversé)
- Style différent pour messages CLIENT vs COMMERCIAL
- Afficher l'heure d'envoi
- Indicateurs de statut (✓ envoyé, ✓✓ lu)
- Auto-scroll vers le bas
- **Commit** : "feat: create ChatMessages component"

#### Sous-tâche 6.3.3 : Composant ChatInput
- Créer `components/chat/ChatInput.tsx`
- Champ de texte multiline
- Bouton d'envoi
- Boutons pour joindre image/document
- Émettre l'événement "typing" pendant la saisie
- Désactiver si conversation verrouillée (24h)
- **Commit** : "feat: create ChatInput component"

#### Sous-tâche 6.3.4 : Page WhatsApp principale
- Créer `app/whatsapp/page.tsx`
- Layout : Sidebar à gauche, Chat à droite
- Responsive : mobile = liste OU chat
- Gérer la sélection de conversation
- Afficher un message si aucune conversation sélectionnée
- **Commit** : "feat: create main WhatsApp page layout"

---

## 📦 PHASE 7 : Intégration Whapi.cloud

### Tâche 7.1 : Backend - Service Whapi
**Objectif** : Communiquer avec l'API Whapi.cloud

#### Sous-tâche 7.1.1 : Configuration Whapi
- Créer `src/whapi/whapi.service.ts`
- Configurer les credentials Whapi dans .env
- Initialiser la connexion WebSocket Whapi
- **Commit** : "feat: configure Whapi.cloud service"

#### Sous-tâche 7.1.2 : Recevoir les messages WhatsApp
- Écouter l'événement `message` de Whapi WebSocket
- Parser le message reçu (clientPhone, content, type, mediaUrl)
- Appeler le dispatcher pour attribution/réattribution
- Créer le message en base avec sender=CLIENT
- Émettre l'événement WebSocket vers le commercial assigné
- **Commit** : "feat: handle incoming WhatsApp messages"

#### Sous-tâche 7.1.3 : Envoyer des messages WhatsApp
- Méthode `sendMessage(phone, content, type, mediaUrl)`
- Utiliser l'API Whapi pour envoyer
- Gérer les erreurs et retry
- Mettre à jour le statut du message (SENT)
- **Commit** : "feat: implement WhatsApp message sending"

#### Sous-tâche 7.1.4 : Gestion des médias
- Méthode `uploadMedia(file)` : uploader une image/document
- Obtenir l'URL du média
- Envoyer le message avec l'URL
- **Commit** : "feat: implement media upload and sending"

#### Sous-tâche 7.1.5 : Webhooks Whapi
- Écouter les événements de statut (delivered, read)
- Mettre à jour le statut des messages en base
- Émettre les événements WebSocket de mise à jour de statut
- **Commit** : "feat: handle Whapi webhooks for message status"

---

## 📦 PHASE 8 : Module Paramètres (Admin)

### Tâche 8.1 : Backend - Service Settings
**Objectif** : Permettre à l'admin de configurer le dispatcher

#### Sous-tâche 8.1.1 : CRUD Settings
- Créer `src/settings/settings.service.ts`
- Méthode `findAll()` : tous les paramètres
- Méthode `findByKey(key)` : un paramètre
- Méthode `update(key, value)` : modifier un paramètre
- Validation du type (NUMBER, TIME, etc.)
- **Commit** : "feat: implement settings service"

#### Sous-tâche 8.1.2 : Controller Settings
- Créer `src/settings/settings.controller.ts`
- Route GET `/settings` (admin seulement)
- Route PUT `/settings/:key` (admin seulement)
- DTOs de validation
- **Commit** : "feat: create settings controller"

#### Sous-tâche 8.1.3 : Paramètres initiaux
- Créer une migration pour insérer les paramètres par défaut
- RESPONSE_TIMEOUT : 24 (heures)
- AUTO_DISTRIBUTE_TIME : 09:00
- **Commit** : "feat: add default settings migration"

### Tâche 8.2 : Frontend - Interface Admin
**Objectif** : Interface pour modifier les paramètres

#### Sous-tâche 8.2.1 : Page Admin Settings
- Créer `app/admin/settings/page.tsx`
- Liste des paramètres avec leurs valeurs
- Champs de formulaire pour modifier
- Bouton "Enregistrer"
- Protéger la route (admin seulement)
- **Commit** : "feat: create admin settings page"

#### Sous-tâche 8.2.2 : Bouton de distribution forcée
- Ajouter un bouton "Distribuer maintenant"
- Émettre l'événement `pending:distribute`
- Afficher une confirmation
- Afficher le nombre de messages distribués
- **Commit** : "feat:




