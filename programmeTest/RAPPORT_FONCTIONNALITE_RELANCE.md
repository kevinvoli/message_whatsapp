# Rapport technique — Fonctionnalité Relance (Follow-up)

---

## 1. Vue d'ensemble

La fonctionnalité **Relance** permet aux commerciaux de planifier, suivre et gérer les relances clients. Elle couvre la création manuelle ou automatique de relances, leur suivi via WebSocket, et leur consultation depuis l'interface admin.

> **Constat important :** La fonctionnalité telle qu'implémentée est un **système de rappel interne au commercial**. Elle ne contacte pas le client automatiquement. Ce point est détaillé dans l'analyse des écarts (§14).

---

## 2. Entités et base de données

### Table `follow_up` (DB1)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID (PK) | Identifiant unique |
| `contact_id` | UUID (FK, nullable) | Contact lié |
| `conversation_id` | UUID (FK, nullable) | Conversation liée |
| `commercial_id` | UUID (FK) | Commercial responsable |
| `commercial_name` | varchar | Nom dénormalisé |
| `type` | enum | Type de relance (voir ci-dessous) |
| `status` | enum | Statut courant (voir ci-dessous) |
| `scheduled_at` | datetime | Date/heure planifiée |
| `completed_at` | datetime | Date de clôture |
| `reminded_at` | datetime | Dernière notification envoyée au commercial |
| `cancelled_at` | datetime | Date d'annulation |
| `cancelled_by` | varchar | Auteur de l'annulation |
| `cancel_reason` | text | Motif d'annulation |
| `result` | varchar | Résultat (`commande_passee`, `rappel_planifie`, `pas_interesse`, `injoignable`, `sans_suite`) |
| `notes` | text | Notes libres |
| `created_at` / `updated_at` / `deleted_at` | timestamp | Audit + soft delete |

**Indices :** `contact_id`, `commercial_id`, `scheduled_at`, `status`

### Types de relance (`FollowUpType`)

| Valeur | Signification |
|--------|--------------|
| `rappel` | Simple rappel |
| `relance_post_conversation` | Après une conversation |
| `relance_sans_commande` | Client sans commande |
| `relance_post_annulation` | Après annulation commande |
| `relance_fidelisation` | Fidélisation client |
| `relance_sans_reponse` | Client sans réponse |

### Statuts (`FollowUpStatus`)

| Valeur | Signification |
|--------|--------------|
| `planifiee` | Planifiée, non échue |
| `en_retard` | Échue et non traitée |
| `effectuee` | Clôturée avec résultat |
| `annulee` | Annulée |

---

## 3. Migrations

| Fichier | Contenu |
|---------|---------|
| `20260420_phase7_follow_up.ts` | Création table `follow_up` + 4 indices |
| `20260424_sprint2_followup_reminder.ts` | Ajout colonne `reminded_at` |
| `20260428_follow_up_cancel_audit.ts` | Ajout `cancelled_at`, `cancelled_by`, `cancel_reason` |

---

## 4. Backend — Services

### `FollowUpService`
**Fichier :** `src/follow-up/follow_up.service.ts`

| Méthode | Description |
|---------|-------------|
| `create(dto, commercialId, name)` | Crée une relance + émet `follow_up.created` |
| `findByCommercial(id, status, limit, offset)` | Liste paginée des relances du commercial |
| `findByContact(contactId)` | Toutes les relances d'un contact |
| `findDueToday(commercialId?)` | Relances PLANIFIEE + EN_RETARD ≤ fin du jour |
| `complete(id, commercialId, dto)` | Passe à EFFECTUEE + émet `follow_up.completed` |
| `cancel(id, commercialId, name, reason)` | Passe à ANNULEE + audit + émet `follow_up.cancelled` |
| `reschedule(id, commercialId, newDate)` | Replanifie (reset `reminded_at`, status → PLANIFIEE) |
| `upsertFromDossierOrReport(payload)` | Crée ou met à jour sans doublon (voir §6) |
| `countOverdueByCommercial(id)` | Nombre de relances EN_RETARD |
| `findAllAdmin(filters…)` | Vue admin filtrée (statut, commercial, plage de dates) |
| **`markOverdue()`** (cron) | Toutes les 30 min — passe PLANIFIEE → EN_RETARD si `scheduled_at < now` |

### `FollowUpReminderService`
**Fichier :** `src/follow-up/follow_up_reminder.service.ts`

**Cron :** toutes les 5 minutes.

Logique de détection des relances à notifier :

1. `status=PLANIFIEE` + `scheduled_at ≤ now` + `reminded_at IS NULL` → première notification
2. `status=EN_RETARD` + `reminded_at IS NULL` → première notification pour les retards
3. `status=EN_RETARD` + `reminded_at < il y a 30 min` → re-notification persistante

Après notification : `reminded_at = now` pour éviter les doublons immédiats.

---

## 5. Transitions de statut

