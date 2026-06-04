# PLAN : Section J (Window Reminder) + Fermeture CTWA differenciee + Edge cases

> Date : 2026-06-03 — mis a jour 2026-06-04
> Branche : `production`

---

## 0. Epic 0 — Entite `ChatSession` (fondation architecturale)

### Regle fondamentale (a inscrire dans tout le code)

> **`ChatSession` = source de verite pour la session courante.**
> **`WhatsappChat` = table historique/compatibilite, jamais supprimee, jamais amputee.**
> Certains champs de `WhatsappChat` sont des **caches synchronises** depuis la session active.
> Tous les jobs NOUVEAUX doivent lire `ChatSession`. Les jobs existants (A, E…) lisent
> `WhatsappChat` (cache) — aucune modification requise sur eux.

### Probleme fondamental

`WhatsappChat.isCtwa` est aujourd'hui un booleen permanent lie au chat, jamais reinitialise.
Un client ayant clique sur une pub Meta une seule fois aura `isCtwa = true` a vie, ce qui lui
donnerait une fenetre 72h sur tous ses futurs echanges directs sans pub — comportement incorrect.

La cause racine : 1 client = 1 `WhatsappChat` (permanent), mais `isCtwa` est une propriete
de la **session** (ephemere), pas du chat.

### Solution : separer chat et session

| Entite | Role | Modifie quand ? |
|---|---|---|
| `WhatsappChat` | Historique permanent, retrocompatibilite | Cache synchronise depuis `ChatSession` active |
| `ChatSession` | Source de verite session | A chaque message entrant, ouverture, fermeture |

**Regles metier :**
- 1 client → 1 `WhatsappChat` → N `ChatSession`
- Une session s'ouvre quand le client envoie un message sans session active en cours
- Une session se ferme quand le chat passe en `fermé` (`read-only-enforcement`)
- `ChatSession.isCtwa = true` si le message d'ouverture contient un referral Meta
- `WhatsappChat.isCtwa` = cache de `ChatSession.isCtwa` (mis a jour transactionnellement)

### Champs synchronises (miroirs dans `WhatsappChat`)

| Champ `ChatSession` (source) | Miroir `WhatsappChat` (cache) | Mis a jour quand |
|---|---|---|
| `isCtwa` | `isCtwa` | Ouverture / upgrade CTWA |
| `lastClientMessageAt` | `last_client_message_at` | Chaque message client |
| `serviceWindowExpiresAt` | *(pas de miroir)* | Chaque message client |
| `freeEntryExpiresAt` | *(pas de miroir)* | Ouverture session CTWA uniquement |
| `autoCloseAt` | *(pas de miroir — lue directement dans ChatSession)* | Chaque message client |
| `lastWindowReminderSentAt` | `last_window_reminder_sent_at` | Apres envoi J |

> **Note sur `last_window_reminder_sent_at` dans `WhatsappChat`** :
> Ce champ est conserve dans `WhatsappChat` pour retrocompatibilite (ne pas le supprimer).
> La source de verite reste `ChatSession.lastWindowReminderSentAt`.
> Le job J ecrit les deux en meme temps via transaction.

### Entite `ChatSession`

**Fichier a creer :** `message_whatsapp/src/chat-session/entities/chat-session.entity.ts`

```typescript
@Entity('chat_session')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'whatsapp_chat_id', type: 'char', length: 36 })
  whatsappChatId: string;                     // FK vers WhatsappChat.id (UUID PK)

  @ManyToOne(() => WhatsappChat)
  @JoinColumn({ name: 'whatsapp_chat_id', referencedColumnName: 'id' })
  chat: WhatsappChat;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true, default: null })
  endedAt: Date | null;

  @Column({ name: 'is_ctwa', type: 'boolean', default: false })
  isCtwa: boolean;

  /** ID du referral Meta (body.referral.source_id) si CTWA */
  @Column({ name: 'ctwa_referral_id', type: 'varchar', length: 255, nullable: true, default: null })
  ctwaReferralId: string | null;

  /** Nom de la campagne Meta si disponible */
  @Column({ name: 'campaign_name', type: 'varchar', length: 255, nullable: true, default: null })
  campaignName: string | null;

  /** URL de l'image de la campagne Meta (affichable dans le chat) */
  @Column({ name: 'campaign_image_url', type: 'varchar', length: 1024, nullable: true, default: null })
  campaignImageUrl: string | null;

  /** Dernier message client dans cette session (source de verite — miroir dans WhatsappChat.last_client_message_at) */
  @Column({ name: 'last_client_message_at', type: 'datetime', nullable: true, default: null })
  lastClientMessageAt: Date | null;

  /** Dernier message commercial dans cette session — optionnel, evite un COUNT(*) pour J1/J2 */
  @Column({ name: 'last_poste_message_at', type: 'datetime', nullable: true, default: null })
  lastPosteMessageAt: Date | null;

  /**
   * Expiration de la fenetre de service (24h depuis lastClientMessageAt, toujours).
   * Reinitialisee a chaque message client. Represente "quand le commercial perd le droit de repondre".
   * Si le client repond a J, cette date est repoussee de 24h.
   */
  @Column({ name: 'service_window_expires_at', type: 'datetime', nullable: true, default: null })
  serviceWindowExpiresAt: Date | null;

  /**
   * Avantage 72h CTWA : defini a l'ouverture de session (startedAt + 72h), jamais mis a jour.
   * Null si la session n'est pas CTWA.
   * Permet au commercial de repondre jusqu'a 72h apres le premier message pub, independamment
   * de quand le client a repondu pour la derniere fois.
   */
  @Column({ name: 'free_entry_expires_at', type: 'datetime', nullable: true, default: null })
  freeEntryExpiresAt: Date | null;

  /**
   * Date de fermeture automatique calculee :
   *   isCtwa : max(serviceWindowExpiresAt, freeEntryExpiresAt)
   *   normal : serviceWindowExpiresAt
   * Mise a jour par ChatSessionService a chaque message client.
   * Lue par read-only-enforcement et par le job J.
   */
  @Column({ name: 'auto_close_at', type: 'datetime', nullable: true, default: null })
  autoCloseAt: Date | null;

  /** Tracking du rappel J (source de verite — miroir conserve dans WhatsappChat.last_window_reminder_sent_at) */
  @Column({ name: 'last_window_reminder_sent_at', type: 'datetime', nullable: true, default: null })
  lastWindowReminderSentAt: Date | null;
}
```

### Champ a ajouter sur `WhatsappChat`

```typescript
/** Ref vers la ChatSession active — null si chat fermé. Cache uniquement, source dans ChatSession. */
@Column({ name: 'active_session_id', type: 'char', length: 36, nullable: true, default: null })
activeSessionId: string | null;
```

`WhatsappChat.isCtwa`, `last_client_message_at`, `last_window_reminder_sent_at` sont **conserves**
(caches synchronises via `ChatSessionService`, jamais ecrits directement par les jobs).

### Cycle de vie

| Evenement | Action (toujours transactionnel via `ChatSessionService`) |
|---|---|
| Message client, pas de session active | Creer `ChatSession` : `serviceWindowExpiresAt = now+24h`, `freeEntryExpiresAt = now+72h` si CTWA, `autoCloseAt = max(...)` + sync `WhatsappChat` (isCtwa, activeSessionId, last_client_message_at) |
| Message client, session active en cours | Mettre a jour `lastClientMessageAt` + recalculer `serviceWindowExpiresAt` + recalculer `autoCloseAt` + sync `WhatsappChat.last_client_message_at` |
| **Message client avec referral Meta, session normale active** | **Upgrade isCtwa = true** + calculer `freeEntryExpiresAt = now+72h` + recalculer `autoCloseAt` + sync `WhatsappChat.isCtwa = true` |
| Message commercial (poste) | Mettre a jour `ChatSession.lastPosteMessageAt` (evite un COUNT pour J1/J2) |
| Chat passe en `fermé` | `ChatSession.endedAt = NOW()` + `WhatsappChat.activeSessionId = null` |
| Job J envoie le rappel | `markWindowReminderSent()` : `ChatSession.lastWindowReminderSentAt = NOW()` + sync `WhatsappChat.last_window_reminder_sent_at` (transaction) |

