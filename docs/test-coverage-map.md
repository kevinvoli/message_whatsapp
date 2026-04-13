# Cartographie de la couverture de tests

Date : 2026-04-13  
Périmètre : `message_whatsapp/src` — fichiers `.spec.ts`  
Produit par : TICKET-00-A (Sprint 0)

---

## Légende

| Niveau | Signification |
|--------|---------------|
| ✅ Couvert | Tests significatifs sur les méthodes critiques |
| ⚠️ Partiel | Quelques cas testés, lacunes importantes |
| 🔴 Absent | Aucun spec ou uniquement `should be defined` |

| Risque refactoring | Signification |
|--------------------|---------------|
| 🔴 Rouge | Tout déplacement de code peut régresser silencieusement |
| 🟠 Orange | Certaines méthodes protégées, d'autres non |
| 🟢 Vert | Extraction possible avec filet de sécurité |

---

## Services critiques (épics P1)

### Dispatcher

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `dispatcher.service.spec.ts` | 7 | `assignConversation` (canal dédié : CH-01→CH-05), `read_only` guard | `reinjectConversation`, `redispatchWaiting`, `resetStuckActiveToWaiting`, SLA runner complet | ⚠️ Partiel | 🟠 Orange |
| `dispatcher.controller.spec.ts` | *(squelette)* | — | tout | 🔴 Absent | 🔴 Rouge |
| `dispatcher/services/queue.service.spec.ts` | 3 | `removeFromQueue`, `moveToEnd`, `syncQueueWithActivePostes` (locks uniquement) | logique interne des méthodes | ⚠️ Partiel | 🟠 Orange |

> **Impact TICKET-03-A (DispatchPolicyService)** : l'algorithme de charge minimum et la résolution poste dédié sont couverts partiellement via CH-01→CH-05. L'extraction doit **conserver et adapter** ces 5 cas dans le nouveau service.  
> **Impact TICKET-03-C (use cases)** : `reinjectConversation` et SLA runner n'ont aucun test → écrire les tests minimaux dans le ticket avant d'extraire.

---

### Gateway temps réel

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `whatsapp_message.gateway.spec.ts` | 4 | `contact:event` (3 types), `chat:event` typing | Auth socket, room management, `emit*` (tous les publishers), chargement initial DB | ⚠️ Partiel | 🔴 Rouge |
| `whatsapp_chat.gateway.spec.ts` | *(squelette)* | — | tout | 🔴 Absent | 🔴 Rouge |

> **Impact TICKET-02-D (publishers)** : les méthodes `emit*` ne sont pas testées. Écrire des tests unitaires sur chaque publisher avant extraction (entrée → socket.to().emit() vérifié par mock).  
> **Impact TICKET-02-C (query services)** : aucune requête DB du gateway n'est couverte → risque rouge sur l'extraction.

---

### Ingress omnicanal

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `webhooks/adapters/__tests__/whapi.adapter.spec.ts` | 3 | `normalize()` text, media, statuses | cas limites (médias manquants, payloads malformés) | ⚠️ Partiel | 🟠 Orange |
| `webhooks/adapters/__tests__/meta.adapter.spec.ts` | 3 | `normalize()` text, interactive, statuses | référral, réaction, system messages | ⚠️ Partiel | 🟠 Orange |
| `webhooks/adapters/__tests__/provider-adapter.registry.spec.ts` | *(à vérifier)* | registry | — | ⚠️ Partiel | 🟠 Orange |
| `webhooks/idempotency/__tests__/webhook-idempotency.service.spec.ts` | 4 | déduplication whapi + meta, conflict detection, fallback hash | purge, TTL expiry | ✅ Couvert | 🟢 Vert |
| **`InboundMessageService`** | **0** | **—** | **tout le pipeline** | **🔴 Absent** | **🔴 Rouge** |

> **Impact TICKET-04-A (pipeline ingress)** : `InboundMessageService` n'a aucun spec. C'est la zone la plus risquée du backlog. Obligation d'écrire des tests d'intégration **avant** de déplacer quoi que ce soit dans ce service.

---

### ChannelService

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `channel.service.spec.ts` | 7 | `assignPoste` (3 cas), `getDedicatedPosteId` (3 cas), `should be defined` | Création canal, update, refresh token Whapi, PAT Messenger, webhook Telegram, logique provider | ⚠️ Partiel | 🟠 Orange |

> **Impact TICKET-05-B (stratégies provider)** : la logique spécifique à chaque provider n'est pas couverte. Écrire des tests par provider strategy avant d'extraire.

---