```
PLANIFIEE
  ├─ scheduled_at atteint         → EN_RETARD  (cron 30 min)
  ├─ complete()                   → EFFECTUEE
  └─ cancel()                     → ANNULEE

EN_RETARD
  ├─ complete()                   → EFFECTUEE
  ├─ cancel()                     → ANNULEE
  └─ Rappel renvoyé toutes 30 min (reminded_at)

EFFECTUEE  (terminal)  — completed_at + result
ANNULEE    (terminal)  — cancelled_at + cancelled_by + cancel_reason
```

---

## 6. Logique anti-doublon (upsertFromDossierOrReport)

Déclenché lors de la soumission d'un rapport GICOP ou de la sauvegarde d'un dossier client lorsque `followUpAt` est renseigné.

**Algorithme :**
1. Cherche une relance existante : `commercial_id` + `status IN (PLANIFIEE, EN_RETARD)` + même `contact_id` et/ou `conversation_id` + `deleted_at IS NULL`
2. Si trouvée → met à jour `scheduled_at`, `notes`, `type` (idempotent)
3. Si non trouvée → crée une nouvelle relance + émet `follow_up.created`

**Intégrateurs :**
- `ReportSubmissionService` — ne bloque pas la soumission si l'upsert échoue
- `ClientDossierService` — idem

---

## 7. Flux complet — ce qui se passe quand une relance est déclenchée

```
[Cron 5 min] FollowUpReminderService.sendReminders()
  │
  ├─ Requête BDD : relances dues non notifiées
  ├─ Pour chaque relance → émet follow_up.reminder
  └─ Met à jour reminded_at = now
         │
         ▼
[Event] FollowUpPublisher (@OnEvent follow_up.reminder)
  │
  ├─ Récupère le poste du commercial
  └─ Socket.IO → room poste:${posteId}
         │
         ▼
[Frontend] socket-event-router.ts
  │
  ├─ Dispatche CustomEvent('followup:reminder')
  └─ Notification OS si onglet masqué
         │
         ├─ FollowUpReminderToast → toast 12s affiché au commercial
         └─ FollowUpPanel → refresh liste "À traiter aujourd'hui"
```

**Résultat final :** seul le commercial est notifié. Aucun message n'est envoyé au client. Le commercial doit ensuite ouvrir manuellement la conversation et contacter lui-même le client.

---

## 8. Temps réel — WebSocket

**Fichier :** `src/realtime/publishers/follow-up.publisher.ts`

**Payload émis sur `poste:${posteId}` :**
```json
{
  "type": "FOLLOW_UP_REMINDER",
  "payload": {
    "commercial_id": "...",
    "follow_up_id": "...",
    "scheduled_at": "...",
    "type": "relance_sans_commande"
  }
}
```

---

## 9. API REST

### Endpoints commerciaux (JWT)

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/follow-ups` | Créer une relance |
| `GET` | `/follow-ups/mine` | Mes relances (filtre par statut, paginé) |
| `GET` | `/follow-ups/due-today` | Relances à traiter aujourd'hui |
| `PATCH` | `/follow-ups/:id/complete` | Clôturer avec résultat |
| `PATCH` | `/follow-ups/:id/cancel` | Annuler |
| `PATCH` | `/follow-ups/:id/reschedule` | Replanifier |
| `GET` | `/follow-ups/by-contact/:contactId` | Relances d'un contact |

### Endpoints admin (AdminGuard)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/follow-ups/admin` | Toutes les relances (filtres : statut, commercial, dates) |
| `GET` | `/follow-ups/admin/due-today` | Toutes les relances du jour |

---

## 10. Frontend commercial

| Fichier | Rôle |
|---------|------|
| `front/src/components/chat/FollowUpPanel.tsx` | Panneau principal : liste, filtres, modales clôture/annulation/report |
| `front/src/components/chat/CreateFollowUpModal.tsx` | Formulaire de création (type, date, notes, contact) |
| `front/src/components/chat/FollowUpReminderToast.tsx` | Toast de notification (auto-dismiss 12s, max 5) |
| `front/src/hooks/useDueTodayFollowUps.ts` | React Query — relances du jour |
| `front/src/lib/followUpApi.ts` | Fonctions d'appel API |

Le bouton "Voir la conversation" dans `FollowUpPanel` ouvre la conversation liée si `conversation_id` est renseigné — mais n'envoie aucun message.

---

## 11. Interface admin

**Fichier :** `admin/src/app/ui/FollowUpsView.tsx`

- Vue globale de toutes les relances avec filtres (statut, commercial, dates)
- Bandeau d'alerte si relances EN_RETARD
- Pagination (20 par page), modales clôture et annulation

---

## 12. Module et dépendances

```
FollowUpModule
  ├─ Providers : FollowUpService, FollowUpReminderService
  ├─ Controllers : FollowUpController
  └─ Exports : FollowUpService

Consommateurs :
  ├─ GicopReportModule (ReportSubmissionService)
  ├─ ClientDossierModule (ClientDossierService)
  └─ RealtimeModule (FollowUpPublisher)
```

---

## 13. Tests

**Fichier :** `message_whatsapp/test/follow-up-flow.e2e-spec.ts` (REL-028)

