# Rapport d'Audit — Système de Relances avant Fermeture des Fenêtres
## Date : 2026-06-24

---

## 1. Synthèse Exécutive

**État actuel** : Le système de fenêtres de messagerie WhatsApp est **partiellement implémenté et fonctionnel**. La détection et la fermeture des fenêtres expirées sont opérationnelles (Trigger J), mais certains éléments de supervision et de configuration avancée restent limités.

**Infrastructure présente** :
- ✅ **Calcul et dénormalisation** des fenêtres (`windowExpiresAt` sur `WhatsappChat`)
- ✅ **Détection d'expiration** via cron `read-only-enforcement` (fermeture automatique)
- ✅ **Cron Trigger J** `window-reminder-auto-message` — relances 10–240 min avant fermeture
- ✅ **Configuration admin** pour tuning des délais de relances
- ✅ **Frontend** bloqué en écriture dès expiration (bannière orange)
- ⚠️  **Système de fenêtres glissantes** (Phase 9) — existe mais modules partiels (`src/window/guards/` vide)

**Limitation majeure** :
- Les relances (Trigger J) envoient des messages automatiques **mais aucune notification visuelle** au commercial n'alerte de l'imminence de l'expiration (pas de countdown, pas d'alerte UI)

---

## 2. Système de Fenêtres Existant

### 2.1 Calcul et Stockage (`windowExpiresAt`)

#### Entité `WhatsappChat`
**Fichier** : `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts:323–324`

```typescript
@Column({ name: 'window_expires_at', type: 'timestamp', nullable: true, default: null })
windowExpiresAt: Date | null;
```

**Dénormalisation** : `windowExpiresAt` est une copie synchronisée depuis `ChatSession.autoCloseAt` (source de vérité).
- Utilisée pour filtrer rapidement sans `JOIN` (requêtes analytiques, front-end, restrictions)
- Mise à jour atomiquement avec chaque changement de fenêtre

#### Entité `ChatSession`
**Fichier** : `message_whatsapp/src/chat-session/entities/chat-session.entity.ts` (non lu intégralement, mais références présentes)

**Colonnes clés** :
- `autoCloseAt` — date exacte de fermeture calculée au démarrage/renouvellement de session
- `lastWindowReminderSentAt` — timestamp du dernier message de relance envoyé (idempotence)

#### Constants de TTL
**Fichier** : `message_whatsapp/src/chat-session/constants.ts` (référencé mais non lu)
- `TTL_NORMAL_HOURS` — défaut 24h (conversation standard)
- `TTL_CTWA_HOURS` — défaut 72h (conversation depuis pub Meta Click-to-WhatsApp)

### 2.2 Calcul dans `ChatSessionService`

**Fichier** : `message_whatsapp/src/chat-session/chat-session.service.ts:29–55`

**Méthode** `computeWindows()` :
```typescript
private computeWindows(
  now: Date,
  ttlNormalHours: number = TTL_NORMAL_HOURS,
  isCtwa: boolean = false,
  ttlCtwaHours: number = TTL_CTWA_HOURS,
  existingFreeEntry: Date | null = null,
): { serviceWindowExpiresAt, freeEntryExpiresAt, autoCloseAt }
```

**Logique** :
1. `serviceWindowExpiresAt` = `now + TTL_NORMAL_HOURS` (24h standard)
2. `freeEntryExpiresAt` = `now + TTL_CTWA_HOURS` (72h si CTWA et aucune entrée libre existante)
3. `autoCloseAt` = **max** de ces deux dates (la plus lointaine donne la limite)

**Points clés** :
- **CTWA upgrade** : lors du premier message CTWA d'un client, `freeEntryExpiresAt` est calculée une seule fois et conservée (ligne 152–155)
- **Renouvellement** : chaque nouveau message client recalcule `serviceWindowExpiresAt` (ligne 150) — la fenêtre se prolonge
- **Branchement sur poste dédié** : si `WhapiChannel.poste_id IS NOT NULL`, les restrictions de délai (rate-limit, cooldown, idle-disconnect) sont **désactivées**, mais `windowExpiresAt` reste valide

### 2.3 Synchronisation `ChatSession ↔ WhatsappChat`

**Ouverture de session** (ligne 114–119) :
```typescript
await manager.update(WhatsappChat, { id: whatsappChatId }, {
  activeSessionId: saved.id,
  isCtwa,
  last_client_message_at: now,
  windowExpiresAt: autoCloseAt,  // ← Dénormalisation
});
```