### Scenarios de fermeture et reouverture (a documenter et tester)

| Scenario | Comportement |
|---|---|
| **J envoye, client ne repond pas avant `autoCloseAt`** | `read-only-enforcement` ferme la session + chat (`status = fermé`). Chat reste dans l'historique. |
| **Client repond apres fermeture** | Nouveau message entrant → `openSession()` cree une NOUVELLE session. Pas de referral Meta → `isCtwa = false`, `serviceWindowExpiresAt = now+24h`. Pas de `freeEntryExpiresAt` (avantage CTWA lie a la session precedente, non reporte). |
| **Client repond avant fermeture** | `onClientMessage()` → `serviceWindowExpiresAt = lastMsg + 24h` + recalcul `autoCloseAt`. Fenetre prolongee. J pourra etre renvoye dans un nouveau cycle si `autoCloseAt` s'approche a nouveau. |

### Regle critique : `freeEntryExpiresAt` n'est JAMAIS incremente

`freeEntryExpiresAt` est calcule UNE SEULE FOIS a l'ouverture de session et ne change plus jamais.
Seul `serviceWindowExpiresAt` est mis a jour a chaque message client (+TTL_NORMAL depuis lastClientMessageAt).

**Consequence naturelle :** si le client envoie un message proche de la fin du CTWA window,
`serviceWindowExpiresAt` peut depasser `freeEntryExpiresAt`, ce qui etend `autoCloseAt` au-dela du CTWA.

| Moment du message client (depuis T0) | serviceWindowExpiresAt | freeEntryExpiresAt | autoCloseAt |
|---|---|---|---|
| T0+1h (debut CTWA) | T0+25h | T0+72h | T0+72h |
| T0+47h (25h restantes) | T0+71h | T0+72h | T0+72h |
| T0+52h (20h restantes) | T0+76h | T0+72h | **T0+76h** (+4h au-dela CTWA) |
| T0+68h (4h restantes) | T0+92h | T0+72h | **T0+92h** (+20h au-dela CTWA) |

> C'est un comportement intentionnel et coherent avec les regles WhatsApp (fenetre service = 24h depuis
> dernier message client, sans cap). Apres `freeEntryExpiresAt`, les messages dans la session sont
> facturas (plus de pricing CTWA gratuit), mais techniquement possibles si `serviceWindowExpiresAt` est valide.

### Patron de synchronisation — ChatSessionService (transactionnel)

**Ne pas utiliser `@BeforeInsert` / `@BeforeUpdate`** pour synchroniser vers `WhatsappChat` :
- Non declenche par `QueryBuilder.update()` ni `repository.update()`
- Pas d'injection de service dans une entite
- Comportement silencieux difficile a debugger

**Pattern recommande dans `ChatSessionService` :**

```typescript
/** Ouvre une nouvelle session. whatsappChatId = WhatsappChat.id (UUID PK). */
async openSession(whatsappChatId: string, isCtwa: boolean, referral?: ReferralData): Promise<ChatSession> {
  return this.dataSource.transaction(async (manager) => {
    // Verrou row-level : empeche deux messages simultanes de creer deux sessions
    const chat = await manager
      .createQueryBuilder(WhatsappChat, 'c')
      .setLock('pessimistic_write')          // SELECT ... FOR UPDATE
      .where('c.id = :id', { id: whatsappChatId })
      .getOneOrFail();

    // Si une session est deja active (creee par un message concurrent), la retourner
    if (chat.activeSessionId) {
      const existing = await manager.findOne(ChatSession, { where: { id: chat.activeSessionId } });
      if (existing && !existing.endedAt) return existing;
    }

    const now = new Date();
    const serviceWindowMs = 24 * 3_600_000;                        // toujours 24h
    const freeEntryMs     = isCtwa ? 72 * 3_600_000 : null;        // 72h si CTWA, sinon null
    const serviceExp      = new Date(now.getTime() + serviceWindowMs);
    const freeExp         = freeEntryMs ? new Date(now.getTime() + freeEntryMs) : null;
    // autoCloseAt = fermeture effective
    const autoCloseAt     = freeExp && freeExp > serviceExp ? freeExp : serviceExp;

    const session = manager.create(ChatSession, {
      whatsappChatId,
      startedAt: now,
      isCtwa,
      ctwaReferralId: referral?.sourceId ?? null,
      campaignName: referral?.campaignName ?? null,
      campaignImageUrl: referral?.imageUrl ?? null,
      lastClientMessageAt: now,
      serviceWindowExpiresAt: serviceExp,
      freeEntryExpiresAt: freeExp,
      autoCloseAt,
    });
    const saved = await manager.save(ChatSession, session);

    await manager.update(WhatsappChat, { id: whatsappChatId }, {
      activeSessionId: saved.id,
      isCtwa,
      last_client_message_at: now,
    });

    return saved;
  });
}

/**
 * Appele a chaque message client entrant dans une session active.
 * Charge la session pour lire isCtwa — ne pas le passer en parametre pour eviter
 * de recalculer la fenetre avec le mauvais type.
 * Si referral present et session non-CTWA : upgrade de la session en CTWA.
 */
async onClientMessage(sessionId: string, whatsappChatId: string, referral?: ReferralData): Promise<void> {
  return this.dataSource.transaction(async (manager) => {
    const session = await manager.findOneOrFail(ChatSession, { where: { id: sessionId } });
    const now = new Date();

    // Upgrade CTWA si referral present sur une session normale
    const becomeCtwa = !session.isCtwa && !!referral?.sourceId;
    const isCtwa = session.isCtwa || becomeCtwa;

    const serviceExp  = new Date(now.getTime() + 24 * 3_600_000);
    // freeEntryExpiresAt ne change pas apres son calcul initial (avantage fixe a l'entree)
    const freeExp     = becomeCtwa
      ? new Date(now.getTime() + 72 * 3_600_000)  // upgrade : calcule la date CTWA
      : session.freeEntryExpiresAt;
    const autoCloseAt = freeExp && freeExp > serviceExp ? freeExp : serviceExp;

    await manager.update(ChatSession, { id: sessionId }, {
      ...(becomeCtwa ? { isCtwa: true, ctwaReferralId: referral!.sourceId, freeEntryExpiresAt: freeExp } : {}),
      lastClientMessageAt: now,
      serviceWindowExpiresAt: serviceExp,
      autoCloseAt,
    });

    await manager.update(WhatsappChat, { id: whatsappChatId }, {
      ...(becomeCtwa ? { isCtwa: true } : {}),
      last_client_message_at: now,
    });
  });
}

async onPosteMessage(sessionId: string): Promise<void> {
  await this.sessionRepo.update({ id: sessionId }, { lastPosteMessageAt: new Date() });
}

/** Ferme uniquement la session (reouverture manuelle, sans fermer le chat). */
async closeSession(sessionId: string, whatsappChatId: string): Promise<void> {
  return this.dataSource.transaction(async (manager) => {
    await manager.update(ChatSession, { id: sessionId }, { endedAt: new Date() });
    await manager.update(WhatsappChat, { id: whatsappChatId }, { activeSessionId: null });
  });
}

/**
 * Ferme la session ET le chat en une seule transaction (pour read-only-enforcement).
 * Le websocket est emis APRES le commit pour eviter d'emettre sur une transaction non commitee.
 * chatBusinessId = WhatsappChat.chat_id (identifiant metier Whapi).
 */
async closeExpiredSessionAndChat(sessionId: string, whatsappChatId: string, chatBusinessId: string): Promise<void> {
  return this.dataSource.transaction(async (manager) => {
    await manager.update(ChatSession, { id: sessionId }, { endedAt: new Date() });
    // read_only = false a la fermeture (comportement existant — verifie dans le cron actuel)
    await manager.update(WhatsappChat, { id: whatsappChatId }, {
      activeSessionId: null,
      status: WhatsappChatStatus.FERME,
      read_only: false,
    });
  });
  // Websocket ici (apres commit) — meme pattern que l'implementation existante
}

/**
 * Marque atomiquement le rappel J envoye dans la session et dans le miroir WhatsappChat.
 * Retourne false si deja marque par une autre instance (anti-concurrence).
 */
async markWindowReminderSent(sessionId: string, whatsappChatId: string): Promise<boolean> {
  return this.dataSource.transaction(async (manager) => {
    const now = new Date();
    const result = await manager
      .createQueryBuilder()
      .update(ChatSession)
      .set({ lastWindowReminderSentAt: now })
      .where('id = :id', { id: sessionId })
      .andWhere('(last_window_reminder_sent_at IS NULL OR last_window_reminder_sent_at < last_client_message_at)')
      .execute();

    if (!result.affected) return false;

    await manager.update(WhatsappChat, { id: whatsappChatId }, {
      last_window_reminder_sent_at: now,
    });
    return true;
  });
}
```

