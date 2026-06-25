# Rapport — Trigger K : Relance Clients Dormants

**Date** : 2026-06-25  
**Contexte** : Ajout d'un onglet K au module "Message automatique" pour relancer ~200k clients dormants sans prolonger la fenêtre de discussion WhatsApp.

---

## I. Architecture existante (Messages automatiques A–J)

### Structure générale

Le module repose sur deux modes :

- **Mode événementiel** : `AutoMessageOrchestrator` — déclenché sur réception d'un message client
- **Mode batch-cron** : `AutoMessageMasterJob` — s'exécute toutes les 5 minutes, parcourt les chats selon des critères SQL

Le Trigger K s'insère dans le **mode batch-cron** (comme A, C, D, E, F, G, H, I, J).

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/message-auto/entities/message-auto.entity.ts` | Entité + enum `AutoMessageTriggerType` |
| `src/message-auto/message-auto.service.ts` | CRUD templates, envoi, tracking |
| `src/message-auto/auto-message-orchestrator.service.ts` | Mode événementiel (ne concerne PAS K) |
| `src/jorbs/auto-message-master.job.ts` | Batch-cron, fonctions `runTriggerA()` … `runTriggerJ()` |
| `src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | Entité chat — champs de tracking |
| `admin/src/app/ui/MessageAutoView.tsx` | UI admin onglets A–J |
| `admin/src/app/lib/definitions.ts` | Types TypeScript admin |

### Enum actuel (triggers A–J)

```typescript
export enum AutoMessageTriggerType {
  NO_RESPONSE      = 'no_response',     // A
  SEQUENCE         = 'sequence',        // B
  OUT_OF_HOURS     = 'out_of_hours',    // C
  REOPENED         = 'reopened',        // D
  QUEUE_WAIT       = 'queue_wait',      // E
  KEYWORD          = 'keyword',         // F
  CLIENT_TYPE      = 'client_type',     // G
  INACTIVITY       = 'inactivity',      // H
  ON_ASSIGN        = 'on_assign',       // I
  WINDOW_REMINDER  = 'window_reminder', // J
  // DORMANT_CUSTOMER = 'dormant_customer', ← K — À AJOUTER
}
```

### Pattern générique réutilisé par tous les triggers

```typescript
private async runTriggerX(config: CronConfig): Promise<void> {
  if (!config?.enabled) return;

  const chats = await this.chatRepo
    .createQueryBuilder('c')
    .leftJoinAndSelect('c.channel', 'channel')
    .where(/* critères métier spécifiques */)
    .limit(100)
    .getMany();

  for (const chat of chats) {
    await this.safeSend(chat, async () => {
      await this.messageAutoService.sendAutoMessageForTrigger(
        chat.chat_id,
        AutoMessageTriggerType.TRIGGER_X,
        step,
      );
    });
  }
}
```

Le Trigger K suivra **exactement ce pattern** — seule la clause `WHERE` change.

### Champs de tracking existants sur `whatsapp_chat`

Chaque trigger a ses propres colonnes de tracking. Exemples :

```
no_response_auto_step          INT
last_no_response_auto_sent_at  TIMESTAMP NULL
inactivity_auto_step           INT
last_inactivity_auto_sent_at   TIMESTAMP NULL
last_window_reminder_sent_at   TIMESTAMP NULL
```

→ Le Trigger K nécessite les mêmes colonnes : `dormant_auto_step` + `last_dormant_auto_sent_at`.

---

## II. Définition métier : Client dormant

Un chat est **dormant** si toutes ces conditions sont réunies :

| Condition | Champ SQL | Valeur |
|---|---|---|
| L'agent n'a JAMAIS répondu | `last_poste_message_at` | `IS NULL` |
| Le client a écrit au moins une fois | `last_client_message_at` | `IS NOT NULL` |
| Inactif depuis X jours (seuil config) | `last_client_message_at` | `<= NOW() - threshold` |
| Dans la fenêtre WhatsApp valide | `last_client_message_at` | `>= NOW() - 23h` (ou 72h CTWA) |
| Pas déjà relancé le max de fois | `dormant_auto_step` | `< maxSteps` |

### Règles de non-prolongation de fenêtre

**RÈGLE ABSOLUE** : la relance ne doit PAS prolonger la fenêtre de discussion WhatsApp.

