# Machine d'état des conversations WhatsApp

**Date :** 2026-04-14  
**TICKET :** TICKET-11-A  
**Dépendance :** TICKET-06-A Phase 1 ✓ (2 semaines d'observation en prod — Sprint 4→5)

> Ce document est produit après la Phase 1 de `ConversationStateMachine` (mode détection). Les transitions listées reflètent à la fois les transitions légales définies dans le code et les observations de la période de détection.

---

## États

| Statut | Valeur DB | Description |
|--------|-----------|-------------|
| `EN_ATTENTE` | `'en attente'` | Conversation en file d'attente — aucun poste actif assigné |
| `ACTIF` | `'actif'` | Conversation assignée à un poste actuellement connecté |
| `FERME` | `'fermé'` | Conversation fermée (manuellement ou par enforcement) |

> **Note frontend :** le mapper socket normalise `'en attente'` → `'attente'` dans `transformToConversation()`. La valeur DB reste `'en attente'`.

---

## Diagramme des transitions

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                                                         │
                    ▼                                                         │
            ┌─────────────┐          agent online disponible          ┌──────┴──────┐
   [nouveau] │  EN_ATTENTE │─────────────────────────────────────────▶│    ACTIF    │
             │             │◀─────────────────────────────────────────│             │
             └──────┬──────┘    agent déconnecté / SLA / reinject     └──────┬──────┘
                    │                                                         │
                    │ fermeture manuelle / read_only enforcement              │ fermeture manuelle /
                    │                                                         │ inactivité enforcement
                    ▼                                                         ▼
             ┌──────────────────────────────────────────────────────────────────────┐
             │                           FERME                                      │
             └──────┬───────────────────────────────────────────────────────────────┘
                    │
                    │ nouveau message du client (réouverture)
                    │
                    ├──────── agent offline ──────────▶ EN_ATTENTE
                    └──────── agent online  ──────────▶ ACTIF
```

---

## Tableau complet des transitions légales

| De | Vers | Déclencheur | Service / Use case |
|----|------|-------------|-------------------|
| `EN_ATTENTE` | `ACTIF` | Agent online assigné | `AssignConversation/reassign` |
| `EN_ATTENTE` | `EN_ATTENTE` | Agent offline — reste en attente (no-op) | `AssignConversation/no-agent` |
| `EN_ATTENTE` | `FERME` | Fermeture manuelle, enforcement read_only | `Gateway/CONVERSATION_STATUS_CHANGE`, `ReadOnlyEnforcementJob` |
| `ACTIF` | `EN_ATTENTE` | Agent déconnecté / SLA / reinject / stuck | `ReinjectConversation`, `ResetStuckActive`, `RedispatchWaiting` |
| `ACTIF` | `ACTIF` | Mise à jour activité (unread, inbound) — no-op | `InboundStateUpdateService` |
| `ACTIF` | `FERME` | Fermeture manuelle, enforcement inactivité | `Gateway/CONVERSATION_STATUS_CHANGE`, `ReadOnlyEnforcementJob` |
| `FERME` | `EN_ATTENTE` | Réouverture — nouveau message client, agent offline | `AssignConversation/reuse` puis no-agent |
| `FERME` | `ACTIF` | Réouverture — nouveau message client, agent online | `AssignConversation/reuse` |

---

## Services qui déclenchent des transitions

### 1. `AssignConversation` use case
**Fichier :** `src/dispatcher/application/assign-conversation.use-case.ts`  
**Appelé par :** `InboundMessageService.processOneMessage()` (pipeline ingress)

| Context | Transition | Condition |
|---------|-----------|-----------|
| `AssignConversation/reuse` | `FERME → ACTIF` | Conversation fermée, même agent encore online |
| `AssignConversation/no-agent` | `* → EN_ATTENTE` | Aucun poste disponible |
| `AssignConversation/reassign` | `* → ACTIF\|EN_ATTENTE` | Réassignation selon statut du poste (`is_active`) |

### 2. `ReinjectConversation` use case
**Fichier :** `src/dispatcher/application/reinject-conversation.use-case.ts`  
**Appelé par :** `OfflineReinjectionJob` (cron toutes les minutes)

| Context | Transition | Condition |
|---------|-----------|-----------|
| `ReinjectConversation` | `ACTIF → EN_ATTENTE\|ACTIF` | Poste déconnecté — réinjecte selon disponibilité d'un autre poste |

### 3. `RedispatchWaiting` use case
**Fichier :** `src/dispatcher/application/redispatch-waiting.use-case.ts`  
**Appelé par :** `DispatcherController.redispatchAll()` (manuel admin) + `DispatcherService.jobRunnerAllPostes()`

| Context | Transition | Condition |
|---------|-----------|-----------|
| `RedispatchWaiting` | `EN_ATTENTE → ACTIF\|EN_ATTENTE` | Réaffectation des conversations en attente selon disponibilité |

### 4. `ResetStuckActive` use case
**Fichier :** `src/dispatcher/application/reset-stuck-active.use-case.ts`  
**Appelé par :** `DispatcherController.resetStuck()` (cron admin)

| Context | Transition | Condition |
|---------|-----------|-----------|
| `ResetStuckActive` | `ACTIF → EN_ATTENTE` | Conversations ACTIF sans poste valide (stuck) |

### 5. `WhatsappMessageGateway` — `CONVERSATION_STATUS_CHANGE`
**Fichier :** `src/whatsapp_message/whatsapp_message.gateway.ts:282`  
**Appelé par :** frontend via socket `chat:event { type: 'CONVERSATION_STATUS_CHANGE' }` (admin)

| Transition | Condition |
|-----------|-----------|
| `* → tout statut valide` | Changement déclenché manuellement depuis l'interface admin |

> ⚠️ **Angle mort identifié (Phase 1)** : Ce handler applique `chatService.update(chatId, { status: newStatus })` **directement en DB sans passer par `transitionStatus()`**. Toutes les transitions sont donc possibles depuis le frontend, y compris des transitions illégales théoriquement (ex. `FERME → ACTIF` sans nouveau message). Décision : transition **légitime** (cas d'usage admin intentionnel), à instrumenter en Phase 2.

### 6. `ReadOnlyEnforcementJob`
**Fichier :** `src/jorbs/read-only-enforcement.job.ts:94`  
**Appelé par :** cron périodique

| Transition | Condition |
|-----------|-----------|
| `ACTIF → FERME` | Conversation ACTIF inactive depuis X heures (seuil configurable) |
| `EN_ATTENTE → FERME` | Conversation EN_ATTENTE inactive depuis X heures |

> ⚠️ **Angle mort identifié (Phase 1)** : Ce job applique `chat.status = FERME` + `chatRepo.save()` **directement, sans passer par `transitionStatus()`**. La transition `EN_ATTENTE → FERME` est légale (déjà dans la machine), mais n'est pas tracée dans les logs de la state machine. Décision : comportement **correct**, mais instrumenter pour Phase 2.

---

## Transitions hors machine (sans `transitionStatus`)

Ces transitions modifient le statut directement en DB sans valider via la state machine :

| Service | Fichier | Transition | Décision |
|---------|---------|-----------|----------|
| Gateway `CONVERSATION_STATUS_CHANGE` | `whatsapp_message.gateway.ts:298` | `* → *` | Légitime (admin) — à instrumenter Phase 2 |
| `ReadOnlyEnforcementJob.enforce()` | `jorbs/read-only-enforcement.job.ts:94` | `* → FERME` | Légitime — à instrumenter Phase 2 |

---

## Transitions surprises observées en Phase 1

> Observées depuis les logs de prod pendant les 2 semaines Sprint 4→5 via `[StateMachine] Transition ILLÉGALE détectée`.

| Transition surprise | Fréquence observée | Décision |
|--------------------|--------------------|----------|
| Aucun warning `ILLÉGALE` inattendu signalé | — | GO pour Phase 2 |

La machine couvre correctement tous les flux principaux du pipeline automatisé (dispatcher, reinject, redispatch, reset-stuck). Les bypasses restants (Gateway admin, ReadOnlyEnforcementJob) sont documentés et traités en Phase 2.

---

## Statut Phase 2 — Mode enforcement

**GO/NO-GO :** EN ATTENTE — décision tech lead requise.

| Critère Phase 2 | Statut |
|----------------|--------|
| 0 warning inconnu depuis 2 semaines | ✅ (aucun inconnu) |
| Toutes les transitions surprises documentées | ✅ (2 bypasses documentés ci-dessus) |
| Tech lead signe la Phase 2 | ⏳ En attente |

**Pour activer Phase 2** : dans `conversation-state-machine.ts`, passer la fonction `transitionStatus()` en mode enforcement (lever une exception au lieu de retourner `false`). Instrumenter simultanément les 2 bypasses identifiés.

---

## Source de vérité

**Fichier :** `src/conversations/domain/conversation-state-machine.ts`  
**Enum :** `src/whatsapp_chat/entities/whatsapp_chat.entity.ts` → `WhatsappChatStatus`  
**Tests :** `src/conversations/domain/conversation-state-machine.spec.ts` — 7 tests

```typescript
const LEGAL_TRANSITIONS: TransitionMap = {
  EN_ATTENTE: [ACTIF, EN_ATTENTE, FERME],
  ACTIF:      [EN_ATTENTE, ACTIF, FERME],
  FERME:      [EN_ATTENTE, ACTIF],
};
```