### Impact sur les autres epics

- **Epic 1 (J)** : `lastWindowReminderSentAt`, `serviceWindowExpiresAt`, `freeEntryExpiresAt`, `autoCloseAt` vivent dans `ChatSession`
- **Epic 2 (fermeture CTWA)** : `read-only-enforcement` lit `ChatSession.autoCloseAt` directement
- **Jobs existants (A, E)** : lisent encore `WhatsappChat.isCtwa` (cache) — **pas de changement requis**
- **Frontend/Admin** : peuvent afficher `campaignName` + `campaignImageUrl` par session — nouvelle fonctionnalite gratuite

### Migration

**Nom :** `AddChatSessionEntity1780531200000` (a executer avant les migrations Section J et CronFields)

```sql
-- chat_id dans WhatsappChat = VARCHAR(100), PK = id CHAR(36)
-- Le UNIQUE est composite (tenant_id, chat_id) donc chat_id seul n'est pas unique
-- → FK reference WhatsappChat.id (UUID PK), pas chat_id

CREATE TABLE chat_session (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  whatsapp_chat_id CHAR(36) NOT NULL,          -- FK vers whatsapp_chat.id (UUID PK)
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL DEFAULT NULL,
  is_ctwa TINYINT(1) NOT NULL DEFAULT 0,
  ctwa_referral_id VARCHAR(255) NULL DEFAULT NULL,
  campaign_name VARCHAR(255) NULL DEFAULT NULL,
  campaign_image_url VARCHAR(1024) NULL DEFAULT NULL,
  last_client_message_at DATETIME NULL DEFAULT NULL,
  last_poste_message_at DATETIME NULL DEFAULT NULL,
  service_window_expires_at DATETIME NULL DEFAULT NULL,   -- lastClientMessageAt + 24h
  free_entry_expires_at DATETIME NULL DEFAULT NULL,       -- startedAt + 72h si CTWA, sinon NULL
  auto_close_at DATETIME NULL DEFAULT NULL,               -- max(service, free_entry) ou service seul
  last_window_reminder_sent_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT FK_chat_session_whatsapp_chat FOREIGN KEY (whatsapp_chat_id)
    REFERENCES whatsapp_chat(id) ON DELETE CASCADE
);

CREATE INDEX IDX_chat_session_active   ON chat_session (whatsapp_chat_id, ended_at);
CREATE INDEX IDX_chat_session_window   ON chat_session (auto_close_at, last_window_reminder_sent_at);

ALTER TABLE whatsapp_chat
  ADD COLUMN active_session_id CHAR(36) NULL DEFAULT NULL;

-- Backfill : creer une session initiale pour tous les chats non fermés
-- Notes :
--   WhatsappChatStatus.FERME = 'fermé' (avec accent)
--   La colonne SQL de createdAt dans whatsapp_chat est 'createdAt' (pas 'created_at')
-- service_window_expires_at = toujours lastClientMessageAt + 24h
-- free_entry_expires_at     = startedAt + 72h si CTWA, sinon NULL
-- auto_close_at             = max(service, free_entry) ou service seul
INSERT INTO chat_session (
  id, whatsapp_chat_id, started_at, is_ctwa, last_client_message_at,
  service_window_expires_at, free_entry_expires_at, auto_close_at
)
SELECT UUID(), wc.id,
  COALESCE(wc.last_client_message_at, wc.createdAt),
  wc.is_ctwa,
  wc.last_client_message_at,
  -- service window : 24h depuis dernier msg client
  DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 24 HOUR),
  -- free entry : 72h depuis debut session si CTWA, sinon NULL
  CASE WHEN wc.is_ctwa = 1
    THEN DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 72 HOUR)
    ELSE NULL
  END,
  -- auto_close : max des deux
  CASE WHEN wc.is_ctwa = 1
    THEN GREATEST(
      DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 24 HOUR),
      DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 72 HOUR)
    )
    ELSE DATE_ADD(COALESCE(wc.last_client_message_at, wc.createdAt), INTERVAL 24 HOUR)
  END
FROM whatsapp_chat wc
WHERE wc.status != 'fermé';

-- Lier les chats a leur session backfillee
UPDATE whatsapp_chat wc
  INNER JOIN chat_session cs ON cs.whatsapp_chat_id = wc.id AND cs.ended_at IS NULL
  SET wc.active_session_id = cs.id
WHERE wc.status != 'fermé';
```

### Nouveau fichier a creer

| Fichier | Description |
|---|---|
| `src/chat-session/entities/chat-session.entity.ts` | Entite TypeORM |
| `src/chat-session/chat-session.service.ts` | `openSession()`, `closeSession()`, `getActiveSession()` |
| `src/chat-session/chat-session.module.ts` | Module NestJS |

### Points a decider avant implementation

1. **Referral Meta** : identifier le champ exact dans le payload Whapi qui indique un clic pub
   (probablement `message.referral.source_id` ou similaire). A verifier dans la doc Whapi.

2. **`WhatsappChat.last_window_reminder_sent_at`** : **a conserver** (retrocompatibilite).
   Ne pas supprimer. Le job J ecrit les deux (ChatSession + WhatsappChat) en meme transaction.

3. **Session unique active par chat** : garantir via logique applicative dans `ChatSessionService`
   (verifier `activeSessionId IS NULL` avant de creer une nouvelle session). Un index
   `PARTIAL UNIQUE` n'est pas supporte par MySQL — utiliser un index fonctionnel ou simplement
   faire confiance a la logique de service.

4. **Nom de colonne FK dans ChatSession** : convention alignee — `whatsappChatId` (property)
   avec `name: 'whatsapp_chat_id'` (colonne SQL). Confirmer que ca ne cree pas de conflit avec
   les autres entites du projet.

5. **`minReplies > 1`** : **Decision prise — limiter a 1 en UI.**
   Le job J utilise `lastPosteMessageAt >= lastClientMessageAt` comme proxy pour "au moins 1 reponse".
   Cela ne couvre pas `minReplies > 1`. Pour eviter la complexite d'un COUNT conditionnel,
   le champ admin sera verrouille a max 1 (input type="number" max="1"). Si le besoin evolue,
   un COUNT sera ajoute a ce moment-la.

6. **Lecture TTL dans ChatSessionService** : **Decision prise — injecter `CronConfigService`.**
   `ChatSessionService` lit `ttlDays` (defaut 24h) et `ttlDaysCtwa` (defaut 72h) depuis la cle
   `read-only-enforcement` pour calculer `serviceWindowExpiresAt` et `freeEntryExpiresAt`.
   Cela garantit que les TTL configures en admin sont effectivement utilises — evite d'avoir
   des valeurs hardcodees qui divergent de ce que l'admin affiche.

---

## 1. Contexte et etat actuel

### Fenetres de messagerie existantes (deja implementees)

| Type client | Fenetre messagerie | Fermeture actuelle |
|---|---|---|
| Normal (`isCtwa = false`) | 24h (serviceWindowExpiresAt) | 24h (uniforme) |
| Pub Meta (`isCtwa = true`) | 72h | 24h (BUG — trop court) |