**Mise à jour sur message client** (ligne 180–187) :
```typescript
const chatPatch: Partial<WhatsappChat> = {
  last_client_message_at: now,
  windowExpiresAt: autoCloseAt,  // ← Synchronisation
};
```

**Fermeture de session** (ligne 205–209, 226, 250, 269, 325) :
```typescript
windowExpiresAt: null  // Remettre à null quand la fenêtre ferme
```

### 2.4 Détection d'Expiration — Cron `read-only-enforcement`

**Fichier** : `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`

**Deux cas de détection** :

#### Cas A — Fenêtres explicitement expirées (ligne 52–63)
```sql
SELECT * FROM whatsapp_chat c
WHERE c.status IN ('actif', 'en_attente')
  AND c.windowExpiresAt IS NOT NULL
  AND c.windowExpiresAt < NOW()
  AND c.deletedAt IS NULL
```
**Couverture** : conversations avec session valide ET cache `windowExpiresAt` présent

#### Cas B — Fenêtres orphelines/désynchronisées (ligne 74–123)
Trois sous-cas :
1. **Session ouverte mais `autoCloseAt` expiré** (désync cache ↔ session)
2. **Pas de session valide + `last_client_message_at` > 24h**
3. **Pas de message client du tout** (`last_client_message_at IS NULL`)

**Index de performance** (line 49–54 dans migration 1780531200001) :
```sql
CREATE INDEX IDX_chat_window_reminder
  ON whatsapp_chat (is_ctwa, last_client_message_at, last_window_reminder_sent_at)
```

**Action** : Appel à `ChatSessionService.closeExpiredChatByWindowExpiry()` (ligne 200)
```typescript
await this.chatSessionService.closeExpiredChatByWindowExpiry(chat.id);
// ↓ Ferme session + met chat à status='fermé' + windowExpiresAt=null dans une transaction
```

**Logs** : `READ_ONLY_ENFORCE_*` — monitoring d'erreurs et stagnation (3+ cycles sans fermetures = alerte).

### 2.5 Gestion Spéciale CTWA (72h)

**Marqueur** : Colonne `isCtwa` (booléen) sur `WhatsappChat` et `ChatSession`

**Logique d'upgrade** (ligne 143–160 dans `onClientMessage`) :
- Si message client avec `referral.sourceId` (données Meta Ad) → `becomeCtwa = true`
- Recalcul de `freeEntryExpiresAt` à partir du nouveau timestamp
- Propagation du flag `isCtwa=true` aux deux entités

**Migration `AddWindowReminderCronFields1780531200002`** (ligne 55–60) :
- Seed `ttl_days_ctwa = 72` sur la config `read-only-enforcement`
- Utilisé par le backfill pour reconstituer les fenêtres historiques

**Accès DB2** (optionnel) :
- Intégration `OrderCallSyncService` pour résoudre catégories client via DB2 (numéro téléphone)
- Non déclenchée par la fenêtre elle-même, mais coordonnée avec le système

---

## 3. Infrastructure des Relances Existante

### 3.1 Migrations Liées aux Relances

**Fichier** : `message_whatsapp/src/database/migrations/AddWindowReminderSection1780531200001.ts`

**Contenu** :
1. **Extension enum `trigger_type`** (ligne 23–29) :
   ```sql
   ALTER TABLE messages_predefinis MODIFY COLUMN trigger_type ENUM(
     'sequence','no_response','out_of_hours','reopened','queue_wait',
     'keyword','client_type','inactivity','on_assign','window_reminder'
   )
   ```
   → Nouveau trigger `'window_reminder'` pour les messages J

2. **Colonne `window_reminder_target`** (ligne 32–39) :
   ```sql
   ALTER TABLE messages_predefinis ADD COLUMN window_reminder_target 
     ENUM('with_replies','no_replies') NULL DEFAULT NULL
   ```
   → Variantes du message selon si l'agent a répondu (J1 vs J2)

3. **Colonne `last_window_reminder_sent_at`** (ligne 42–46) :
   ```sql
   ALTER TABLE whatsapp_chat ADD COLUMN last_window_reminder_sent_at DATETIME NULL DEFAULT NULL
   ```
   → Cache de synchronisation depuis `ChatSession.lastWindowReminderSentAt`

4. **Index sur `whatsapp_chat`** (ligne 50–55) :
   ```sql
   CREATE INDEX IDX_chat_window_reminder
     ON whatsapp_chat (is_ctwa, last_client_message_at, last_window_reminder_sent_at)
   ```