- Un message texte normal envoyé dans la fenêtre (< 24h) **étend la session** → INTERDIT pour la relance
- Un **HSM (Template approuvé Meta)** envoyé hors-fenêtre **n'étend pas** la session → À UTILISER
- Whapi propose un équivalent template pour l'envoi hors-fenêtre

Conséquence : si `last_client_message_at > 23h`, utiliser HSM. Si `< 23h` et dans la fenêtre, un message texte peut être envoyé mais **sans ouvrir de lien prolongé** (à valider selon le cas métier).

---

## III. Analyse des 200k clients dormants

### Critère de ciblage recommandé

```sql
SELECT COUNT(*) FROM whatsapp_chat
WHERE last_poste_message_at IS NULL
  AND last_client_message_at IS NOT NULL
  AND deletedAt IS NULL;
```

Ce compte donne le nombre de clients jamais recontactés dans toute l'histoire de la base.

### Segmentation recommandée

Pour une relance progressive (éviter le spam) :

| Seuil | Cible | Priorité |
|---|---|---|
| `last_client_message_at >= NOW() - 7j` | Clients récents dormants | P0 (encore dans fenêtre ou proche) |
| `last_client_message_at >= NOW() - 30j` | Clients récents-moyens | P1 (HSM requis) |
| `last_client_message_at >= NOW() - 90j` | Clients anciens | P2 (HSM requis) |
| `last_client_message_at < NOW() - 90j` | Clients très anciens | P3 (à décider avec le métier) |

---

## IV. Fichiers à créer / modifier

### À créer

| Fichier | Contenu |
|---|---|
| `src/database/migrations/AddDormantCustomerTrigger1751000000001.ts` | 2 nouvelles colonnes sur `whatsapp_chat` |

### À modifier

| Fichier | Modification |
|---|---|
| `src/message-auto/entities/message-auto.entity.ts` | Ajouter `DORMANT_CUSTOMER = 'dormant_customer'` dans l'enum |
| `src/jorbs/auto-message-master.job.ts` | Ajouter `runTriggerK()` + appel dans `run()` |
| `src/message-auto/message-auto.service.ts` | Ajouter `case DORMANT_CUSTOMER:` dans `updateTriggerTracking()` |
| `admin/src/app/lib/definitions.ts` | Ajouter `'dormant_customer'` dans le type `AutoMessageTriggerType` |
| `admin/src/app/ui/MessageAutoView.tsx` | Ajouter onglet K dans `TRIGGER_TABS` + formulaire config |

---

## V. Schéma de la migration SQL

```typescript
// migration : AddDormantCustomerTrigger1751000000001.ts
// Colonnes à ajouter sur whatsapp_chat

dormant_auto_step          INT NOT NULL DEFAULT 0
last_dormant_auto_sent_at  TIMESTAMP NULL DEFAULT NULL
```

Index recommandé pour la performance du batch :

```sql
CREATE INDEX idx_chat_dormant_relance
  ON whatsapp_chat (last_poste_message_at, last_client_message_at, dormant_auto_step)
  WHERE deletedAt IS NULL;
```

---

## VI. Logique du batch-cron (runTriggerK)

```typescript
private async runTriggerK(config: CronConfig | undefined): Promise<void> {
  if (!config?.enabled) return;

  const thresholdDays = config.dormantCustomerThresholdDays ?? 7;
  const maxSteps = config.maxSteps ?? 1;
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const window23h = new Date(Date.now() - 23 * 60 * 60 * 1000);
  const window72h = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const chats = await this.chatRepo
    .createQueryBuilder('c')
    .leftJoinAndSelect('c.channel', 'channel')
    // Jamais recontacté
    .where('c.last_poste_message_at IS NULL')
    // A écrit au moins une fois
    .andWhere('c.last_client_message_at IS NOT NULL')
    // Inactif depuis le seuil configuré
    .andWhere('c.last_client_message_at <= :cutoff', { cutoff })
    // Dans la fenêtre valide (23h normal, 72h CTWA)
    .andWhere(
      `((c.is_ctwa = 0 AND c.last_client_message_at >= :window23h)
        OR (c.is_ctwa = 1 AND c.last_client_message_at >= :window72h))`,
      { window23h, window72h },
    )
    // Max étapes non atteint
    .andWhere('c.dormant_auto_step < :maxSteps', { maxSteps })
    // Jamais relancé
    .andWhere('c.last_dormant_auto_sent_at IS NULL')
    .limit(50)  // Prudence : 50 par run max
    .getMany();

  for (const chat of chats) {
    await this.safeSend(chat, async () => {
      const scopeOk = await this.scopeConfigService.isEnabledFor(
        chat.poste_id,
        chat.last_msg_client_channel_id,
        chat.channel?.provider ?? null,
      );
      if (!scopeOk) return;

      await this.messageAutoService.sendAutoMessageForTrigger(
        chat.chat_id,
        AutoMessageTriggerType.DORMANT_CUSTOMER,
        chat.dormant_auto_step + 1,
      );
    });
  }
}
```