Le job `auto-message-master` differencie deja les deux fenetres pour les triggers A et E
(fichier `src/jorbs/auto-message-master.job.ts`).

Le job `read-only-enforcement` utilise un seuil uniforme de 24h sans tenir compte de `isCtwa`.

### Triggers auto-message existants

| Section | Cle enum | Description |
|---|---|---|
| A | `NO_RESPONSE` | Sans reponse du commercial |
| C | `OUT_OF_HOURS` | Hors horaires |
| D | `REOPENED` | Reouverture |
| E | `QUEUE_WAIT` | Attente en queue |
| F | `KEYWORD` | Mot-cle detecte |
| G | `CLIENT_TYPE` | Nouveau / regulier |
| H | `INACTIVITY` | Inactivite totale |
| I | `ON_ASSIGN` | Apres assignation |
| **J** | **`WINDOW_REMINDER`** | **A creer : rappel avant expiration fenetre** |

---

## 2. Epic 1 — Section J : WINDOW_REMINDER

### Objectif metier du rappel J — "Reactivation avant expiration"

J n'est **pas** un simple message d'information "la conversation va se fermer".
Son objectif metier est d'**inciter le client a repondre** pour :
1. Renouveler la fenetre de service (`serviceWindowExpiresAt = now + 24h`)
2. Permettre au commercial de continuer en message libre sans template HSM
3. Eviter une fermeture involontaire quand le client est encore interactif

Si le client repond a J :
- `ChatSession.lastClientMessageAt` est mis a jour
- `serviceWindowExpiresAt` est recalcule (`+ 24h`)
- `autoCloseAt` est recalcule (potentiellement repousse)
- J peut etre renvoyable dans un nouveau cycle si la fenetre approche a nouveau

**Regle de contenu obligatoire :** Le template J doit poser une question ou proposer une
action courte pour provoquer une reponse. Un message purement informatif ne prolonge rien.

> Exemples acceptables :
> - "Souhaitez-vous continuer avec un conseiller ? Repondez OUI."
> - "Avez-vous d'autres questions ? Nous sommes disponibles."
>
> Exemples a eviter :
> - "Votre conversation va se fermer dans 10 minutes." *(informatif, pas de call-to-action)*

### Principe fonctionnel

Envoyer un message de **reactivation avant expiration** dans les dernieres minutes/heures
avant `autoCloseAt`, pour inciter le client a repondre et prolonger la fenetre de service.

| Type client | Plage declenchement | Configurable |
|---|---|---|
| Normal (`isCtwa = false`) | `autoCloseAt` dans 10min a 2h | Oui (en minutes avant fermeture) |
| Pub Meta (`isCtwa = true`) | `autoCloseAt` dans 10min a 4h | Oui (en minutes avant fermeture) |

> `autoCloseAt = max(serviceWindowExpiresAt, freeEntryExpiresAt)` pour CTWA,
> `autoCloseAt = serviceWindowExpiresAt` (= `lastClientMessageAt + 24h`) pour normal.

### Deux variantes mutuellement exclusives

Pour chaque conversation eligible, UN SEUL des deux messages est envoye :

| Variante | Cle | Condition | Description |
|---|---|---|---|
| **J1** | `with_replies` | Commercial a envoye >= N messages dans la conversation | Rappel "votre agent est disponible" |
| **J2** | `no_replies` | Commercial a envoye < N messages | Rappel "votre demande attend" |

Le seuil N (`min_replies_for_j1`) est configurable par l'admin (defaut : 1).

Un seul envoi par session client : une fois J envoye, il n'est pas renvoye tant que
`last_window_reminder_sent_at >= last_client_message_at`.

---

### US 1.1 — Enum + champ tracking + colonne differenciateur

#### 1.1.a — Enum `AutoMessageTriggerType`
**Fichier :** `message_whatsapp/src/message-auto/entities/message-auto.entity.ts`

Ajouter dans l'enum :
```typescript
WINDOW_REMINDER = 'window_reminder',
```

#### 1.1.b — Champ tracking sur `WhatsappChat`
**Fichier :** `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Ajouter la colonne :
```typescript
@Column({ name: 'last_window_reminder_sent_at', type: 'datetime', nullable: true, default: null })
lastWindowReminderSentAt: Date | null;
```

#### 1.1.c — Colonne differenciateur sur `MessageAuto`
**Fichier :** `message_whatsapp/src/message-auto/entities/message-auto.entity.ts`

Ajouter la colonne (null = applicable a tous les triggers, pas seulement J) :
```typescript
@Column({
  name: 'window_reminder_target',
  type: 'enum',
  enum: ['with_replies', 'no_replies'],
  nullable: true,
  default: null,
})
windowReminderTarget?: 'with_replies' | 'no_replies' | null;
```

---

### US 1.2 — Migration SQL (section J)

**Nom :** `AddWindowReminderSection1780531200001`

```sql
-- 1. Nouvelle valeur dans l'enum trigger_type
ALTER TABLE messages_predefinis
  MODIFY COLUMN trigger_type ENUM(
    'sequence','no_response','out_of_hours','reopened','queue_wait',
    'keyword','client_type','inactivity','on_assign','window_reminder'
  ) NOT NULL DEFAULT 'sequence';

-- 2. Colonne differenciateur sur messages_predefinis
ALTER TABLE messages_predefinis
  ADD COLUMN window_reminder_target ENUM('with_replies','no_replies') NULL DEFAULT NULL
  AFTER client_type_target;

-- 3. Colonne tracking sur whatsapp_chat
ALTER TABLE whatsapp_chat
  ADD COLUMN last_window_reminder_sent_at DATETIME NULL DEFAULT NULL;

-- Index pour le job (recherche par plage horaire)
CREATE INDEX IDX_chat_window_reminder
  ON whatsapp_chat (is_ctwa, last_client_message_at, last_window_reminder_sent_at);
```

---

### US 1.3 — Nouveaux champs CronConfig

**Fichier :** `message_whatsapp/src/jorbs/entities/cron-config.entity.ts`

Ajouter les colonnes (section dediee `window-reminder-auto-message`) :

```typescript
// ──────────── Champs window-reminder-auto-message ────────────────────────

/** Minutes restantes avant autoCloseAt pour commencer J (normal — defaut 10min) */
@Column({ name: 'window_reminder_normal_start_min', type: 'int', nullable: true })
windowReminderNormalStartMin: number | null;

/** Minutes restantes avant autoCloseAt pour arreter J (normal — defaut 120 = 2h) */
@Column({ name: 'window_reminder_normal_end_min', type: 'int', nullable: true })
windowReminderNormalEndMin: number | null;

/** Minutes restantes avant autoCloseAt pour commencer J (CTWA — defaut 10min) */
@Column({ name: 'window_reminder_ctwa_start_min', type: 'int', nullable: true })
windowReminderCtwaStartMin: number | null;

/** Minutes restantes avant autoCloseAt pour arreter J (CTWA — defaut 240 = 4h) */
@Column({ name: 'window_reminder_ctwa_end_min', type: 'int', nullable: true })
windowReminderCtwaEndMin: number | null;

/** Nombre minimum de messages commerciaux pour qualifier J1 (defaut 1) */
@Column({ name: 'window_reminder_min_replies', type: 'int', nullable: true })
windowReminderMinReplies: number | null;

/** TTL fermeture pour conversations CTWA — valeur en HEURES malgre le nom (coherence avec ttlDays existant qui est aussi en heures). Defaut 72. */
@Column({ name: 'ttl_days_ctwa', type: 'int', nullable: true })
ttlDaysCtwa: number | null;
```

**Migration :** `AddWindowReminderCronFields1780531200002`

```sql
ALTER TABLE cron_config
  ADD COLUMN window_reminder_normal_start_min INT NULL,
  ADD COLUMN window_reminder_normal_end_min INT NULL,
  ADD COLUMN window_reminder_ctwa_start_min INT NULL,
  ADD COLUMN window_reminder_ctwa_end_min INT NULL,
  ADD COLUMN window_reminder_min_replies INT NULL,
  ADD COLUMN ttl_days_ctwa INT NULL;