### AutoMessageMasterJob

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `auto-message-master.job.spec.ts` | 31 | `matchesKeyword()` (7 cas), `runTriggerA` (3), `runTriggerC` (4), `runTriggerD` (2), `runTriggerE` (2), `runTriggerF` (4) | `runTriggerB`, `runTriggerG`, `runTriggerH`, `runTriggerI`, méthode `run()` principale, `orchestratorActive` flag | ⚠️ Partiel | 🟠 Orange |

> **Impact TICKET-07-A (triggers séparés)** : bonne couverture sur A/C/D/E/F. Les triggers B/G/H/I n'ont aucun test → les écrire avant extraction ou dans le même ticket.  
> **Conditionnel à TICKET-00-B** : si FlowBot remplace auto-message-master, ce spec sera supprimé — ne pas investir dans la couverture de B/G/H/I si la décision est prise.

---

### MessageAutoService + BusinessHoursService

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `message-auto.service.spec.ts` | 12 | `getTemplateForTrigger()` (11 cas complets + tirage aléatoire) | `sendAutoMessage`, `getAutoMessageByPosition` | ⚠️ Partiel | 🟠 Orange |
| `business-hours.service.spec.ts` | 10 | `isCurrentlyOpen()` (9 cas), `updateDay()` (1 cas) | cas multi-plage horaire | ✅ Couvert | 🟢 Vert |

---

### AutoMessageOrchestrator

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| **Aucun spec** | **0** | **—** | **handleClientMessage, executeAutoMessage, locks, safety timeout** | **🔴 Absent** | **🔴 Rouge** |

> Remplacé par FlowBot si TICKET-00-B décide dans ce sens — investissement à ne pas faire avant la décision.

---

### WhatsappChatService

| Fichier spec | Cas testés | Méthodes couvertes | Lacunes | Niveau | Risque |
|---|---|---|---|---|---|
| `whatsapp_chat.service.spec.ts` | 1 | `should be defined` uniquement | tout (update, findBychat_id, resetStaleAutoMessageLocks, etc.) | 🔴 Absent | 🔴 Rouge |

> Utilisé massivement par dispatcher, gateway et orchestrator. L'absence de tests sur ce service est un risque transversal — tout refactoring qui touche à `chatService.update()` est à haut risque.

---

## Services secondaires (CRUD)

Ces services ont des specs, généralement squelettes (`should be defined` uniquement). Risque faible pour les epics P1 car ils ne sont pas déplacés dans les premiers sprints.

| Service | Spec | Niveau |
|---------|------|--------|
| `whapi.service.ts` | `whapi.service.spec.ts` | ⚠️ Partiel |
| `whapi.controller.ts` | `whapi.controller.spec.ts` | 🔴 Absent |
| `contact.service.ts` | `contact.service.spec.ts` | 🔴 Absent |
| `metriques.service.ts` | `metriques.service.spec.ts` | ⚠️ Partiel |
| `whatsapp_message.service.ts` | `whatsapp_message.service.spec.ts` | 🔴 Absent |
| `whatsapp_button`, `whatsapp_chat_label`, `whatsapp_contacts`, `whatsapp_customer`, `whatsapp_error`, `whatsapp_last_message`, `whatsapp_media`, `whatsapp_message_content`, `whatsapp_poste` | specs présents | 🔴 Absent (squelettes) |
| `whapi-crypto`, `whapi-payload-validation`, `webhook-rate-limit`, `webhook-idempotency-purge` | specs présents | ✅ / ⚠️ |

---

## Synthèse — Zones rouges à traiter avant refactoring

| Zone | Service | Action requise avant extraction |
|------|---------|--------------------------------|
| 🔴 CRITIQUE | `InboundMessageService` | Écrire tests d'intégration pipeline entrant complet (TICKET-04-A prerequisite) |
| 🔴 CRITIQUE | `WhatsappMessageGateway` emit* | Écrire tests unitaires des méthodes `emit*` avant TICKET-02-D |
| 🔴 CRITIQUE | `WhatsappChatService.update()` | Écrire 3–5 cas sur les transitions d'état avant TICKET-06-A |
| 🔴 CRITIQUE | `AutoMessageOrchestrator` | Ne rien toucher jusqu'à décision FlowBot (TICKET-00-B) |
| 🟠 ATTENTION | `DispatcherService` SLA/réinjection | Écrire tests `reinjectConversation` + SLA runner avant TICKET-03-C |
| 🟠 ATTENTION | `ChannelService` logique provider | Écrire 1 test par provider avant TICKET-05-B |
| 🟠 ATTENTION | `AutoMessageMasterJob` B/G/H/I | Décision FlowBot d'abord (TICKET-00-B) |

---

## Décision en attente

**TICKET-00-B** — décision FlowBot : conditionne le travail sur `AutoMessageOrchestrator`, TICKET-07-A, et l'investissement en tests sur les triggers B/G/H/I.
