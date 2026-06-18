# Plan de correction — Fermeture automatique des fenêtres expirées

**Date :** 2026-06-18  
**Branche :** `production`  
**Fichiers critiques :**
- `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`
- `message_whatsapp/src/chat-session/chat-session.service.ts`
- `message_whatsapp/src/channel/channel.service.ts`
- `message_whatsapp/src/database/migrations/BackfillWindowExpiresAt1781654400001.ts`
- `message_whatsapp/src/chat-session/entities/chat-session.entity.ts`

---

## Architecture de la fenêtre — source de vérité

```
chat_session.auto_close_at          ← source de vérité (calculée à l'ouverture/refresh)
        │
        └─ dénormalisé dans ──→  whatsapp_chat.window_expires_at   ← cache utilisé par le cron
```

Le cron `read-only-enforcement` lit uniquement `whatsapp_chat.window_expires_at`. Si ce cache est NULL
ou désynchronisé par rapport à `chat_session.auto_close_at`, la conversation n'est jamais fermée.

---

## Diagnostic — causes racines identifiées

### RC-1 (CRITIQUE) : `windowExpiresAt = NULL` sur des conversations ACTIF/EN_ATTENTE

Le cron filtre **exclusivement** `c.windowExpiresAt IS NOT NULL` (`findExpiredChats()`, ligne 60).
Toute conversation avec cette colonne à NULL est **invisible** même si elle est ouverte depuis des jours.

| Sous-cause | Mécanisme | Prévalence |
|---|---|---|
| **A — Conversations antérieures aux migrations** | `AddWindowExpiresAtToChat` ne backfille que celles avec `active_session_id` pointant sur une session `ended_at IS NULL`. Si la session était déjà fermée, `window_expires_at` reste NULL. | Élevée |
| **B — `last_client_message_at = NULL`** | La migration `BackfillWindowExpiresAt` conditionne sur `last_client_message_at IS NOT NULL`. Les conversations sans ce champ passent entre les mailles. | Moyenne |
| **C — Flows post-migration sans session** | Réouverture manuelle, réassignation admin, transition de statut qui ne passe pas par `openSession()` → `windowExpiresAt` reste NULL. | Faible à moyenne |
| **D — Désynchronisation session↔cache** | `chat_session.auto_close_at` est expiré, mais la mise à jour de `whatsapp_chat.window_expires_at` a échoué silencieusement (ex : erreur dans `onClientMessage()`, `openSession()` dans une transaction qui a rollback). Le cache reste à NULL alors que la session est techniquement expirée. | Inconnue |

---

### RC-2 (CRITIQUE) : Sessions `chat_session` orphelines non détectées

Cas distincts à traiter :

**Cas 2a — Session ouverte avec `auto_close_at` expiré mais `windowExpiresAt = NULL`**  
La session existe (`ended_at IS NULL`), son `auto_close_at < NOW()`, mais le cache sur le chat est NULL.
→ Le cron ne ferme pas, et la session reste ouverte indéfiniment.

**Cas 2b — Session zombie (`ended_at IS NULL`) sur un chat `FERME`**  
Le chat a été fermé manuellement ou par un autre chemin, mais la session n'a pas été clôturée.
`chat_session.ended_at` reste NULL alors que `whatsapp_chat.status = 'ferme'`.
→ Ces sessions pollent les compteurs et peuvent causer des effets de bord si le client ré-écrit.

**Cas 2c — `whatsapp_chat.active_session_id` désynchronisé**  
`active_session_id` pointe sur une session dont `ended_at IS NOT NULL` (session déjà fermée), mais le
chat reste `ACTIF`. La session suivante peut être ignorée ou mal calculée.

---

### RC-3 (SECONDAIRE) : N+1 dans `shouldSkipAutoClose()`

```typescript
// 1 requête DB par chat dans la boucle
for (const chat of chats) {
  if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) { ... }
}
```

Sur 50 conversations → 50 requêtes supplémentaires. Risque de timeout sur gros volume.

---

### RC-4 (SECONDAIRE) : Pas de try-catch individuel dans `enforce()`

Une exception sur le chat n°3 d'une liste de 20 stoppe le batch entier. Les 17 suivants ne sont
jamais fermés.

---

### RC-5 (SECONDAIRE) : Logs insuffisants pour le diagnostic

Les logs indiquent `candidates=N closed=M` mais pas : combien ont `windowExpiresAt = NULL`,
combien ont une session zombie, lesquels ont levé une erreur.