-- Seed : entree de config pour le nouveau trigger
INSERT INTO cron_config
  (id, `key`, label, description, enabled, schedule_type,
   window_reminder_normal_start_min, window_reminder_normal_end_min,
   window_reminder_ctwa_start_min, window_reminder_ctwa_end_min,
   window_reminder_min_replies)
VALUES (
  UUID(), 'window-reminder-auto-message',
  'J — Reactivation avant expiration',
  'Envoie une reactivation avant fermeture automatique (normal: 10min-2h, CTWA: 10min-4h avant autoCloseAt)',
  true, 'config',
  10, 120, 10, 240, 1
);

-- Mise a jour de read-only-enforcement pour CTWA TTL
UPDATE cron_config
  SET ttl_days_ctwa = 72
  WHERE `key` = 'read-only-enforcement';
```

---

### US 1.4 — Job handler `runWindowReminder`

**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

#### Enregistrement dans le job maitre

Ajouter dans `run()` au meme niveau que les autres triggers :
```typescript
await this.safeRun('J-window-reminder', () => this.runWindowReminder());
```

#### Dependances a ajouter dans `AutoMessageMasterJob`

```typescript
// Dans le module (jorbs.module.ts ou equivalent) :
// providers: [..., ChannelService, ChatSessionService]

@InjectRepository(ChatSession)
private readonly sessionRepo: Repository<ChatSession>,

private readonly channelService: ChannelService,
private readonly chatSessionService: ChatSessionService,
```

Imports :
```typescript
import { ChatSession } from 'src/chat-session/entities/chat-session.entity';
import { ChatSessionService } from 'src/chat-session/chat-session.service';
import { ChannelService } from 'src/channel/channel.service';
```

#### Logique complete (source : ChatSession, pas WhatsappChat)

```typescript
private async runWindowReminder(): Promise<void> {
  const config = await this.cronConfigService.findByKey('window-reminder-auto-message');
  if (!config?.enabled) return;

  // Plage de declenchement exprimee en "temps restant avant autoCloseAt"
  // Ex. normal : envoyer J quand il reste entre 10min et 2h avant fermeture (configurable)
  const normalMinBeforeMin = config.windowReminderNormalStartMin ?? 10;     // min restants mini
  const normalMaxBeforeMin = config.windowReminderNormalEndMin   ?? 2 * 60; // min restants maxi
  const ctwaMinBeforeMin   = config.windowReminderCtwaStartMin   ?? 10;
  const ctwaMaxBeforeMin   = config.windowReminderCtwaEndMin     ?? 4 * 60;
  const minReplies         = config.windowReminderMinReplies     ?? 1;
  const now = Date.now();

  // Bornes : auto_close_at dans [now + minBefore, now + maxBefore]
  const normalExpiresMin = new Date(now + normalMinBeforeMin * 60_000);
  const normalExpiresMax = new Date(now + normalMaxBeforeMin * 60_000);
  const ctwaExpiresMin   = new Date(now + ctwaMinBeforeMin   * 60_000);
  const ctwaExpiresMax   = new Date(now + ctwaMaxBeforeMin   * 60_000);

  // Pre-check global : fast-exit si aucun template J actif du tout (optimisation DB).
  // Ce check est intentionnellement non scope-aware : il evite de lancer les requetes ChatSession
  // si aucun template n'existe. Le check scope-aware est fait PER-CHAT avant markWindowReminderSent.
  const [hasJ1, hasJ2] = await Promise.all([
    this.messageAutoService.hasWindowReminderTemplate('with_replies'),
    this.messageAutoService.hasWindowReminderTemplate('no_replies'),
  ]);
  if (!hasJ1 && !hasJ2) return;

  // Source de verite : ChatSession — join WhatsappChat pour statut et canal uniquement
  const sessions = await this.sessionRepo
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.chat', 'c')
    .where('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
    // Garde-fou : session vraiment active sur ce chat (evite une vieille session orpheline)
    .andWhere('c.active_session_id = s.id')
    .andWhere('s.ended_at IS NULL')
    // Filtre sur auto_close_at (fermeture effective) — approche dans N minutes
    .andWhere(`(
      (s.is_ctwa = 0
        AND s.auto_close_at BETWEEN :normalExpiresMin AND :normalExpiresMax)
      OR
      (s.is_ctwa = 1
        AND s.auto_close_at BETWEEN :ctwaExpiresMin AND :ctwaExpiresMax)
    )`)
    .andWhere(`(
      s.last_window_reminder_sent_at IS NULL
      OR s.last_window_reminder_sent_at < s.last_client_message_at
    )`)
    .setParameters({ normalExpiresMin, normalExpiresMax, ctwaExpiresMin, ctwaExpiresMax })
    .limit(100)
    .getMany();

  for (const session of sessions) {
    const chat = session.chat;

    // Cas 7 : exclure les canaux sans fermeture automatique
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
    if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) continue;

    // J1/J2 : lire lastPosteMessageAt depuis la session (evite un COUNT pour minReplies = 1)
    // Si minReplies > 1, un COUNT reste necessaire (cas non couvre ici)
    const hasPosteReply = !!(
      session.lastPosteMessageAt &&
      session.lastClientMessageAt &&
      session.lastPosteMessageAt >= session.lastClientMessageAt
    );
    const variant: 'with_replies' | 'no_replies' =
      (hasPosteReply ? 1 : 0) >= minReplies ? 'with_replies' : 'no_replies';

    // Verification scope-aware avant de marquer : evite de marquer une session si aucun template
    // ne correspond au poste/canal du chat (meme logique que getTemplateForTrigger existant :
    // priorite poste > canal > global avec exclusions).
    // Appel avant markWindowReminderSent pour ne pas marquer si le template est absent dans ce scope.
    const template = await this.messageAutoService.getTemplateForTrigger(
      AutoMessageTriggerType.WINDOW_REMINDER,
      1,
      {
        posteId: chat.poste_id,
        channelId: chat.last_msg_client_channel_id,
        windowReminderTarget: variant,
      },
    );
    if (!template) continue; // pas de template pour ce scope — session non marquee, eligible au prochain tick

    // Anti-concurrence + sync double (ChatSession + WhatsappChat) via ChatSessionService
    const marked = await this.chatSessionService.markWindowReminderSent(session.id, chat.id);
    if (!marked) continue;

    // Envoyer avec le template deja resolu (evite un double appel getTemplateForTrigger)
    await this.messageAutoService.sendWindowReminderWithTemplate(chat.chat_id, template);
  }
}
```

#### Extension `getTemplateForTrigger` et `sendAutoMessageForTrigger`

**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.ts`

Ajouter `windowReminderTarget` dans les `options` des deux methodes :

```typescript
// getTemplateForTrigger — options etendues
options?: {
  posteId?: string | null;
  channelId?: string | null;
  clientTypeTarget?: 'new' | 'returning' | 'all';
  windowReminderTarget?: 'with_replies' | 'no_replies'; // <-- nouveau
}

// Filtre a ajouter dans getTemplateForTrigger apres le filtre clientTypeTarget :
if (options?.windowReminderTarget) {
  filtered = filtered.filter(
    (t) => t.windowReminderTarget === options.windowReminderTarget,
  );
  if (!filtered.length) return null;
}

// sendAutoMessageForTrigger — options etendues
options?: {
  clientTypeTarget?: 'new' | 'returning' | 'all';
  windowReminderTarget?: 'with_replies' | 'no_replies'; // <-- nouveau, passe a getTemplateForTrigger
}
```

#### Methodes ajoutees dans `MessageAutoService`

