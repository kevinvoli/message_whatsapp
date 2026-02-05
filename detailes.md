# Détails du Projet - Backend & Panel Admin

Ce document récapitule les routes et fonctionnalités du backend ainsi que le statut du panel admin.

## Backend

### Authentification
- `POST /auth/login` : Authentification initiale. [Présent]

### Utilisateurs (Agents)
- `GET /users` : Liste tous les utilisateurs. [Présent] (Sécurisé Admin)
- `GET /users/:id` : Récupère un utilisateur par ID. [Présent] (Sécurisé Admin)
- `POST /users` : Crée un nouvel utilisateur. [Présent] (Sécurisé Admin)
- `PATCH /users/:id` : Met à jour un utilisateur. [Présent] (Sécurisé Admin)
- `DELETE /users/:id` : Supprime un utilisateur. [Présent] (Sécurisé Admin)

### Canaux Whapi
- `GET /channel` : Liste tous les canaux. [Présent] (Sécurisé Admin)
- `GET /channel/:id` : Récupère un canal par ID. [Présent] (Sécurisé Admin)
- `POST /channel` : Crée un nouveau canal. [Présent] (Sécurisé Admin)
- `PATCH /channel/:id` : Met à jour un canal. [Créé] (Sécurisé Admin)
- `DELETE /channel/:id` : Supprime un canal. [Créé] (Sécurisé Admin)

### Postes
- `GET /poste` : Liste tous les postes. [Présent] (Sécurisé Admin)
- `POST /poste` : Crée un nouveau poste. [Présent] (Sécurisé Admin)
- `PATCH /poste/:id` : Met à jour un poste. [Présent] (Sécurisé Admin)
- `DELETE /poste/:id` : Supprime un poste. [Présent] (Sécurisé Admin)

### Conversations (Chats)
- `GET /chats` : Liste toutes les conversations (Monitoring Admin). [Créé] (Sécurisé Admin)
- `GET /chats/:chat_id` : Détails d'une conversation. [Créé] (Sécurisé Admin)
- WebSockets : Gestion temps réel pour les agents. [Présent]

### Messages
- `GET /messages/:chat_id` : Liste les messages d'une conversation. [Créé] (Sécurisé Admin)
- WebSockets : Envoi/Réception temps réel. [Présent]

## Panel Admin

### Fonctionnalités
- Authentification HTTP : Connexion réservée aux ADMINs via HTTP. [Créé]
- Dashboard : Vue d'ensemble avec statistiques de base. [Créé]
- Gestion des Utilisateurs : CRUD complet via HTTP. [Créé]
- Gestion des Canaux Whapi : CRUD complet via HTTP. [Créé]
- Gestion des Postes : CRUD complet via HTTP. [Créé]
- Monitoring : Visualisation des conversations en cours sans Sockets (HTTP Refresh). [Créé]

## Modifications Structurelles
- **Sécurité** : Implémentation de `RolesGuard` et décorateur `@Roles`.
- **Base de données** : Relation formelle entre `WhatsappChat` et `WhapiChannel`.
- **Compatibilité** : Préservation du champ `last_msg_client_channel_id` pour le front tout en ajoutant `channel_id` pour le backend et l'admin.

## États
- **Présent** : Déjà implémenté et fonctionnel avant intervention.
- **Créé** : Implémenté lors de cette tâche.
- **À venir** : Fonctionnalités futures possibles (ex: statistiques détaillées, logs système).
