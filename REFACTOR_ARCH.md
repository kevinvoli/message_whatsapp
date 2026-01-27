# Architecture de Référence Après Refactoring

Ce document décrit la nouvelle architecture mise en place suite au refactoring majeur du projet. L'objectif était de passer d'une architecture monolithique et fragile à une architecture en couches, robuste, scalable et maintenable.

## 1. Architecture Backend (NestJS)

L'architecture backend est maintenant strictement organisée par responsabilités, en suivant les meilleures pratiques de NestJS.

### Principes Clés :

- **Séparation des Couches :** La logique est clairement séparée entre les `Controllers`, les `Services` et les `Gateways`.
- **Gateway "Stupide" :** La `WhatsappMessageGateway` ne sert plus que de couche de communication. Elle gère les connexions, l'authentification des sockets et le routage des messages vers des "rooms". Elle ne contient **aucune logique métier**.
- **Logique dans les Services :** Toute la logique métier (récupération de données, création de messages, etc.) est encapsulée dans les services (`WhatsappChatService`, `WhatsappMessageService`). Ce sont eux qui orchestrent les opérations.
- **Communication par Rooms :** Fini les broadcasts globaux (`server.emit()`). La communication est sécurisée :
  - Chaque commercial authentifié rejoint une room personnelle (`commercial:{id}`).
  - Les messages destinés à une conversation sont émis dans la room de cette conversation (`conversation:{chatId}`).
- **Convention d'Événements :** Tous les événements WebSocket suivent une convention de nommage claire : `domaine:action` (ex: `conversation:join`, `message:send`).

### Flux de Données (Exemple : Nouveau Message Reçu)

1.  Un webhook de Whapi est reçu par le `WhapiController`.
2.  Le contrôleur délègue le traitement au `WhapiService`.
3.  Le `WhapiService` sauvegarde le message en base de données via le `WhatsappMessageService`.
4.  Le `WhatsappMessageService`, après avoir sauvegardé le message, appelle une méthode de la `WhatsappMessageGateway`.
5.  La `WhatsappMessageGateway` émet l'événement `message:receive` **uniquement** dans la room du commercial concerné.

## 2. Architecture Frontend (React/Next.js)

L'architecture frontend a été entièrement repensée pour être plus prédictible et performante, en s'articulant autour d'un store centralisé.

### Principes Clés :

- **Démantèlement du "God Hook" :** L'ancien `useWebSocket` qui gérait tout (état, connexion, actions) a été supprimé.
- **Source de Vérité Unique :** L'état de l'application (conversations, messages, etc.) est maintenant centralisé dans un store **Zustand** (`useChatStore`). C'est la seule source de vérité.
- **Couche de Connexion Isolée :** Un `SocketProvider` est responsable **uniquement** de la gestion de la connexion WebSocket. Il ne connaît rien de l'état de l'application.
- **Flux de Données Unidirectionnel :**
  1.  Un composant (`<WebSocketEvents />`) écoute les événements du socket.
  2.  Lorsqu'un événement est reçu, il appelle une **action** du store Zustand.
  3.  L'action met à jour l'**état** dans le store.
  4.  Les composants React qui utilisent cet état (via le hook `useConversations`) se mettent à jour automatiquement.
- **Hooks "Intelligents", Composants "Stupides" :**
  - Le hook `useConversations` sert de façade. Il lit les données depuis le store et expose des actions simples aux composants (ex: `selectConversation`, `sendMessage`).
  - Les composants de l'interface (ex: `page.tsx`) sont maintenant très simples. Ils ne font qu'afficher les données du hook et appeler ses fonctions.

Ce découplage strict rend l'application plus facile à déboguer, à tester et à faire évoluer.