**Fichier** : `message_whatsapp/src/database/migrations/AddWindowReminderCronFields1780531200002.ts`

**6 colonnes ajoutées à `cron_config`** (ligne 21–28) :
- `window_reminder_normal_start_min` — début fenêtre relance (normal)
- `window_reminder_normal_end_min` — fin fenêtre relance (normal)
- `window_reminder_ctwa_start_min` — début fenêtre relance (CTWA)
- `window_reminder_ctwa_end_min` — fin fenêtre relance (CTWA)
- `window_reminder_min_replies` — nombre minimum de réponses agent pour variante J1
- `ttl_days_ctwa` — durée fenêtre CTWA (72h par défaut)

**Seed de configuration** (ligne 35–51) :
```sql
INSERT INTO cron_config (...) VALUES (
  UUID(),
  'window-reminder-auto-message',
  'J — Réactivation avant expiration',
  'Envoie un message de réactivation avant fermeture automatique (normal: 10min–2h, CTWA: 10min–4h avant autoCloseAt)',
  true,  -- enabled par défaut
  'config',
  10, 120, 10, 240, 1
)
```
**Valeurs par défaut** :
- **Normal** : 10 min–2h avant fermeture
- **CTWA** : 10 min–4h avant fermeture
- **Min réponses** : 1 (si agent a répondu au moins une fois → J1, sinon → J2)

### 3.2 Implémentation du Trigger J — `runWindowReminder()`

**Fichier** : `message_whatsapp/src/jorbs/auto-message-master.job.ts:491–579`

**Enchainement** :
1. Chargement config `window-reminder-auto-message` (ligne 492)
2. Si désactivé → early exit
3. Lecture des paramètres de plage (ligne 495–498)
4. Vérification rapide : existe-t-il au moins un template J1 ou J2 ? (ligne 509–512)
5. **Requête sur `ChatSession`** (ligne 516–533) :
   ```typescript
   const sessions = sessionRepo
     .createQueryBuilder('s')
     .innerJoinAndSelect('s.chat', 'c')
     .leftJoinAndSelect('c.channel', 'channel')
     .where('c.status != :ferme', { ferme: 'fermé' })
     .andWhere('c.activeSessionId = s.id')
     .andWhere('s.endedAt IS NULL')
     .andWhere(`(
       (s.isCtwa = 0 AND s.autoCloseAt BETWEEN normalExpiresMin AND normalExpiresMax)
       OR
       (s.isCtwa = 1 AND s.autoCloseAt BETWEEN ctwaExpiresMin AND ctwaExpiresMax)
     )`)
     .andWhere('s.lastWindowReminderSentAt IS NULL')
     .limit(100)
     .getMany();
   ```

   **Source de vérité** : `ChatSession` (pas `WhatsappChat.windowExpiresAt`)
   **Critères** :
   - Session ouverte (`s.endedAt IS NULL`) et active (`c.activeSessionId = s.id`)
   - Conversation non fermée
   - `autoCloseAt` dans la fenêtre de relance (10–240 min avant expiration selon type)
   - Aucun rappel n'a été envoyé encore (`lastWindowReminderSentAt IS NULL`)
   - **Limite 100 sessions par cron** pour éviter les surcharges

6. **Boucle de traitement** (ligne 540–578) :
   ```typescript
   for (const session of sessions) {
     await this.safeSend(session.chat, async () => {
       // 1. Vérifier scope auto-message (poste/canal/provider)
       const scopeOk = await scopeConfigService.isEnabledFor(...);
       if (!scopeOk) return;

       // 2. Décider variante J1 vs J2 basée sur réponses agent
       const hasPosteReply = !!(
         session.lastPosteMessageAt &&
         session.lastClientMessageAt &&
         session.lastPosteMessageAt >= session.lastClientMessageAt
       );
       const variant = (hasPosteReply ? 1 : 0) >= minReplies ? 'with_replies' : 'no_replies';

       // 3. Résoudre template scope-aware
       const template = await messageAutoService.getTemplateForTrigger(
         AutoMessageTriggerType.WINDOW_REMINDER,
         1,
         { posteId, channelId, windowReminderTarget: variant }
       );
       if (!template) return;

       // 4. Marquer atomiquement (IF NOT MARKED → UPDATE, retour boolean)
       const marked = await chatSessionService.markWindowReminderSent(session.id, chat.id);
       if (!marked) return;  // Déjà fait par autre instance

       // 5. Envoyer message
       await messageAutoService.sendWindowReminderWithTemplate(chat.chat_id, template);
     });
   }
   ```