```typescript
/** Verifie qu'au moins un template J actif existe pour le variant donne (appele avant marquage). */
async hasWindowReminderTemplate(variant: 'with_replies' | 'no_replies'): Promise<boolean> {
  const count = await this.autoMessageRepo.count({
    where: {
      trigger_type: AutoMessageTriggerType.WINDOW_REMINDER,
      actif: true,
      windowReminderTarget: variant,
    },
  });
  return count > 0;
}

/**
 * Envoie J avec un template deja resolu (appele depuis runWindowReminder apres getTemplateForTrigger).
 * Evite un double-fetch et garantit que le template envoye est bien celui du scope resolu.
 * Ne pas appeler sans avoir verifie le scope au prealable.
 */
async sendWindowReminderWithTemplate(chatId: string, template: MessageAuto): Promise<void> {
  const chat = await this.chatService.findBychat_id(chatId);
  if (!chat) return;
  // Reutilise le flux d'envoi existant (typing, createAgentMessage/Media, gateway.notifyAutoMessage)
  // en passant directement le template resolu — meme logique que sendAutoMessageForTrigger
  // mais sans rappel getTemplateForTrigger
  await this.sendResolvedTemplate(chat, template, AutoMessageTriggerType.WINDOW_REMINDER);
}
```

> **Note implementation :** `sendResolvedTemplate` est une methode privee a extraire depuis
> `sendAutoMessageForTrigger` pour partager la logique d'envoi (typing, format, createAgentMessage,
> gateway) sans la partie selection de template. Si l'extraction est trop couteuse, il est acceptable
> d'appeler `sendAutoMessageForTrigger` avec `{ windowReminderTarget: variant }` et d'accepter le
> double-fetch — l'important est que `getTemplateForTrigger` dans ce cas retournera le meme template
> (scope identique, pas de race condition).

```typescript
// Methode conservee pour compatibilite mais plus appelee depuis runWindowReminder :
async sendWindowReminderForVariant(
  chatId: string,
  variant: 'with_replies' | 'no_replies',
): Promise<void> {
  await this.sendAutoMessageForTrigger(
    chatId,
    AutoMessageTriggerType.WINDOW_REMINDER,
    1,
    { windowReminderTarget: variant },
  );
}
```

---

### US 1.5 — Admin UI : configuration Section J

**Fichier :** `admin/src/app/ui/GoNoGoView.tsx` (vue crons existante)
ou dans la vue messages automatiques selon l'organisation actuelle.

**Champs a exposer dans le panneau admin :**

Pour la config `window-reminder-auto-message` :
- Actif / Inactif
- Plage normale : debut (h) / fin (h) → convertir min <> heures
- Plage CTWA : debut (h) / fin (h)
- Nombre min de reponses pour J1

Pour les templates J, dans la liste des messages automatiques :
- Afficher le badge "Reactivation avant expiration" (et non "Fermeture") avec le variant (`with_replies` / `no_replies`)
- Permettre de creer un template J1 ("agent disponible") et un template J2 ("demande en attente")
- **Validation obligatoire** : un template avec `trigger_type = WINDOW_REMINDER` et
  `windowReminderTarget = null` ne sera jamais selectionne. Le formulaire rend `windowReminderTarget`
  **obligatoire** quand le trigger est `WINDOW_REMINDER`, avec une erreur claire si absent.
- **Aide contextuelle** : afficher une note "Le message doit inciter le client a repondre (question
  ou action courte). Un message sans call-to-action ne prolonge pas la fenetre."

---

## 3. Epic 2 — Fermeture differenciee CTWA

### Probleme

Le cron `read-only-enforcement` ferme toutes les conversations apres `ttlDays` heures
(defaut 24h) sans distinguer les conversations CTWA qui ont une fenetre de 72h.
Resultat : les conversations CTWA sont fermees 48h trop tot.

### US 2.1 — Adapter `read-only-enforcement.job.ts`

**Fichier :** `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`

Avec `ChatSession.autoCloseAt` comme source de verite, le cron n'a plus besoin de
distinguer CTWA vs normal : il ferme simplement les sessions dont `autoCloseAt` est passe.
Plus de calcul de seuil differencies — la logique vit dans `ChatSessionService`.

**Note :** `ttlDays` / `ttlDaysCtwa` restent dans `cron_config` mais sont desormais utilises
par `ChatSessionService` lors du calcul de `serviceWindowExpiresAt` / `freeEntryExpiresAt`, pas par `read-only-enforcement`.

#### Avant (uniforme, WhatsappChat)
```typescript
private async findEligibleByClientInactivity(limit: Date): Promise<WhatsappChat[]> {
  return this.chatRepo.createQueryBuilder('chat')
    .where('chat.status != :ferme', { ferme: WhatsappChatStatus.FERME })
    .andWhere(
      '(chat.last_client_message_at IS NULL OR chat.last_client_message_at < :limit)',
      { limit },
    )
    .getMany();
}
```

#### Apres (ChatSession comme source, autoCloseAt)
```typescript
// Nouvelle injection a ajouter dans le constructeur :
// @InjectRepository(ChatSession) private readonly sessionRepo: Repository<ChatSession>
// private readonly chatSessionService: ChatSessionService

private async findExpiredSessions(): Promise<ChatSession[]> {
  return this.sessionRepo
    .createQueryBuilder('s')
    .innerJoinAndSelect('s.chat', 'c')
    .where('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
    // Garde-fou : ne prendre que la session vraiment active sur ce chat
    .andWhere('c.active_session_id = s.id')
    .andWhere('s.ended_at IS NULL')
    .andWhere('(s.auto_close_at IS NULL OR s.auto_close_at < :now)', { now: new Date() })
    .getMany();
}

async enforce(): Promise<string> {
  const sessions = await this.findExpiredSessions();

  for (const session of sessions) {
    const chat = session.chat;
    const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
    if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) continue;

    // Fermeture atomique : ChatSession + WhatsappChat dans une seule transaction
    await this.chatSessionService.closeExpiredSessionAndChat(session.id, chat.id, chat.chat_id);
    // Websocket emis apres commit (depuis closeExpiredSessionAndChat ou ici)
  }
  // ... reste inchange (logs, return message)
}

async preview(): Promise<ReadOnlyEnforcementPreview> {
  const sessions = await this.findExpiredSessions();
  // Filtrage shouldSkipAutoClose identique + retour preview
  // ... reste inchange
}
```

### US 2.2 — Admin UI : champ TTL CTWA

Dans le panneau de configuration de `read-only-enforcement`, ajouter un champ
"Delai fermeture clients Pub Meta (heures)" → `ttlDaysCtwa`, defaut 72.

---

## 4. Epic 3 — Analyse des cas limites

### Cas 1 : Client CTWA qui revient sans pub

**Scenario :** Un client interagit via une pub Meta (`isCtwa = true`, chat ferme a 72h).
Une semaine plus tard, il envoie un message direct sans pub.

**Probleme :** Un client ne peut avoir qu'un seul `WhatsappChat`. Il n'y a pas de
"nouvelle conversation B" — c'est le meme `WhatsappChat` qui se reuvre. Si `isCtwa`
reste `true`, ce second echange direct herite a tort d'une fenetre 72h.