---

## Plan d'implémentation

### Étape 0 — Audit SQL immédiat (sans code)

Exécuter en production pour quantifier chaque cas avant toute modification :

```sql
-- RC-1 : conversations actives sans fenêtre
SELECT
  status,
  COUNT(*) AS total,
  SUM(CASE WHEN last_client_message_at IS NULL THEN 1 ELSE 0 END)                       AS sans_last_msg,
  SUM(CASE WHEN last_client_message_at IS NOT NULL
           AND DATE_ADD(last_client_message_at, INTERVAL 24 HOUR) < NOW() THEN 1 ELSE 0
       END)                                                                               AS deja_expirees,
  SUM(CASE WHEN last_client_message_at IS NOT NULL
           AND DATE_ADD(last_client_message_at, INTERVAL 24 HOUR) >= NOW() THEN 1 ELSE 0
       END)                                                                               AS encore_valides
FROM whatsapp_chat
WHERE window_expires_at IS NULL
  AND status IN ('actif', 'en_attente')
  AND deletedAt IS NULL
GROUP BY status;

-- RC-2a : désync session↔cache (session ouverte expirée mais window_expires_at NULL)
SELECT COUNT(*) AS desynced_sessions
FROM whatsapp_chat c
JOIN chat_session s ON s.whatsapp_chat_id = c.id
WHERE c.window_expires_at IS NULL
  AND c.status IN ('actif', 'en_attente')
  AND c.deletedAt IS NULL
  AND s.ended_at IS NULL
  AND s.auto_close_at IS NOT NULL
  AND s.auto_close_at < NOW();

-- RC-2b : sessions zombies (ended_at IS NULL sur chat FERMÉ)
SELECT COUNT(*) AS zombie_sessions
FROM chat_session s
JOIN whatsapp_chat c ON c.id = s.whatsapp_chat_id
WHERE s.ended_at IS NULL
  AND c.status = 'ferme';

-- RC-2c : active_session_id pointant sur une session fermée
SELECT COUNT(*) AS desync_active_session
FROM whatsapp_chat c
JOIN chat_session s ON s.id = c.active_session_id
WHERE c.status IN ('actif', 'en_attente')
  AND s.ended_at IS NOT NULL
  AND c.deletedAt IS NULL;

-- Valeurs d'enum réelles (vérifier la casse)
SELECT DISTINCT status FROM whatsapp_chat LIMIT 10;
```

---

### Étape 1 — Migration de rattrapage complète

**Fichier :** `src/database/migrations/BackfillExpiredWindowsClose1750291200001.ts`

Traite dans l'ordre :
1. Fermer les **sessions zombies** (ended_at IS NULL sur chat FERMÉ)
2. Fermer les **chats actifs/en_attente avec session expirée** (désync RC-2a)
3. Fermer les **chats actifs/en_attente dont la fenêtre calculée est passée** (RC-1 A/B)
4. Recalculer `window_expires_at` pour les **chats encore valides** mais sans cache