1. Création → présent dans `GET /mine`
2. Apparaît dans `GET /due-today` si date = aujourd'hui
3. Clôture → `status=effectuee`, résultat capturé
4. Annulation avec motif → audit `cancelled_at` + `cancel_reason`
5. Annulation sans motif (rétrocompatibilité)

---

## 14. Analyse des écarts par rapport aux CRM courants

### Ce que font les CRM leaders (HubSpot, Pipedrive, Salesforce)

Dans les CRM populaires, une "relance" déclenche **deux actions simultanées** :

1. **Une notification au commercial** — rappel interne pour agir
2. **Un contact direct vers le client** — message automatique envoyé via le canal configuré (email, SMS, WhatsApp)

Le commercial peut aussi déclencher un **envoi en un clic** depuis la notification, avec un message pré-rempli selon le type de relance.

---

### Ce que fait le système actuel

| Fonctionnalité | CRM leader | Système actuel |
|----------------|-----------|----------------|
| Notification interne au commercial | Oui | **Oui** (toast + Socket.IO) |
| Envoi automatique d'un message WhatsApp au client | Oui | **Non — absent** |
| Message pré-rempli par type de relance (template) | Oui | **Non — absent** |
| Ouverture automatique de la conversation à l'échéance | Oui | **Non** (bouton manuel "Voir la conversation") |
| Séquences multi-étapes (J+1, J+3, J+7…) | Oui | **Non — absent** |
| Suivi de la réponse client après relance | Oui | **Non — absent** |
| Historique des tentatives de contact | Oui | **Partiel** (`reminded_at` seul, pas de log détaillé) |

---

### Problème central

Quand une relance arrive à échéance, **le client n'est jamais contacté automatiquement**. Le système se contente d'avertir le commercial. Si le commercial ignore le toast ou n'ouvre pas le panel, la relance passe en `EN_RETARD` et continue d'envoyer des rappels toutes les 30 minutes au commercial — sans jamais atteindre le client.

Concrètement, pour un type comme `relance_sans_reponse` (client qui n'a pas répondu), le système :
- notifie le commercial ✅
- n'envoie aucun message WhatsApp au client pour relancer la conversation ❌

---

### Améliorations nécessaires pour être conforme aux standards CRM

#### Priorité 1 — Envoi automatique du message WhatsApp au client

À l'échéance d'une relance, envoyer automatiquement un message WhatsApp au client via le canal de la conversation liée, en utilisant un template par type de relance.

**Exemple de flux cible :**
```
FollowUpReminderService détecte une relance due
  → Récupère la conversation liée (conversation_id)
  → Récupère le template WhatsApp correspondant au type de relance
  → Envoie le message via MessageService (canal whapi/meta)
  → Met à jour reminded_at + log d'envoi
```

#### Priorité 2 — Templates de message par type de relance

Associer un message template à chaque type :

| Type | Exemple de message template |
|------|-----------------------------|
| `relance_sans_reponse` | "Bonjour {prénom}, nous n'avons pas eu de vos nouvelles. Pouvons-nous vous aider ?" |
| `relance_post_annulation` | "Bonjour {prénom}, nous avons vu que votre commande a été annulée. Souhaitez-vous qu'on en discute ?" |
| `relance_sans_commande` | "Bonjour {prénom}, avez-vous eu l'occasion de réfléchir à votre projet ?" |
| `relance_fidelisation` | "Bonjour {prénom}, cela fait un moment. Comment puis-je vous aider aujourd'hui ?" |

#### Priorité 3 — Ouverture automatique de la conversation

Quand le commercial clique sur le toast de rappel, la conversation concernée devrait s'ouvrir directement avec le message pré-rempli, pour permettre un envoi en un clic.

#### Priorité 4 — Suivi de la réponse après relance

Détecter si le client a répondu après l'envoi du message de relance et clôturer automatiquement la relance si c'est le cas (`status → effectuee`, `result = 'reponse_client'`).

---

### Résumé

La fonctionnalité actuelle est un **agenda de rappels commerciaux**, pas encore une fonctionnalité de relance client au sens CRM. Les données, statuts et UI sont bien en place — il manque uniquement le **déclenchement de l'action côté client** (envoi du message WhatsApp) et les **templates associés**.

---

## 15. Tableau récapitulatif

| Aspect | Détail |
|--------|--------|
| Table | `follow_up` — UUID PK, soft delete, 4 indices |
| Types | 6 valeurs (`rappel`, `relance_*`) |
| Statuts | 4 valeurs (`planifiee` → `en_retard` → `effectuee` / `annulee`) |
| Crons | `markOverdue` (30 min), `sendReminders` (5 min) |
| Événements | `follow_up.created/.completed/.cancelled/.reminder` |
| WebSocket | Room `poste:${posteId}` |
| Endpoints | 7 commerciaux + 2 admin |
| Intégration auto | `ReportSubmissionService`, `ClientDossierService` |
| Anti-doublon | `upsertFromDossierOrReport` (upsert idempotent) |
| Frontend | `FollowUpPanel`, `CreateFollowUpModal`, `FollowUpReminderToast` |
| Admin | `FollowUpsView` avec filtres globaux |
| **Envoi message client** | **Non implémenté** |
| **Templates par type** | **Non implémentés** |