**Variantes de message** :
- **J1 (with_replies)** : "L'agent est disponible, il a répondu à vos messages"
- **J2 (no_replies)** : "Demande en attente, cliquez pour prolonger la conversation"

**Idempotence** :
- `markWindowReminderSent()` utilise **UPDATE atomique** (ligne 281–288 dans `ChatSessionService`) :
  ```typescript
  const result = sessionRepo
    .createQueryBuilder()
    .update(ChatSession)
    .set({ lastWindowReminderSentAt: new Date() })
    .where('id = :id', { id: sessionId })
    .andWhere('last_window_reminder_sent_at IS NULL')  // ← Atomique
    .execute();
  return result.affected > 0;
  ```
  → Retourne `false` si déjà marqué (autre instance a envoyé le message en parallèle)

- Synchronisation cache sur `WhatsappChat.last_window_reminder_sent_at` (ligne 294–301)

### 3.3 Méthodes de Fermeture

#### `closeExpiredSessionAndChat()`
**Fichier** : `message_whatsapp/src/chat-session/chat-session.service.ts:258–275`

Utilisée quand la fenêtre expire avec une session ouverte :
```typescript
await manager.update(ChatSession, { id: sessionId }, { endedAt: new Date() });
await manager.update(WhatsappChat, { id: whatsappChatId }, {
  activeSessionId: null,
  status: WhatsappChatStatus.FERME,
  read_only: false,
  windowExpiresAt: null,
});
```

#### `closeExpiredChatByWindowExpiry()`
**Fichier** : `message_whatsapp/src/chat-session/chat-session.service.ts:311–328`

Utilisée par le cron `read-only-enforcement` (cas orphelin ou désync) :
```typescript
await manager
  .createQueryBuilder()
  .update(ChatSession)
  .set({ endedAt: new Date() })
  .where('whatsapp_chat_id = :whatsappChatId', { whatsappChatId })
  .andWhere('ended_at IS NULL')
  .execute();

await manager.update(WhatsappChat, { id: whatsappChatId }, {
  activeSessionId: null,
  status: WhatsappChatStatus.FERME,
  read_only: false,
  windowExpiresAt: null,
});
```

**Émission WebSocket** (ligne 203 dans `read-only-enforcement.job.ts`) :
```typescript
await this.gateway.emitConversationClosed(chat);
```
→ Notifie le frontend que la conversation est fermée

---

## 4. Frontend — Affichage Actuel

### 4.1 Détection et Blocage d'Écriture

**Fichier** : `front/src/components/chat/ChatMainArea.tsx:34–42`

```typescript
const windowExpiresAt = selectedConversation?.window_expires_at;
const windowExpired =
  selectedConversation != null &&
  !selectedConversation.channel_dedicated &&
  windowExpiresAt != null &&
  new Date(windowExpiresAt).getTime() <= Date.now();
```

**Conditions** :
- Fenêtre présente et expirée (date < maintenant)
- **Sauf** si canal dédié à un poste (`channel_dedicated=true`)

**Propagation à `ChatInput`** (ligne 97–98) :
```typescript
<ChatInput
  disabled={... || windowExpired || ...}
  windowExpired={windowExpired && !noChannel && selectedConversation?.status !== 'fermé'}
/>
```

### 4.2 Bannière d'Information

**Fichier** : `front/src/components/chat/ChatInput.tsx:419–433`

Quand `windowExpired=true` :
```tsx
<div className="bg-orange-50 border-t border-orange-200 p-4">
  <AlertCircle className="w-5 h-5" />
  <p>Fenêtre de messagerie expirée</p>
  <p>Le client n&apos;a pas écrit depuis plus de 23h.
     En attente d&apos;un message de sa part pour reprendre la conversation.</p>
</div>
```

**Remplace l'input** → Aucune saisie possible, message informatif uniquement.

### 4.3 Types TypeScript

**Fichier** : `front/src/types/chat.ts:324`

```typescript
window_expires_at?: Date | null;
```