---

## VII. Configuration admin (onglet K)

Paramètres exposés dans l'UI admin :

| Paramètre | Défaut | Description |
|---|---|---|
| Activé | `false` | Basculer le trigger on/off |
| Seuil inactivité (jours) | `7` | Jours sans activité avant relance |
| Max étapes | `1` | Nombre de relances max par client |
| Appliquer aux conversations fermées | `false` | Relancer même si `status = fermé` |
| Plage horaire | (vide) | Restreindre l'envoi à certaines heures |

---

## VIII. Points d'attention

| Risque | Mitigation |
|---|---|
| **Fenêtre prolongée par erreur** | Utiliser HSM/template approuvé — documenter dans la config admin que le message doit être un template |
| **Relance en boucle** | Tracking `last_dormant_auto_sent_at` + `dormant_auto_step < maxSteps` |
| **Performance sur 200k chats** | `LIMIT 50` par run + index sur `(last_poste_message_at, last_client_message_at)` |
| **Clients CTWA (72h)** | Déjà géré dans le QueryBuilder via `is_ctwa` |
| **Faux positifs** | `last_client_message_at IS NOT NULL` obligatoire — évite les chats créés manuellement sans message client |
| **Double envoi concurrent** | `safeSend()` existant gère le mutex par chat |

---

## IX. Scénario nominal

```
J0 : Client écrit à l'agent
     → last_client_message_at = J0
     → last_poste_message_at = NULL
     → Agent ne répond pas dans la fenêtre

J8 : CRON K s'exécute (seuil = 7 jours)
     → Détecte : last_client_message_at ≤ cutoff ET last_poste_message_at IS NULL
     → Sélectionne le template K défini dans l'admin
     → Envoie via HSM (hors fenêtre) ou texte (dans fenêtre)
     → Met à jour : dormant_auto_step = 1, last_dormant_auto_sent_at = NOW()

J8+ : Client répond à la relance
     → Nouvelle fenêtre de 24h s'ouvre (normal)
     → Dispatcher assigne la conversation à un agent
     → Agent peut répondre normalement
```

---

## X. Estimation de complexité

| Tâche | Complexité | Durée estimée |
|---|---|---|
| Migration SQL (2 colonnes) | Faible | 15 min |
| Enum + entité backend | Faible | 10 min |
| `runTriggerK()` dans le batch-job | Moyen | 1h |
| `updateTriggerTracking()` case K | Faible | 15 min |
| Types frontend (definitions.ts) | Faible | 5 min |
| Onglet K dans MessageAutoView | Moyen | 1h30 |
| **Total** | | **~3h30** |

---

## XI. Questions ouvertes à trancher avec le métier

1. **Seuil par défaut** : 7 jours, 30 jours, ou configurable par canal ?
2. **Status ciblés** : relancer uniquement `actif`/`en attente`, ou aussi `fermé` ?
3. **Template HSM** : doit-on bloquer l'envoi si pas de HSM disponible sur le canal, ou envoyer un message texte dans la fenêtre valide ?
4. **Plage d'envoi** : uniquement pendant les heures ouvrées ou 24/7 ?
5. **Séquence multi-étapes** : une seule relance ou plusieurs (ex: J+7, J+14, J+30) ?
6. **Opt-out** : faut-il exclure les clients avec `gdpr_optout = true` ? (réponse probable : oui)
7. **Client type** : appliquer uniquement aux `returning` clients ou aussi aux `new` ?
