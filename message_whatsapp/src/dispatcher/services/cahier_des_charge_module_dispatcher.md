# 📦 Cahier des Charges – Module Dispatcher (Cœur du Système)

## 1. Objectif général

Le **Module Dispatcher** est le cœur métier du système de gestion des conversations WhatsApp.

Son rôle est de :

* distribuer automatiquement les conversations entrantes vers les commerciaux,
* gérer une file d’attente équitable (round-robin),
* stocker et redistribuer les messages lorsque aucun commercial n’est disponible,
* gérer les délais de réponse (24h),
* rester **scalable**, **testable** et **extensible**.

⚠️ Le dispatcher **ne doit jamais mélanger** décision métier, persistance et orchestration dans un même service.

---

## 2. Principes architecturaux obligatoires

1. **Séparation stricte des responsabilités**
2. **Aucune logique métier implicite**
3. **Chaque service a un rôle unique**
4. **Le Dispatcher orchestre, il ne décide pas**
5. **Toute décision métier doit être explicite et typée**

---

## 3. Structure de dossiers OBLIGATOIRE

```
dispatcher
│
├── dispatcher.module.ts
│
├── orchestrator
│   └── dispatcher.orchestrator.ts
│
├── controllers
│   └── dispatcher.controller.ts
│
├── services
│   ├── queue
│   │   └── queue.service.ts
│   │
│   ├── assignment
│   │   └── assignment.service.ts
│   │
│   ├── pending
│   │   └── pending-message.service.ts
│   │
│   └── scheduler
│       └── dispatcher.scheduler.ts
│
├── entities
│   ├── pending-message.entity.ts
│   └── queue-position.entity.ts
│
├── types
│   └── assignment-decision.type.ts
│
└── tests
    └── assignment.service.spec.ts
```

---

## 4. Rôle précis de chaque dossier et fichier

### 4.1 `dispatcher.module.ts`

* Déclare et exporte tous les services du module
* Ne contient **aucune logique métier**
* Gère uniquement l’injection de dépendances

---

### 4.2 `orchestrator/dispatcher.orchestrator.ts`

👉 **Chef d’orchestre du dispatcher**

Responsabilités :

* Recevoir les événements du système :

  * message entrant (webhook / websocket)
  * connexion d’un commercial
  * déconnexion d’un commercial
* Appeler les services nécessaires
* Appliquer la décision retournée par `AssignmentService`
* Sauvegarder les changements en base
* Émettre les événements WebSocket

❌ Interdictions :

* Ne contient aucune règle métier
* Ne décide jamais seul

---

### 4.3 `services/queue/queue.service.ts`

👉 **Gestion de la file d’attente (round-robin)**

Responsabilités :

* Gérer l’ordre des commerciaux
* Garantir l’équité de distribution

Méthodes obligatoires :

* `addToQueue(userId)`
* `removeFromQueue(userId)`
* `getNextInQueue()`
* `getQueuePositions()`
* `moveToEnd(userId)`

❌ Interdictions :

* Ne connaît pas les conversations
* Ne connaît pas les messages
* Ne connaît pas les WebSockets

---

### 4.4 `services/assignment/assignment.service.ts`

👉 **Cerveau métier (décision pure)**

Responsabilités :

* Analyser la situation d’une conversation
* Déterminer l’action à effectuer

Entrées :

* conversation existante ou non
* état de connexion du commercial
* prochain commercial disponible

Sortie :

* Une décision typée (`AssignmentDecision`)

⚠️ Ce service :

* N’écrit jamais en base
* N’émet aucun événement
* Est entièrement testable sans NestJS

---

### 4.5 `types/assignment-decision.type.ts`

Type OBLIGATOIRE retourné par `AssignmentService`

```ts
export type AssignmentDecision =
  | { type: 'KEEP_CURRENT_AGENT'; agentId: string }
  | { type: 'ASSIGN_NEW_AGENT'; agentId: string }
  | { type: 'PENDING' };
```

---

### 4.6 `services/pending/pending-message.service.ts`

👉 **Gestion des messages en attente**

Responsabilités :

* Stocker les messages quand aucun commercial n’est disponible
* Fournir les messages à redistribuer

Méthodes obligatoires :

* `addPendingMessage(...)`
* `getPendingMessages()`
* `removePendingMessage(id)`

❌ Ne distribue jamais directement

---

### 4.7 `services/scheduler/dispatcher.scheduler.ts`

👉 **Planification (CRON uniquement)**

Responsabilités :

* Vérifier les délais de réponse (24h)
* Déclencher la distribution automatique programmée

Méthodes obligatoires :

* `checkResponseTimeout()` (toutes les 30 minutes)
* `scheduledDistribution()` (heure configurable)

❌ Ne décide jamais d’une assignation

---

### 4.8 `controllers/dispatcher.controller.ts`

👉 Interface ADMIN / DEBUG

Fonctions autorisées :

* Forcer la distribution manuelle
* Lire l’état de la file

❌ Pas de logique métier

---

## 5. Ce que le Dispatcher DOIT savoir faire

1. Distribuer une conversation entrante vers un commercial disponible
2. Réassigner une conversation si le commercial est déconnecté
3. Mettre un message en attente si aucun commercial n’est disponible
4. Redistribuer les messages en attente quand un commercial se connecte
5. Fermer automatiquement les conversations inactives après 24h
6. Fonctionner correctement avec plusieurs instances (scalable)

---

## 6. Flux fonctionnels obligatoires

### 6.1 Message entrant

1. Identifier ou créer la conversation
2. Appeler `AssignmentService`
3. Appliquer la décision

---

### 6.2 Connexion commercial

1. Ajouter à la queue
2. Émettre mise à jour WebSocket
3. Déclencher une redistribution ciblée

---

### 6.3 Déconnexion commercial

1. Retirer de la queue
2. Marquer les conversations comme en attente

---

### 6.4 Distribution programmée

* Appel exclusif à `distributePendingMessages`

---

## 7. Règles de qualité OBLIGATOIRES

* Aucun service ne doit dépasser une responsabilité
* Toute décision doit être explicite
* Aucun cron ne doit appeler directement une assignation
* Le système doit être prêt pour Redis / BullMQ

---

## 8. Objectif final

Le module Dispatcher doit pouvoir :

* gérer des milliers de conversations simultanées,
* être testé indépendamment,
* être remplacé ou étendu sans refactor massif.

📌 Toute implémentation ne respectant pas ces règles est considérée comme non conforme.