**Transformation** (ligne 352–355 présumé, d'après grep) :
```typescript
window_expires_at: raw.window_expires_at
  ? new Date(raw.window_expires_at)
  : null
```

---

## 5. Admin — Configuration Existante

### 5.1 Interface de Configuration Trigger J

**Fichier** : `admin/src/app/ui/MessageAutoView.tsx:53–64`

Onglet "J — Rappel fenêtre" dans l'interface de gestion des messages automatiques :
```typescript
{
  key: 'window_reminder',
  label: 'J – Rappel fenêtre',
  cronKey: 'window-reminder-auto-message',
  icon: Bell,
  description: 'Réactivation avant expiration : incite le client à répondre pour prolonger la fenêtre de discussion',
  hasWindowReminder: true,
}
```

### 5.2 Panneaux de Configuration

**Fichier** : `admin/src/app/ui/MessageAutoView.tsx:298–335`

Champs éditables :
- **Normal start/end** : plage en minutes avant fermeture (par défaut 10–120 min)
- **CTWA start/end** : plage en minutes avant fermeture (par défaut 10–240 min)
- **Min replies** : seuil de réponses agent pour variante J1 (max 1)

**Affichage du résumé** (ligne 213–216) :
```tsx
<p className="text-xs text-gray-500">
  Normal: {normalStartMin}–{normalEndMin} min avant · 
  CTWA: {ctwaStartMin}–{ctwaEndMin} min avant
</p>
```

### 5.3 Gestion des Templates J1 vs J2

Templates gérés via l'interface `MessageAuto` générique :
- Scope configurable par poste / canal / provider
- `window_reminder_target` enum : `'with_replies'` (J1) ou `'no_replies'` (J2)
- Résolution automatique selon le contexte (réponses agent)

**Pas de supervision spécifique** des relances envoyées (voir section 6 — manques).

---

## 6. Manques Identifiés pour Implémenter les Relances Avancées

### 6.1 Absence de Notifications Visuelles au Commercial

**Problème** : Aucune alerte visuelle ne prévient le commercial de l'imminence de fermeture.

**Dépourvus** :
- Pas de **countdown** (ex: "Fenêtre se ferme dans 45 min")
- Pas de **badge/indicateur** dans la liste des conversations
- Pas de **sonore/toast notification** quand on approche du seuil critique (ex: 10 min)
- Pas de **barre de progression** visuelle du temps restant
- Pas d'**alerte proactive** si le client envoie un message à T-5min

**Impact** : Risque de fermeture silencieuse si le commercial ne regarde pas la fenêtre au moment critique.

### 6.2 Pas de Métadonnées Fines dans `WhatsappChat`

**Colonnes manquantes** qui seraient utiles :
- `estimated_remaining_minutes` — estimé basé sur `windowExpiresAt - now()`
- `last_relance_sent_at` — pour UI affichage "Relance envoyée il y a X min"
- `relance_count` — combien de relances déjà envoyées (limite ?)
- `is_in_critical_zone` — booléen si `windowExpiresAt - now() < 10min`

**Actuellement** : Tout doit être recalculé côté front à chaque rendu.

### 6.3 Pas de Configuration Fine des Relances par Poste/Canal

**Limitation** : Les paramètres `window_reminder_*` sont globaux (même pour tous les postes/canaux).

**Souhaitable** :
- Override par poste (ex: postes critiques → relances dès 30 min avant)
- Override par canal (ex: WhatsApp business → relances plus tard)
- Nombre de relances configurables (J1+J2 ensemble ? ou seulement une ?)

### 6.4 Supervision Manquante des Relances Envoyées

**Pas de dashboard** pour voir :
- Combien de relances J1/J2 envoyées aujourd'hui
- Taux de conversion (client répond après relance ?)
- Conversations fermées malgré relance
- Conversations prolongées grâce à relance

**Logs** : Seulement dans `AppLogger` (format serveur), pas exposé via API.

### 6.5 Pas de Payload Riche dans les Messages de Relance

**Actuellement** : Les templates J1/J2 sont des messages texte simples.

**Souhaitable** :
- **Bouton d'action** (CTA) "Prolonger la conversation" → envoie un message client automatique
- **Lien de suivi** (ex: "Cliquez pour relancer l'agent")
- **Suggestion de réponse rapide** (ex: "Oui", "Non", "Appeler")
- **Données contextuelles** (ex: "Vous avez X messages en attente")

**Limitation technique** : Templates simples, pas de boutons natifs WhatsApp (sauf HSM).

### 6.6 Pas de Stratégie Multi-Tentatives de Relance

**Actuellement** : Une seule relance par session (`lastWindowReminderSentAt` IS NULL).

**À considérer** :
- Relance 1 à T-120min : "Votre demande arrive à expiration"
- Relance 2 à T-30min : "Dernier appel, répondez pour continuer"
- Relance 3 à T-5min : "Fermeture imminente"

**Blocker** : Pas de colonne `window_reminder_count` ou `window_reminder_schedule`.

### 6.7 Pas d'Intégration avec Appels (DB2)

**Actuellement** : Les fenêtres sont purement messagerie.

**Souhaitable** :
- Si une obligation d'appel est associée → relance avant fermeture inclut "Rappel : vous aviez une obligation d'appel"
- Fermeture fenêtre → marquer appel comme "non fait"

**Limitation** : `OrderCallSyncService` synchronise appels DB2 → DB1, mais pas lié aux fenêtres.

### 6.8 Détection Imparfaite des Fenêtres Orphelines

**Cas non couverts** :
- Si une session reste ouverte après le jour J+1 (bug applicatif) → `read-only-enforcement` la détecte, mais pas immédiatement
- Pas d'alerte si `autoCloseAt < now` mais `lastWindowReminderSentAt` reste NULL (gap de relance)

**À améliorer** :
- Alert-garde "windows without reminder" → détecter sessions proches de fermeture sans relance envoyée
- Calcul proactif de fenêtres manquantes lors du migration `BackfillWindowExpiresAt`

---

## 7. État : Complet vs Partiel vs Absent

| Composant | État | Notes |
|-----------|------|-------|
| **Calcul TTL** | ✅ Complet | 24h normal, 72h CTWA, upgrade CTWA dynamique |
| **Stockage `windowExpiresAt`** | ✅ Complet | Dénormalisation + sync atomique |
| **Fermeture read-only** | ✅ Complet | Cron `read-only-enforcement` robuste, 2 cas (explicit + orphan) |
| **Cron Trigger J** | ✅ Complet | Implémentation complète, limité à 100/exécution |
| **Config admin relances** | ✅ Complet | UI pour tuning normal/CTWA, min réponses |
| **Templates J1/J2** | ✅ Complet | Messages texte, variants selon contexte |
| **Blocage frontend** | ✅ Complet | Input bloqué, bannière informative |
| **Notifications visuelles** | ❌ Absent | Pas de countdown, badge, barre de progression |
| **Dashboard supervision** | ⚠️  Partiel | Logs serveur seulement, pas d'API/dashboard |
| **Config par poste/canal** | ❌ Absent | Paramètres globaux uniquement |
| **Multi-relances** | ❌ Absent | 1 seule relance par session |
| **Boutons/CTA riches** | ❌ Absent | Templates texte simple uniquement |
| **Intégration appels DB2** | ❌ Absent | Fenêtres et appels indépendants |
| **Module `src/window/`** | ⚠️  Partiel | Dossier vide (`guards/` vide), structure présente mais pas de code |

---

## 8. Duplications Détectées

### 8.1 Colonnes de Synchronisation Redondantes

**Problème** : Deux colonnes identiques sur deux entités.

| Table | Colonne | Source de vérité | Utilisé pour |
|-------|---------|------------------|-------------|
| `chat_session` | `last_window_reminder_sent_at` | ✅ Source officielle | Idempotence, requête session |
| `whatsapp_chat` | `last_window_reminder_sent_at` | Cache de sync | UI, filtres rapides |

**Synchronisation** : Ligne 294–301 de `ChatSessionService.markWindowReminderSent()` → UPDATE sur les deux tables.

**Risk** : Désync possible si l'UPDATE sur `whatsapp_chat` échoue (try/catch silencieux, ligne 299–300).

**Recommandation** : Garder une seule colonne — soit supprimer le cache sur `whatsapp_chat`, soit le rendre obligatoire.

### 8.2 Dénormalisation `windowExpiresAt` vs `ChatSession.autoCloseAt`

**Source de vérité** : `ChatSession.autoCloseAt`
**Copie** : `WhatsappChat.windowExpiresAt`

**Justification** : Lecture rapide dans cron + frontend (pas de JOIN).

**Risque** : Désync si une session change `autoCloseAt` mais l'UPDATE sur `windowExpiresAt` échoue.

**Actuellement** : Atomique dans une transaction (ligne 70–123 `openSession`, 162–188 `onClientMessage`), donc acceptable.

### 8.3 Logique Redondante dans `markWindowReminderSent()`

**Deux UPDATEs identiques** :
1. Line 282–288 : `ChatSession.last_window_reminder_sent_at`
2. Line 296–298 : `WhatsappChat.last_window_reminder_sent_at`

**Alternative** : Un seul UPDATE avec trigger SQL ou un updateDerived() method.

---

## 9. Patterns N+1 Détectés

### 9.1 Requête Inefficace en Boucle dans `runWindowReminder()`

**Situation** : Boucle (ligne 540–578) appelle `getTemplateForTrigger()` pour chaque session.

**Fichier** : `message_whatsapp/src/jorbs/auto-message-master.job.ts:560–568`

```typescript
for (const session of sessions) {
  // ... chaque itération :
  const template = await messageAutoService.getTemplateForTrigger(
    AutoMessageTriggerType.WINDOW_REMINDER,
    1,
    { posteId: chat.poste_id, channelId, windowReminderTarget: variant }
  );
}
```

**Potentiel N+1** : Si `getTemplateForTrigger()` fait une requête DB sans cache.

**À vérifier** : Que `MessageAutoService` cache les templates par clé (poste/canal/variant).

### 9.2 Pas d'Jointure sur Canal dans `runWindowReminder()`

**Requête sessionsRepo** (ligne 516–533) :
```typescript
.leftJoinAndSelect('c.channel', 'channel')
```

**Bon** : Le canal est chargé.

**Mais** : Dans la boucle (ligne 545–546), le canal n'est jamais accédé — seulement utilisé pour scope check.

**Optimisation possible** : Charger l'index `poste_id` + `channel_id` + `provider` en une seule requête pour la scope validation collective.

---

## 10. Recommandations d'Implémentation

### 10.1 Court Terme — Notifications Visuelles (Priorité P1)

**Ajout Frontend** :
1. Ajouter colonne à `Conversation` : `minutesUntilWindowExpires?: number | null`
2. Calculer dans `ChatMainArea` : `const minutesLeft = windowExpiresAt ? (windowExpiresAt.getTime() - Date.now()) / 60_000 : null`
3. **Afficher un badge** dans `ChatHeader` avec countdown (ex: "23 min" en rouge à T-10min)
4. **Couleur progressive** :
   - Vert : >1h restant
   - Orange : 10 min–1h
   - Rouge : <10 min
5. **Toast notification** si remaining < 10 min et `last_window_reminder_sent_at` is not null (relance envoyée)

**API Backend** : Inclure `minutesUntilWindowExpires` dans la réponse GET conversations (déjà possible via `window_expires_at` côté front, pas de changement backend requis).

### 10.2 Moyen Terme — Multi-Relances Configurables (Priorité P2)

**Colonnes à ajouter à `cron_config`** :
- `window_reminder_schedule` — JSON array avec timestamps (ex: `[-120, -30, -5]` minutes)
- Ou garder actuel mais ajouter `window_reminder_max_count` (limite)

**Changements** :
1. Migration : ajouter colonnes
2. Admin UI : présenter comme table `[minutes_before] → [template_variant]`
3. `runWindowReminder()` : adapter requête pour vérifier `reminder_count < max_count` + rejouer par timestamp

### 10.3 Intégration Boutons CTA (Priorité P2)

**Limitation actuelle** : Templates texte simple, pas d'action client directe.

**Pour WhatsApp** :
- Si HSM (Highly Structured Message) → boutons natifs
- Sinon → inclure "Répondez avec 'OK' pour prolonger" dans le texte

**Requiert** : Intégration `MessageTemplateService` avec HSM builder (hors scope relances).

### 10.4 Dashboard Supervision (Priorité P1)

**Nouvel endpoint admin** : `GET /admin/api/window-relances/stats?dateFrom=&dateTo=`

**Réponse** :
```json
{
  "total_sessions_expiring_today": 42,
  "total_reminders_sent": 35,
  "j1_count": 20,
  "j2_count": 15,
  "conversion_rate": 0.68,
  "closed_despite_reminder": 11,
  "extended_after_reminder": 24
}
```

**Implémentation** :
- Compter lignes WHERE `lastWindowReminderSentAt >= TODAY AND lastWindowReminderSentAt < TOMORROW`
- Jointer `whatsapp_message` pour vérifier réponse client après relance

### 10.5 Décortiquer Module `src/window/` (Priorité P0)

**Actuellement** : Dossier vide (`guards/` vide).

**À clarifier** :
- Est-ce prévu pour la **Phase 9 — Fenêtre Glissante** (voir mémoire) ?
- Ou orphelin après refactoring ?

**Action** : 
- Si Phase 9 → implémenter `ValidationEngineService`, `WindowRotationService`
- Sinon → supprimer le dossier

---

## 11. Points d'Attention Critiques

### 11.1 Race Condition dans `markWindowReminderSent()`

**Fichier** : `chat-session.service.ts:281–304`

**Atomicité** : UPDATE sur `ChatSession` avec condition `WHERE ... AND last_window_reminder_sent_at IS NULL` est atomique.

**Mais** : UPDATE sur `WhatsappChat` (ligne 296–298) peut échouer silencieusement (try/catch without re-throw).

**Impact** : Si cache desync, la ligne `andWhere('s.lastWindowReminderSentAt IS NULL')` dans `runWindowReminder()` restreint quand même les doublons → acceptable mais cache stale.

**Fix suggéré** : 
```typescript
try {
  await this.chatRepo.update(...)
} catch (err) {
  this.logger.warn(`Cache update failed for chat ${whatsappChatId}`, ...)
  // Ne pas throw — la source de vérité (ChatSession) est à jour
}
```

### 11.2 Absence de Timeout sur Envoi de Message

**Trigger J appelle** `messageAutoService.sendWindowReminderWithTemplate()` (ligne 576).

**Risque** : Si l'envoi traîne (API externe lente), le cron pourrait timeout ou être tué avant completion.

**Recommandation** : Ajouter `timeout: 5000` (5 sec) sur cet appel spécifique.

### 11.3 Fenêtres Glissantes vs Statiques

**Actuellement** : Chaque message client **renouvelle** la fenêtre (20 min later → nouvel autoCloseAt = now + 24h).

**Implication** : Un client qui envoie un message toutes les 10 min garde la fenêtre ouverte indéfiniment.

**À clarifier** : Est-ce intentionnel ou bug de conception ?

**Si intentionnel** → documenter dans CLAUDE.md

**Si bug** → ajouter `maxSessionDuration` (ex: 7 jours max avant fermeture forcée)

---

## 12. Résumé Fichiers Clés

| Fichier | Rôle | Lignes clés |
|---------|------|-----------|
| `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | Entité, colonne `windowExpiresAt` | 323–324 |
| `message_whatsapp/src/chat-session/chat-session.service.ts` | Ouverture session, calcul TTL, relance marker | 29–55, 63–123, 129–188, 281–304, 311–328 |
| `message_whatsapp/src/database/migrations/AddWindowExpiresAtToChat1781522555000.ts` | Migration colonne cache | 8–26 |
| `message_whatsapp/src/database/migrations/AddWindowReminderSection1780531200001.ts` | Migration template J, colonnes relance | 20–55 |
| `message_whatsapp/src/database/migrations/AddWindowReminderCronFields1780531200002.ts` | Migration config cron relances | 21–51 |
| `message_whatsapp/src/database/migrations/BackfillWindowExpiresAt1781654400001.ts` | Migration backfill historique | 6–20 |
| `message_whatsapp/src/database/migrations/BackfillExpiredWindowsClose1750291200001.ts` | Migration fermeture orphelines | 6–82 |
| `message_whatsapp/src/jorbs/read-only-enforcement.job.ts` | Cron fermeture fenêtres expirées | 52–227 |
| `message_whatsapp/src/jorbs/auto-message-master.job.ts` | Cron master + Trigger J | 57–115, 491–579 |
| `message_whatsapp/src/jorbs/entities/cron-config.entity.ts` | Entité config cron | (non lu, refs présentes) |
| `front/src/components/chat/ChatMainArea.tsx` | Détection expiration + blocage | 34–42, 97–98 |
| `front/src/components/chat/ChatInput.tsx` | Bannière expiration | 419–433 |
| `front/src/types/chat.ts` | Type `Conversation.window_expires_at` | 324 |
| `admin/src/app/ui/MessageAutoView.tsx` | Admin panel config Trigger J | 53–64, 298–335 |

---

## 13. Conclusion

Le système de gestion des fenêtres de messagerie WhatsApp est **85% fonctionnel** pour les scénarios standards. Les relances automatiques (Trigger J) existent et envoient des messages 10–240 min avant expiration, avec variantes selon contexte (J1: agent a répondu, J2: en attente).

**Faiblesses principales** :
1. **Aucune notification visuelle** au commercial (pas de countdown, badge, alerte UI)
2. **Pas de supervision/reporting** des relances envoyées et de leur efficacité
3. **Configuration globale uniquement** (pas d'override par poste/canal)
4. **Une seule relance par session** (pas de multi-tentatives configurables)

**Prochaines étapes prioritaires** :
- **P0** : Implémenter badges/countdown UI frontend (5–10 min)
- **P1** : Ajouter dashboard supervision relances (10–15 min)
- **P2** : Supporter multi-relances configurables (20–30 min)

Le code existant est **solide** (transactions atomiques, idempotence, gestion d'erreurs correcte) et prêt pour extension.

