# Détails du Projet - Backend & Panel Admin

Ce document récapitule les routes et fonctionnalités du backend ainsi que le statut du panel admin.

## Backend

### Authentification
- `POST /auth/login` : Authentification initiale. [Présent]
- `GET /auth/profile` : Récupération du profil utilisateur via JWT. [Créé]

### Global
- `GET /stats` : Statistiques globales pour le dashboard (commerciaux, canaux, conversations). [Créé] (Sécurisé Admin)

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
- WebSockets : Gestion temps réel pour les agents avec support du filtrage (search) côté serveur. [Réfléchi]

### Messages
- `GET /messages/:chat_id` : Liste les messages d'une conversation. [Créé] (Sécurisé Admin)
- WebSockets : Envoi/Réception temps réel. [Présent]

### Messages Automatiques (Auto-Messages)
- `GET /message-auto` : Liste tous les messages auto. [Créé] (Sécurisé Admin)
- `POST /message-auto` : Crée un message auto. [Créé] (Sécurisé Admin)
- `PATCH /message-auto/:id` : Modifie un message auto. [Créé] (Sécurisé Admin)
- `DELETE /message-auto/:id` : Supprime un message auto. [Créé] (Sécurisé Admin)

## Panel Admin

### Fonctionnalités
- Authentification HTTP : Connexion réservée aux ADMINs via HTTP. [Créé]
- Dashboard : Vue d'ensemble avec statistiques de base. [Créé]
- Gestion des Utilisateurs : CRUD complet via HTTP avec attribution de poste. [Créé]
- Gestion des Canaux Whapi : CRUD complet via HTTP. [Créé]
- Gestion des Postes : CRUD complet via HTTP. [Créé]
- Gestion des Messages Automatiques : Interface dédiée pour gérer le flux de réponse auto. [Créé]
- Monitoring : Visualisation des conversations et de l'historique des messages sans Sockets (HTTP). [Créé]

## Modifications Structurelles
- **Sécurité** : Implémentation de `RolesGuard` et décorateur `@Roles`.
- **Base de données** : Relation formelle entre `WhatsappChat` et `WhapiChannel`. Optimisation du format de ligne (`ROW_FORMAT=DYNAMIC`) et conversion des colonnes JSON complexes en `longtext` avec transformer pour éviter les erreurs `ER_TOO_BIG_ROWSIZE`.
- **Compatibilité** : Préservation du champ `last_msg_client_channel_id` pour le front tout en ajoutant `channel_id` pour le backend et l'admin.
- **Source de vérité** : Centralisation de tous les calculs de logique métier (compteurs de messages non lus, filtrage de recherche) sur le backend pour garantir la cohérence des données entre toutes les interfaces.

## États
- **Présent** : Déjà implémenté et fonctionnel avant intervention.
- **Créé** : Implémenté lors de cette tâche.
- **À venir** : Fonctionnalités futures possibles (ex: statistiques détaillées, logs système).