**Resolution (dependante de l'Epic 0 — ChatSession) :**
- A la reouverture, le service inbound cree une nouvelle `ChatSession` avec `isCtwa = false`
  (pas de referral Meta dans ce message)
- `WhatsappChat.isCtwa` est mis a jour en consequence (cache de la session active)
- La nouvelle session obtient une fenetre de 24h (`serviceWindowExpiresAt = now + 24h`, sans avantage CTWA)

**Sans Epic 0 (solution minimale) :** Reinitialiser `WhatsappChat.isCtwa = false` dans
`inbound-message.service.ts` quand le chat est ferme puis reouvert sans referral Meta.

---

### Cas 2 : Conversation CTWA reuverte par le client avant 72h

**Scenario :** Session CTWA, `autoCloseAt = T0+72h`. Job J envoye a T0+68h (4h avant `autoCloseAt`).
A T0+71h le client repond.

**Comportement :**
- `lastClientMessageAt` se met a jour a T0+71h → `serviceWindowExpiresAt = T0+95h`, `autoCloseAt = T0+95h`
- Le cron de fermeture ne ferme plus (autoCloseAt repousse)
- `lastWindowReminderSentAt = T0+68h` < nouveau `lastClientMessageAt (T0+71h)`
  → J eligible pour un nouveau cycle si `autoCloseAt` s'approche a nouveau dans la plage configuree

**Resolution :** Aucune action necessaire, le mecanisme de tracking couvre ce cas.

---

### Cas 3 : Conversation normale avec `last_client_message_at = null`

**Scenario :** Une conversation existe mais le client n'a jamais envoye de message
(conversation creee manuellement ou via un broadcast sortant).

**Comportement actuel :** Le cron de fermeture considere `IS NULL` comme eligible
et ferme immediatement (ou apres le seuil initial).

**Comportement apres :** Identique pour les deux seuils (normal et CTWA) : IS NULL
→ fermeture immediata. Le job J ignore ces conversations (pas de `last_client_message_at`
→ hors de la plage BETWEEN).

**Resolution :** Comportement acceptable. Pas de changement necessaire.

---

### Cas 4 : Meme contact avec plusieurs conversations simultanées

**Scenario :** Un contact aurait une conversation CTWA et une conversation normale en parallele.

**Correction :** Ce scenario est impossible : un client n'a qu'un seul `WhatsappChat`
identifie par son numero de telephone. Il ne peut pas avoir deux conversations ouvertes
simultanement avec des statuts `isCtwa` differents.

**Comportement reel :** A chaque nouveau message entrant, c'est toujours le meme
`WhatsappChat` qui est reactif. Le statut `isCtwa` de la session courante est
determine par la presence ou non d'un referral Meta dans ce message entrant.

**Impact plan :** Le job J et le cron de fermeture n'ont pas a gerer de conflit
de sessions paralleles. En revanche, il faut s'assurer que `isCtwa` est bien
recalcule a chaque reouverture (voir Cas 1 et Cas 9).

---

### Cas 5 : Commercial repond apres l'envoi de J2

**Scenario :** J2 est envoye alors qu'il reste 90min avant `autoCloseAt`. Le commercial
repond 30min plus tard. Le cron tourne de nouveau 5 minutes apres.

**Comportement :**
- `lastWindowReminderSentAt` est fixe (avant le message commercial) < `lastClientMessageAt` original → OK (J deja envoye)
- Le message commercial met a jour `lastPosteMessageAt` mais PAS `lastClientMessageAt`
- `autoCloseAt` est toujours dans la plage declenchement J → eligible techniquement
- Mais `lastWindowReminderSentAt >= lastClientMessageAt` → **J NON renvoye** (correct, idempotence garantie)

**Resolution :** Le tracking sur `last_client_message_at` garantit l'unicite. Un seul
J (J1 ou J2) par session client.

---

### Cas 6 : Message J envoye mais la conversation se ferme avant que le client voie

**Scenario :** J est envoye 20min avant `autoCloseAt`. Le cron de fermeture tourne et la session se ferme quand `autoCloseAt` est depasse.

**Comportement :** La conversation se ferme normalement. Si le client repond apres
la fermeture, la conversation est reuverte (trigger D `REOPENED`). La nouvelle
session cliente repart avec `last_client_message_at` a jour → le J precedent
ne sera pas renvoye (tracking < nouveau message client).

**Resolution :** Comportement correct. La sequence naturelle est J → fermeture → reouverture si besoin.

---

### Cas 7 : `shouldSkipAutoClose` (canal dedie)

**Scenario :** Un canal a `shouldSkipAutoClose = true`. La conversation CTWA
est sur ce canal.

**Comportement :** Pas de fermeture automatique, comme actuellement. Le message J
n'est pas non plus envoye : `runWindowReminder()` appelle `shouldSkipAutoClose()`
en debut de boucle et skip ces conversations (meme pattern que `read-only-enforcement`).

**Resolution :** Implemente — aucune action supplementaire requise.

---

### Cas 8 : Double envoi si le job tourne deux fois dans la plage

**Scenario :** Le job maitre tourne toutes les 5 minutes. Si la plage est "10min a 2h avant autoCloseAt",
il y a potentiellement ~23 executions dans cette plage. Deux instances pourraient
selectionner la meme session avant que l'une ait fini.

**Comportement :** Double protection :
1. `UPDATE ... WHERE last_window_reminder_sent_at IS NULL OR ... < last_client_message_at` est
   atomique — seule l'instance dont l'UPDATE retourne `affected = 1` poursuit l'envoi.
2. La conversation disparait du SELECT des executions suivantes (le champ est mis a jour).

**Resolution :** Garanti par l'UPDATE atomique. Aucune action supplementaire.

---

### Cas 9 : Changement de `isCtwa` en cours de conversation

**Scenario :** Un client CTWA (`isCtwa = true`) envoie un second message direct
(sans pub) dans la meme conversation ouverte.

**Correction :** La resolution "on ne degrade pas le statut" etait incorrecte dans
le plan initial. Si `isCtwa` reste `true` indefiniment, tous les echanges futurs du
client (meme sans pub) recevront une fenetre 72h — ce qui est faux.

**Comportement correct :**

| Situation | Comportement `isCtwa` |
|---|---|
| Message entrant avec referral Meta | `isCtwa = true` (ou reste true si session deja CTWA) |
| Chat encore ouvert, session CTWA en cours | Garder `isCtwa = true` (la session est CTWA) |
| Chat ferme, client revient **sans** referral | `isCtwa = false` (nouvelle session non-CTWA) |
| Chat ferme, client revient **avec** referral | `isCtwa = true` (nouvelle session CTWA) |

**Implementation :**
- Avec Epic 0 (ChatSession) : `isCtwa` est un champ de `ChatSession`, recalcule a chaque ouverture de session
- Sans Epic 0 : dans `inbound-message.service.ts`, reinitialiser `WhatsappChat.isCtwa = false` quand le chat est rouvre sans referral Meta

**Regle simple :** `isCtwa` represente "la session **courante** a ete initiee par une pub Meta",
pas "ce client a un jour clique sur une pub Meta".

---

### Cas 10 : Admin modifie les seuils pendant une plage active

**Scenario :** La plage est configuree a "10min-2h avant autoCloseAt". L'admin change a
"5min-3h" pendant une execution du job.

**Comportement :** La config est lue a chaque execution du job. Le changement prend
effet au prochain tick (5 minutes apres). Les conversations deja trackees avec
`last_window_reminder_sent_at` ne recoivent pas de second message.

**Resolution :** Comportement acceptable. Pas de gestion speciale necessaire.

---

## 5. Fichiers a creer / modifier

### Backend (message_whatsapp/src/) — Epic 0 (ChatSession)

| Fichier | Type | Description |
|---|---|---|
| `chat-session/entities/chat-session.entity.ts` | Creer | Nouvelle entite |
| `chat-session/chat-session.service.ts` | Creer | `openSession()`, `onClientMessage()`, `onPosteMessage()`, `closeSession()`, `closeExpiredSessionAndChat()`, `markWindowReminderSent()` |
| `chat-session/chat-session.module.ts` | Creer | Module NestJS |
| `whatsapp_chat/entities/whatsapp_chat.entity.ts` | Modifier | +colonne `active_session_id` |
| `inbound-message/inbound-message.service.ts` | Modifier | Detecter referral Meta, appeler `openSession()` / `onClientMessage()` selon session active |
| `jorbs/read-only-enforcement.job.ts` | Modifier | Fermeture basee sur `ChatSession.autoCloseAt` via `closeExpiredSessionAndChat()` |
| `migrations/AddChatSessionEntity1780531200000.ts` | Creer | CREATE TABLE + backfill (24h/72h) |

### Backend (message_whatsapp/src/) — Epics 1+2 (Section J + fermeture CTWA)

| Fichier | Type | Description |
|---|---|---|
| `message-auto/entities/message-auto.entity.ts` | Modifier | +enum WINDOW_REMINDER, +colonne `window_reminder_target` |
| `jorbs/entities/cron-config.entity.ts` | Modifier | +6 nouvelles colonnes (plages J en "minutes avant expiration" + TTL CTWA) |
| `jorbs/auto-message-master.job.ts` | Modifier | +`runWindowReminder()` (source ChatSession, plages via `auto_close_at`) + injections `ChannelService`, `ChatSessionService`, `sessionRepo` |
| `jorbs/read-only-enforcement.job.ts` | Modifier | Fermeture basee session expiree (plus de seuils differencies, `closeExpiredSessionAndChat`) |
| `message-auto/message-auto.service.ts` | Modifier | +`sendWindowReminderWithTemplate()`, +`hasWindowReminderTemplate()`, etendre `getTemplateForTrigger` + `sendAutoMessageForTrigger` + extraire `sendResolvedTemplate()` privee |
| `message-auto/dto/create-message-auto.dto.ts` | Modifier | +champ `windowReminderTarget` optionnel |
| `message-auto/dto/update-message-auto.dto.ts` | Modifier | +champ `windowReminderTarget` optionnel |
| `migrations/AddWindowReminderSection1780531200001.ts` | Creer | ALTER messages_predefinis (enum + colonne) |
| `migrations/AddWindowReminderCronFields1780531200002.ts` | Creer | ALTER cron_config + seed (plages J + TTL CTWA) |

### Admin (admin/src/)

| Fichier | Type | Description |
|---|---|---|
| `app/lib/definitions.ts` | Modifier | +type `WINDOW_REMINDER` dans enum trigger, +champ `windowReminderTarget` sur `MessageAuto` |
| `app/lib/api.ts` | Modifier | +champ `windowReminderTarget` dans les appels create/update messages auto |
| `app/ui/GoNoGoView.tsx` (ou vue crons) | Modifier | +affichage config `window-reminder-auto-message` + TTL CTWA |
| `app/ui/MessageAutoView.tsx` (si existe) | Modifier | +badge variant J1/J2 dans la liste, +select dans le formulaire |

---

## 6. Ordre de livraison recommande

### Sprint 0 (fondation — Epic 0 : ChatSession)
> Prerequis de tout le reste. Peut etre livre independamment.

1. Migration `AddChatSessionEntity1780531200000` + backfill (24h/72h, colonne SQL `createdAt`)
2. Entite `ChatSession` + `ChatSessionService` (toutes les methodes, transactions, SELECT FOR UPDATE)
3. `inbound-message.service.ts` : detection referral Meta + `openSession()` / `onClientMessage()` / `onPosteMessage()`
4. `read-only-enforcement.job.ts` : fermeture basee session via `findExpiredSessions()` + `closeExpiredSessionAndChat()` (atomique)
5. `WhatsappChat.activeSessionId` : colonne + sync dans `ChatSessionService`

### Sprint A (fondations Section J + fermeture CTWA)
> Necessite Sprint 0 termine (ChatSession doit exister).

6. Migrations SQL `AddWindowReminderSection1780531200001` + `AddWindowReminderCronFields1780531200002`
7. Entites TypeORM mises a jour (enum WINDOW_REMINDER, colonnes CronConfig avec plages "minutes avant expiration")
8. `read-only-enforcement.job.ts` : retirer ancienne logique seuils — deja couverte par Sprint 0

### Sprint B (section J backend)
9. Extension `getTemplateForTrigger` + `sendAutoMessageForTrigger` avec `windowReminderTarget`
10. `hasWindowReminderTemplate()` + `sendWindowReminderForVariant()` dans `message-auto.service.ts`
11. `runWindowReminder()` dans `auto-message-master.job.ts` (source ChatSession, plages via `auto_close_at`, garde `c.active_session_id = s.id`)
12. DTOs create/update : +champ `windowReminderTarget`

### Sprint C (admin UI)
13. Config `window-reminder-auto-message` dans l'admin (plages "minutes avant expiration" + min replies max 1)
14. Affichage variant J1/J2 + select obligatoire WINDOW_REMINDER dans le formulaire
15. TTL CTWA dans la config `read-only-enforcement` (alimente `ChatSessionService`)
16. (Bonus) Affichage `campaignName` / `campaignImageUrl` par session dans la vue conversation

---

## 7. Recapitulatif des parametres configurables

| Parametre | Cle config | Defaut | Description |
|---|---|---|---|
| Plage min avant fermeture (normal) | `windowReminderNormalStartMin` | 10 | Minutes restantes mini avant `autoCloseAt` |
| Plage max avant fermeture (normal) | `windowReminderNormalEndMin` | 120 (2h) | Minutes restantes maxi avant `autoCloseAt` |
| Plage min avant fermeture (CTWA) | `windowReminderCtwaStartMin` | 10 | Minutes restantes mini avant `autoCloseAt` |
| Plage max avant fermeture (CTWA) | `windowReminderCtwaEndMin` | 240 (4h) | Minutes restantes maxi avant `autoCloseAt` |
| Min reponses J1 | `windowReminderMinReplies` | 1 (max 1) | Nb msgs commerciaux pour J1 — UI limitee a 1 |
| TTL fermeture normal | `ttlDays` (existant, affiché "heures" en admin) | 24 | Heures — lu par `ChatSessionService` pour `serviceWindowExpiresAt` |
| TTL fermeture CTWA | `ttlDaysCtwa` (affiché "heures" en admin) | 72 | Heures — lu par `ChatSessionService` pour `freeEntryExpiresAt` |

---

## 8. Decisions produit ouvertes

### Decision A — Cible du rappel J : `autoCloseAt` seul ou aussi `serviceWindowExpiresAt` ?

Deux strategies possibles :

| Strategie | Cible | Avantage | Inconvenient |
|---|---|---|---|
| **Actuelle (plan)** | `autoCloseAt` | Couvre tous les cas de fermeture (normal + CTWA 72h) | Pour CTWA, si `freeEntryExpiresAt > serviceWindowExpiresAt`, J ne tire pas quand la fenetre 24h expire |
| **Double declenchement** | `autoCloseAt` ET `serviceWindowExpiresAt` | Maximise les chances de reponse client dans les 24h utiles | Necessite deux triggers distincts (ou un trigger plus complexe) |

**Recommandation provisoire :** garder `autoCloseAt` uniquement pour la V1 (plus simple, couvre la fermeture reelle). Si le besoin de maximiser la continuite de discussion libre emerge, ajouter un second trigger J sur `serviceWindowExpiresAt` en V2.

---

### Decision B — Messages libres vs templates HSM apres 24h en session CTWA

**Question :** dans votre integration Whapi, un message libre (non-template) est-il accepte pendant la fenetre CTWA 72h, meme apres expiration de `serviceWindowExpiresAt` (24h) ?

Selon la documentation Meta (https://whatsappbusiness.com/products/platform-pricing), l'avantage CTWA/Facebook-page-CTA permet des messages sans frais pendant 72h. **Mais en pratique avec Whapi :**

- Si Whapi valide uniquement la fenetre service 24h : les messages libres apres 24h seront rejetes, meme en session CTWA. Il faudra alors des templates HSM pour contacter le client entre 24h et 72h.
- Si Whapi respecte la fenetre 72h : les messages libres sont valides pendant toute la duree.

**Cette decision ne bloque pas la livraison de ChatSession (Epic 0).** Elle bloque uniquement
l'activation de J sur les sessions CTWA au-dela de 24h. Sequence recommandee :
livrer Epic 0 + J normal → tester Whapi CTWA → activer J CTWA apres confirmation.

**Test Whapi a faire :** verifier le comportement reel via une session CTWA apres 24h.

**Consequences selon le resultat :**

| Resultat test Whapi | Impact sur J | Impact sur `read-only-enforcement` |
|---|---|---|
| Messages libres acceptes jusqu'a 72h | Plan V1 correct tel quel | Aucun changement |
| Messages libres bloques apres 24h | J entre 24h et `autoCloseAt` doit etre un template HSM | Envisager un mode "template only" entre 24h et 72h plutot que fermeture |

**Lien avec le tableau d'extension naturelle :** quand `autoCloseAt > freeEntryExpiresAt` (ex. client ecrit a T0+52h → autoCloseAt = T0+76h), J envoye entre T0+72h et T0+76h sera dans la fenetre de service (libre techniquement) mais hors fenetre CTWA (facture). Si Whapi bloque aussi les messages libres dans ce cas, J ne partira pas. Tester explicitement ce scenario.