```typescript
export class BackfillExpiredWindowsClose1750291200001 implements MigrationInterface {
  name = 'BackfillExpiredWindowsClose1750291200001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('whatsapp_chat'))) return;

    // ── 1. Sessions zombies : fermer les sessions ouvertes sur des chats déjà FERMÉS ──
    if (await queryRunner.hasTable('chat_session')) {
      await queryRunner.query(`
        UPDATE chat_session s
        JOIN whatsapp_chat c ON c.id = s.whatsapp_chat_id
        SET s.ended_at = NOW()
        WHERE s.ended_at IS NULL
          AND c.status = 'ferme'
      `);

      // Nettoyage de cohérence : active_session_id pointant sur une session fermée
      await queryRunner.query(`
        UPDATE whatsapp_chat c
        JOIN chat_session s ON s.id = c.active_session_id
        SET c.active_session_id = NULL
        WHERE s.ended_at IS NOT NULL
          AND c.status IN ('actif', 'en_attente')
          AND c.deletedAt IS NULL
      `);
    }

    // ── 2. Désync RC-2a : session ouverte avec auto_close_at expiré + windowExpiresAt NULL ──
    // → Fermer la session ET le chat
    if (await queryRunner.hasTable('chat_session')) {
      await queryRunner.query(`
        UPDATE whatsapp_chat c
        JOIN chat_session s ON s.whatsapp_chat_id = c.id
        SET s.ended_at          = NOW(),
            c.status            = 'ferme',
            c.window_expires_at = NULL,
            c.active_session_id = NULL,
            c.read_only         = 0
        WHERE c.window_expires_at IS NULL
          AND c.status IN ('actif', 'en_attente')
          AND c.deletedAt IS NULL
          AND s.ended_at IS NULL
          AND s.auto_close_at IS NOT NULL
          AND s.auto_close_at < NOW()
      `);
    }

    // ── 3. RC-1 A/B/C : pas de session, fenêtre calculée depuis last_client_message_at ──
    // → Fermer directement si la fenêtre est passée
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET status            = 'ferme',
          window_expires_at = NULL,
          active_session_id = NULL,
          read_only         = 0
      WHERE window_expires_at IS NULL
        AND status IN ('actif', 'en_attente')
        AND deletedAt IS NULL
        AND (
          last_client_message_at IS NULL
          OR DATE_ADD(last_client_message_at, INTERVAL 24 HOUR) < NOW()
        )
    `);

    // ── 4. Conversations encore valides : recalculer window_expires_at ──
    await queryRunner.query(`
      UPDATE whatsapp_chat
      SET window_expires_at = DATE_ADD(last_client_message_at, INTERVAL 24 HOUR)
      WHERE window_expires_at IS NULL
        AND status IN ('actif', 'en_attente')
        AND last_client_message_at IS NOT NULL
        AND DATE_ADD(last_client_message_at, INTERVAL 24 HOUR) >= NOW()
        AND deletedAt IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Pas de rollback possible pour les fermetures : les conversations fermées ici
    // l'étaient légitimement (fenêtre expirée). On ne les rouvre pas.
  }
}
```

> **Attention :** valider l'étape 0 avant d'appliquer cette migration. Tester sur un dump staging.

---

### Étape 2 — Méthode batch `getChannelIdsToSkipAutoClose()` dans `ChannelService`

**Fichier :** `src/channel/channel.service.ts`

Ajouter à côté de `shouldSkipAutoClose()` :

```typescript
/**
 * Version batch — une seule requête pour N channelIds.
 * Retourne le Set des channelIds à ignorer lors de la fermeture automatique.
 */
async getChannelIdsToSkipAutoClose(channelIds: string[]): Promise<Set<string>> {
  if (channelIds.length === 0) return new Set();
  const channels = await this.channelRepository.find({
    where: channelIds.map((id) => ({ channel_id: id })),
    select: ['channel_id', 'no_close', 'poste_id'],
  });
  return new Set(
    channels
      .filter((ch) => !!ch.no_close || !!ch.poste_id)
      .map((ch) => ch.channel_id),
  );
}
```

---

### Étape 3 — Refactoring de `ReadOnlyEnforcementJob`

**Fichier :** `src/jorbs/read-only-enforcement.job.ts`

Ajouter `Repository<ChatSession>` en injection et réécrire les méthodes.

#### 3a — Deux méthodes de détection

```typescript
/** Cas normal : windowExpiresAt explicitement expiré */
private async findExplicitlyExpiredChats(): Promise<WhatsappChat[]> {
  const now = new Date();
  return this.chatRepo
    .createQueryBuilder('c')
    .where('c.status IN (:...statuses)', {
      statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
    })
    .andWhere('c.windowExpiresAt IS NOT NULL')
    .andWhere('c.windowExpiresAt < :now', { now })
    .andWhere('c.deletedAt IS NULL')
    .getMany();
}

/**
 * Cas orphelins : windowExpiresAt NULL mais fenêtre détectable via :
 *   - la session ouverte dont auto_close_at est expiré (désync cache↔session)
 *   - last_client_message_at + 24h dépassé (pas de session)
 *   - last_client_message_at IS NULL (jamais eu de message client)
 * Exclut les conversations qui ont une session ouverte encore valide
 * (auto_close_at dans le futur) pour ne pas fermer prématurément.
 */
private async findOrphanedExpiredChats(): Promise<WhatsappChat[]> {
  const cutoff = new Date(Date.now() - 24 * 3_600_000);
  const now = new Date();

  // Sous-requête 1 : chats avec session ouverte expirée (désync RC-2a)
  const desynced = await this.chatRepo
    .createQueryBuilder('c')
    .innerJoin(
      'chat_session',
      's',
      's.whatsapp_chat_id = c.id AND s.ended_at IS NULL AND s.auto_close_at < :now',
      { now },
    )
    .where('c.status IN (:...statuses)', {
      statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
    })
    .andWhere('c.windowExpiresAt IS NULL')
    .andWhere('c.deletedAt IS NULL')
    .getMany();

  // Sous-requête 2 : chats sans session active (ou session NULL) dont le délai est dépassé
  const noSession = await this.chatRepo
    .createQueryBuilder('c')
    .where('c.status IN (:...statuses)', {
      statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
    })
    .andWhere('c.windowExpiresAt IS NULL')
    .andWhere('c.deletedAt IS NULL')
    .andWhere(
      // Pas de session ouverte encore valide
      `NOT EXISTS (
        SELECT 1 FROM chat_session s2
        WHERE s2.whatsapp_chat_id = c.id
          AND s2.ended_at IS NULL
          AND s2.auto_close_at >= :now
      )`,
      { now },
    )
    .andWhere(
      '(c.lastClientMessageAt IS NULL OR c.lastClientMessageAt < :cutoff)',
      { cutoff },
    )
    .getMany();

  // Fusion sans doublon
  const seen = new Set<string>();
  const result: WhatsappChat[] = [];
  for (const c of [...desynced, ...noSession]) {
    if (!seen.has(c.id)) { seen.add(c.id); result.push(c); }
  }
  return result;
}
```

#### 3b — `enforce()` : batch skip-check + try-catch individuel + logs détaillés

```typescript
async enforce(): Promise<string> {
  const [explicit, orphaned] = await Promise.all([
    this.findExplicitlyExpiredChats(),
    this.findOrphanedExpiredChats(),
  ]);

  const seen = new Set<string>();
  const chats: WhatsappChat[] = [];
  for (const c of [...explicit, ...orphaned]) {
    if (!seen.has(c.id)) { seen.add(c.id); chats.push(c); }
  }

  this.logger.log(
    `READ_ONLY_ENFORCE candidates=${chats.length} (explicit=${explicit.length} orphaned=${orphaned.length})`,
    ReadOnlyEnforcementJob.name,
  );

  // Batch lookup canaux — 1 seule requête au lieu de N
  const channelIds = [...new Set(
    chats
      .map((c) => c.channel_id ?? c.last_msg_client_channel_id ?? null)
      .filter((id): id is string => id !== null),
  )];
  const skipSet = await this.channelService.getChannelIdsToSkipAutoClose(channelIds);

  let closed = 0, skipped = 0, errors = 0;

  for (const chat of chats) {
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
    if (channelId && skipSet.has(channelId)) {
      skipped++;
      continue;
    }

    try {
      // closeExpiredChatByWindowExpiry clôture la session (ended_at=NOW) ET le chat
      await this.chatSessionService.closeExpiredChatByWindowExpiry(chat.id);
      chat.status = WhatsappChatStatus.FERME;
      chat.windowExpiresAt = null;
      await this.gateway.emitConversationClosed(chat);
      closed++;
    } catch (err) {
      errors++;
      this.logger.error(
        `READ_ONLY_ENFORCE_CLOSE_FAILED chat_id=${chat.chat_id} id=${chat.id}: ${String(err)}`,
        ReadOnlyEnforcementJob.name,
      );
    }
  }

  if (chats.length > 0 && closed === 0) {
    this.consecutiveZeroClosures++;
    if (this.consecutiveZeroClosures >= 3) {
      this.logger.warn(
        `READ_ONLY_ENFORCE_STALLED candidates=${chats.length} closed=0 skipped=${skipped} errors=${errors} cycles=${this.consecutiveZeroClosures}`,
        ReadOnlyEnforcementJob.name,
      );
    }
  } else {
    this.consecutiveZeroClosures = 0;
  }

  return `${closed} conversation(s) fermée(s)${skipped > 0 ? ` (${skipped} ignorée(s))` : ''}${errors > 0 ? ` [${errors} erreur(s)]` : ''}`;
}
```

#### 3c — `preview()` : même refactoring

```typescript
async preview(): Promise<ReadOnlyEnforcementPreview> {
  const [explicit, orphaned] = await Promise.all([
    this.findExplicitlyExpiredChats(),
    this.findOrphanedExpiredChats(),
  ]);
  const seen = new Set<string>();
  const chats: WhatsappChat[] = [];
  for (const c of [...explicit, ...orphaned]) {
    if (!seen.has(c.id)) { seen.add(c.id); chats.push(c); }
  }

  const channelIds = [...new Set(
    chats
      .map((c) => c.channel_id ?? c.last_msg_client_channel_id ?? null)
      .filter((id): id is string => id !== null),
  )];
  const skipSet = await this.channelService.getChannelIdsToSkipAutoClose(channelIds);

  const eligible = chats.filter((c) => {
    const cid = c.channel_id ?? c.last_msg_client_channel_id ?? null;
    return !(cid && skipSet.has(cid));
  });

  return {
    total: eligible.length,
    conversations: eligible.map((c) => ({
      chat_id: c.chat_id,
      name: c.name,
      status: c.status,
      last_activity_at: c.last_activity_at,
      idle_hours: c.last_client_message_at
        ? Math.floor((Date.now() - new Date(c.last_client_message_at).getTime()) / 3_600_000)
        : -1,
    })),
  };
}
```

---

### Étape 4 — Vérification de `closeExpiredChatByWindowExpiry()`

**Fichier :** `src/chat-session/chat-session.service.ts`

La méthode actuelle (lignes 311-328) est déjà correcte : elle clôture toutes les sessions ouvertes
du chat (`ended_at IS NULL`) dans une transaction, puis met le chat à `FERME`. Aucune modification
nécessaire pour le cas normal.

Vérifier cependant que le comportement est idempotent pour le cas orphelin :
- Si `active_session_id = NULL` mais qu'une session fantôme existe (`ended_at IS NULL`) → la requête
  `WHERE whatsapp_chat_id = :id AND ended_at IS NULL` la clôture quand même. ✅
- Si aucune session n'existe → la mise à jour `chat_session` affecte 0 lignes (idempotent). ✅
- Si le chat est déjà `FERME` → la mise à jour `whatsapp_chat` applique les mêmes valeurs (idempotent). ✅

---

### Étape 5 — Tests

**Fichier :** `src/jorbs/read-only-enforcement.job.spec.ts`

Cas à ajouter :

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Chat ACTIF, `windowExpiresAt = NULL`, `lastClientMessageAt > 24h` | Fermé |
| 2 | Chat ACTIF, `windowExpiresAt = NULL`, `lastClientMessageAt = NULL` | Fermé |
| 3 | Chat ACTIF, `windowExpiresAt = NULL`, session ouverte `auto_close_at` expiré | Fermé (RC-2a) |
| 4 | Chat ACTIF, `windowExpiresAt = NULL`, session ouverte `auto_close_at` futur | NON fermé |
| 5 | Chat ACTIF, `windowExpiresAt = NULL`, `lastClientMessageAt < 24h`, pas de session | NON fermé |
| 6 | Exception sur chat n°2 d'une liste de 4 | Chats 3 et 4 quand même traités |
| 7 | `getChannelIdsToSkipAutoClose` appelé exactement 1 fois pour 10 chats | 1 seul appel |

---

## Ordre d'exécution recommandé

```
1. Étape 0 — SQL audit (immédiat, sans risque)
   → Vérifier les counts pour RC-1, RC-2a, RC-2b, RC-2c

2. Étape 2 — getChannelIdsToSkipAutoClose dans ChannelService

3. Étape 3 — Refactoring ReadOnlyEnforcementJob
   (findExplicitlyExpiredChats + findOrphanedExpiredChats + enforce/preview)

4. Étape 5 — Tests

5. Déployer en staging
   → Vérifier les logs : candidates=X (explicit=Y orphaned=Z)
   → Vérifier que les conversations visibles en preview correspondent aux attentes

6. Étape 1 — Migration de rattrapage (APRÈS validation staging)
   → Séquence interne : zombies → désync → expirés → recalcul
```

> L'étape 1 est la plus impactante (ferme des conversations en masse et clôture des sessions).
> Elle doit être appliquée en dernier, une fois le comportement du cron refactorisé validé.

---

## Résumé des fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/channel/channel.service.ts` | +`getChannelIdsToSkipAutoClose()` |
| `src/jorbs/read-only-enforcement.job.ts` | Refactoring complet `enforce()`, `preview()`, split détection |
| `src/jorbs/read-only-enforcement.job.spec.ts` | 7 nouveaux cas de test |
| `src/database/migrations/BackfillExpiredWindowsClose1750291200001.ts` | Nouvelle migration (zombies + désync + expirés + recalcul) |
