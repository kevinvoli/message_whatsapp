# Plan — Exclusion des postes à canaux dédiés des règles commerciaux

> **Branche :** `production`  
> **Date :** 2026-05-25  
> **Contexte :** Les 3 règles de comportement commercial sont déjà implémentées backend + frontend + admin UI.  
> **Objectif :** Les désactiver systématiquement pour les commerciaux dont le poste possède un canal dédié.  
> **Statut :** 📋 À implémenter

---

## 1. Contexte & Problème

### 1.1 Les 3 règles déjà en place

| Règle | Paramètre `DispatchSettings` | Backend | Frontend | Admin UI |
|---|---|---|---|---|
| **Limite de lecture** | `maxReadMessagesPerMinute` | `MessageReadService` + `MessageReadRateLimiterService` | côté serveur | `LectureSeuleView` |
| **Cooldown entre lectures** | `readCooldownSeconds` | exposé via `GET /auth/me/settings` | `IdleAndCooldownWrapper` + `ReadCooldownModal` | `LectureSeuleView` |
| **Déconnexion automatique** | `idleDisconnectEnabled` + `idleDisconnectMinutes` | `IdleDisconnectJob` | `useIdleTimer` (désactivé si `idleMinutes <= 0`) | `LectureSeuleView` |

### 1.2 Le problème

Ces 3 règles **s'appliquent aujourd'hui à tous les commerciaux sans distinction**.  
Or, les commerciaux affectés à un poste avec un **canal dédié** (`WhapiChannel.poste_id IS NOT NULL`)
sont des opérateurs admin/supervision qui n'ont pas de comportement de rafale à contrôler.

**Ces règles doivent être désactivées pour eux**, à la fois :
- côté **backend** (enforcement) ;
- côté **frontend** (modales et timer) ;
- côté **admin UI** (mention explicite dans la vue de configuration).

---

## 2. Définition : "poste avec canal dédié"

```
Un poste P est "dédié" si :
  EXISTS (SELECT 1 FROM whapi_channels WHERE poste_id = P.id)

En TypeORM :
  channel.poste_id IS NOT NULL  (colonne nullable, null = canal en pool global)
```

La propriété `channel_dedicated` existe déjà côté frontend (`front/src/types/chat.ts:798`) mais
elle est attachée à une **conversation**, pas au commercial. Ce plan ajoute une détection
au niveau du **commercial** (une fois à la connexion pour le backend, une fois au chargement pour le frontend).

---

## 3. User Stories

### US-1 — Backend : méthode `hasDedicatedChannel` [SERVICE]

**Fichier :** `message_whatsapp/src/whatsapp_commercial/whatsapp_commercial.service.ts`

Ajouter une méthode de détection à partir de l'`userId` du commercial :

```typescript
/**
 * Retourne true si le commercial est affecté à un poste qui possède au moins
 * un canal dédié (WhapiChannel.poste_id IS NOT NULL).
 * Utilisé pour désactiver les règles de comportement commercial (rate limit,
 * cooldown, idle disconnect) pour ce type d'opérateur.
 */
async hasDedicatedChannel(userId: string): Promise<boolean> {
  const count = await this.whatsappCommercialRepository
    .createQueryBuilder('c')
    .innerJoin('c.poste', 'p')
    .innerJoin('p.channels', 'ch')
    .where('c.id = :id', { id: userId })
    .andWhere('ch.poste_id IS NOT NULL')
    .getCount();
  return count > 0;
}
```

> `innerJoin` : si le commercial n'a pas de poste, ou si son poste n'a pas de canal dédié,
> `getCount()` retourne `0` → `false`. Pas de row lookup superflu.

---

### US-2 — Backend : exposer `hasDedicatedChannel` dans `GET /auth/me/settings` [CONTROLLER]

**Fichier :** `message_whatsapp/src/auth/auth.controller.ts`

Modifier `getMySettings()` en utilisant **`req.user.posteId`** (déjà présent dans le JWT)
et un simple `COUNT` sur `WhapiChannel` — sans injecter `WhatsappCommercialService`,
ce qui évite tout risque de dépendance circulaire (`WhatsappCommercialModule` importe
déjà `AuthModule` pour l'authentification des agents).

```typescript
// Import à ajouter en haut du fichier
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

// Dans le constructeur du AuthController — ajouter le repository :
constructor(
  // ... existant ...
  @InjectRepository(WhapiChannel)
  private readonly channelRepository: Repository<WhapiChannel>,
) {}

// Modifier getMySettings :
@UseGuards(AuthGuard('jwt'))
@Get('me/settings')
async getMySettings(@Request() req) {
  const s = await this.dispatchSettingsService.getSettings();

  // posteId est dans le payload JWT — pas besoin de requête commerciale supplémentaire
  const posteId: string | undefined = req.user?.posteId;
  const hasDedicatedChannel = posteId
    ? (await this.channelRepository.count({ where: { poste_id: posteId } })) > 0
    : false;

  return {
    readCooldownSeconds:   s.readCooldownSeconds   ?? 120,
    idleDisconnectMinutes: s.idleDisconnectMinutes  ?? 15,
    idleWarningSeconds:    s.idleWarningSeconds     ?? 10,
    hasDedicatedChannel,                             // ← NOUVEAU
  };
}
```

> **Module :** Si `WhapiChannel` n'est pas encore dans `TypeOrmModule.forFeature([...])`
> de `AuthModule`, ajouter `TypeOrmModule.forFeature([WhapiChannel])` aux imports du module,
> **ou** importer `ChannelModule` (s'il exporte déjà le repository).
>
> **Pourquoi `posteId` et pas `userId` ?** Le `posteId` est inclus dans le JWT à la connexion
> (voir `AuthPayload` dans le gateway). Un seul `COUNT` sur la FK `whapi_channels.poste_id`
> suffit — c'est plus rapide qu'un double join commercial → poste → channels.

---

### US-3 — Backend : exclure les postes dédiés dans `IdleDisconnectJob` [JOB]

**Fichier :** `message_whatsapp/src/jorbs/idle-disconnect.job.ts`

Ajouter une clause `NOT EXISTS` dans la requête de sélection des commerciaux inactifs.
Le job ne doit déconnecter que les commerciaux dont le poste **n'a pas** de canal dédié.

```typescript
// Avant (ligne 42) :
const idleCommercials = await this.commercialRepository
  .createQueryBuilder('c')
  .leftJoinAndSelect('c.poste', 'poste')
  .where('c.isConnected = :connected', { connected: true })
  .andWhere(
    '(c.lastActivityAt IS NULL OR c.lastActivityAt < :threshold)',
    { threshold },
  )
  .getMany();

// Après — ajouter la clause d'exclusion :
const idleCommercials = await this.commercialRepository
  .createQueryBuilder('c')
  .leftJoinAndSelect('c.poste', 'poste')
  .where('c.isConnected = :connected', { connected: true })
  .andWhere(
    '(c.lastActivityAt IS NULL OR c.lastActivityAt < :threshold)',
    { threshold },
  )
  // ← NOUVEAU : ne jamais déconnecter un commercial sur poste dédié
  .andWhere(
    `NOT EXISTS (
      SELECT 1 FROM whapi_channels ch
      WHERE ch.poste_id = poste.id
    )`,
  )
  .getMany();
```

> Le `NOT EXISTS` est évalué par MySQL avec le covering index sur `whapi_channels.poste_id`
> (FK existante). Coût quasi nul pour N commerciaux connectés.

---

### US-4 — Backend : passer `isDedicated` au rate limiter via le gateway [GATEWAY]

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

**4.1 — Injecter `WhapiChannel` repository** (déjà enregistré dans le module) :

```typescript
// Dans les imports du constructeur du gateway :
@InjectRepository(WhapiChannel)
private readonly channelRepository: Repository<WhapiChannel>,
```

**4.2 — Enrichir `connectedAgents` avec `isDedicated`** :

```typescript
// Modifier le type de connectedAgents :
private connectedAgents = new Map<
  string,
  {
    commercialId: string;
    posteId?: string;
    tenantId: string;
    isDedicated: boolean;   // ← NOUVEAU
  }
>();
```

**4.3 — Calculer `isDedicated` à la connexion** (une seule requête par connexion) :

```typescript
// Juste avant connectedAgents.set(...), lors du handleConnection :
const isDedicated = posteId
  ? (await this.channelRepository.count({ where: { poste_id: posteId } })) > 0
  : false;

this.connectedAgents.set(client.id, {
  commercialId,
  posteId,
  tenantId,
  isDedicated,    // ← NOUVEAU
});
```

**4.4 — Passer `isDedicated` à `markConversationAsRead`** :

```typescript
// Lors de l'appel markConversationAsRead dans le handler read:messages :
const result = await this.messageReadService.markConversationAsRead(
  agent.commercialId,
  payload.chatId,
  agent.isDedicated,   // ← NOUVEAU : 3ème paramètre
);
```

---

### US-5 — Backend : skip rate limiter si `isDedicated` [SERVICE]

**Fichier :** `message_whatsapp/src/whatsapp_message/message-read.service.ts`

Ajouter le paramètre optionnel `isDedicated` et bypass le rate limiter si vrai :

```typescript
async markConversationAsRead(
  commercialId: string,
  chatId: string,
  isDedicated = false,   // ← NOUVEAU (3ème paramètre, défaut false)
): Promise<{ markedCount: number }> {

  const messages = await this.messageRepository
    .createQueryBuilder('m')
    .select('m.id')
    .where('m.chat_id = :chatId', { chatId })
    .andWhere('m.direction = :direction', { direction: MessageDirection.IN })
    .andWhere('m.readByCommercialId IS NULL')
    .getMany();

  if (messages.length === 0) {
    return { markedCount: 0 };
  }

  // ← MODIFIÉ : skip rate limit pour postes dédiés
  let granted: number;
  if (isDedicated) {
    granted = messages.length;   // aucune limite — marquer tout
  } else {
    const settings = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    const maxPerMinute = settings?.maxReadMessagesPerMinute ?? 1;
    granted = this.rateLimiter.consumeUpTo(commercialId, messages.length, maxPerMinute);
  }

  if (granted === 0) {
    return { markedCount: 0 };
  }

  const toMark = messages.slice(0, granted);
  const ids = toMark.map((m) => m.id);

  await this.messageRepository
    .createQueryBuilder()
    .update(WhatsappMessage)
    .set({
      readByCommercialId: commercialId,
      readByCommercialAt: () => 'NOW()',
    })
    .whereInIds(ids)
    .execute();

  await this.commercialRepository
    .createQueryBuilder()
    .update(WhatsappCommercial)
    .set({
      messagesReadCount: () => `messages_read_count + ${granted}`,
      lastActivityAt: () => 'NOW()',
    })
    .where('id = :id', { id: commercialId })
    .execute();

  return { markedCount: granted };
}
```

> **Optimisation secondaire :** le `settingsRepository.findOne` est désormais à l'intérieur
> de la branche `isDedicated === false` — on évite la lecture DB inutile pour les postes dédiés.

---

### US-6 — Frontend : désactiver les règles si `hasDedicatedChannel` [FRONT]

**Fichier :** `front/src/components/IdleAndCooldownWrapper.tsx`

**6.1 — Mettre à jour le type `ClientSettings`** :

```typescript
interface ClientSettings {
  readCooldownSeconds:   number;
  idleDisconnectMinutes: number;
  idleWarningSeconds:    number;
  hasDedicatedChannel:   boolean;   // ← NOUVEAU
}

const DEFAULTS: ClientSettings = {
  readCooldownSeconds:   120,
  idleDisconnectMinutes: 15,
  idleWarningSeconds:    10,
  hasDedicatedChannel:   false,     // ← NOUVEAU (false = règles actives par défaut)
};
```

**6.2 — Passer `idleMinutes = 0` si `hasDedicatedChannel`** (`useIdleTimer` se désactive si `<= 0`) :

```typescript
const { showWarning, idleSeconds, remainingSeconds, resetActivity } = useIdleTimer(
  user && !settings.hasDedicatedChannel ? settings.idleDisconnectMinutes : 0,
  settings.idleWarningSeconds,
);
```

**6.3 — Ne pas configurer le cooldown store si `hasDedicatedChannel`** :

```typescript
.then((data: ClientSettings | null) => {
  if (data) {
    setSettings(data);
    if (!data.hasDedicatedChannel) {
      setCooldownConfig(data.readCooldownSeconds);
    }
  }
})
```

**6.4 — Ne rien rendre si `hasDedicatedChannel`** :

```typescript
// En bas du composant, avant le return JSX :
if (!user || settings.hasDedicatedChannel) return null;
```

> **Sécurité UX :** Au premier rendu, `hasDedicatedChannel = false` (DEFAULTS), donc les
> modales peuvent s'afficher une fraction de seconde avant que les settings soient chargés.
> C'est acceptable — le chargement des settings est rapide (~50ms sur LAN).
> Si besoin d'éliminer ce flash : ajouter un `isSettingsLoaded` state initialisé à `false`
> et retourner `null` tant que les settings ne sont pas chargés.

---

### US-7 — Admin UI : bannière d'info dans `LectureSeuleView` [ADMIN]

**Fichier :** `admin/src/app/ui/LectureSeuleView.tsx`

Ajouter une bannière explicative en tête de la vue, avant les `SectionCard` :

```tsx
import { Info } from 'lucide-react';

// Dans le JSX, juste après le titre de section (avant le premier SectionCard) :
<div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
  <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
  <div>
    <p className="text-sm font-semibold text-blue-800">
      Règles commerciaux uniquement
    </p>
    <p className="mt-0.5 text-xs text-blue-600">
      Ces règles s&apos;appliquent exclusivement aux commerciaux affectés à des postes
      en <strong>mode pool</strong> (canal partagé). Les postes avec un{' '}
      <strong>canal dédié</strong> sont automatiquement exclus — leurs opérateurs
      ne sont pas soumis au rate limit, au cooldown, ni à la déconnexion automatique.
    </p>
  </div>
</div>
```

---

## 4. Séquence d'implémentation

```
Étape 1 — WhatsappCommercialService : +hasDedicatedChannel()         ~15 min
  └── Un QueryBuilder avec innerJoin poste → channels (WHERE poste_id IS NOT NULL)

Étape 2 — auth.controller.ts : exposer hasDedicatedChannel           ~15 min
  ├── Injecter WhatsappCommercialService dans AuthController
  └── Ajouter hasDedicatedChannel dans la réponse de GET /auth/me/settings

Étape 3 — IdleDisconnectJob : NOT EXISTS clause                       ~10 min
  └── Une ligne andWhere supplémentaire dans la requête existante

Étape 4 — WhatsappMessageGateway : stocker isDedicated               ~20 min
  ├── Injecter channelRepository
  ├── Enrichir le type connectedAgents
  ├── Calculer isDedicated au handleConnection
  └── Passer isDedicated à markConversationAsRead

Étape 5 — MessageReadService : accepter isDedicated                  ~15 min
  ├── 3ème paramètre isDedicated = false
  └── Déplacer settingsRepository.findOne dans la branche !isDedicated

Étape 6 — IdleAndCooldownWrapper.tsx                                 ~20 min
  ├── Ajouter hasDedicatedChannel dans l'interface + DEFAULTS
  ├── Conditionner idleMinutes → 0 si dédié
  ├── Skip setCooldownConfig si dédié
  └── Return null si dédié

Étape 7 — LectureSeuleView.tsx : bannière info                       ~10 min
  └── Bloc <Info> bleu en tête de vue

Total estimé : ~1h45
```

---

## 5. Fichiers créés / modifiés — récapitulatif

### Backend

| Fichier | Action | Détail |
|---|---|---|
| `src/whatsapp_commercial/whatsapp_commercial.service.ts` | Modifier | `+hasDedicatedChannel(userId)` |
| `src/auth/auth.controller.ts` | Modifier | `+hasDedicatedChannel` dans `GET /auth/me/settings` |
| `src/jorbs/idle-disconnect.job.ts` | Modifier | `+NOT EXISTS` clause |
| `src/whatsapp_message/whatsapp_message.gateway.ts` | Modifier | `+isDedicated` dans connectedAgents, calcul à la connexion |
| `src/whatsapp_message/message-read.service.ts` | Modifier | `+isDedicated` param, bypass rate limiter |

### Frontend

| Fichier | Action | Détail |
|---|---|---|
| `front/src/components/IdleAndCooldownWrapper.tsx` | Modifier | Skip toutes les règles si `hasDedicatedChannel` |

### Admin

| Fichier | Action | Détail |
|---|---|---|
| `admin/src/app/ui/LectureSeuleView.tsx` | Modifier | Bannière info canal dédié |

**Total : 0 créé + 7 modifiés — Aucune migration SQL nécessaire**

---

## 6. Tests manuels

| Scénario | Attendu |
|---|---|
| Commercial sur poste **pool** (sans canal dédié) | Rate limit actif, cooldown modal si rafale, déconnexion auto après `idleDisconnectMinutes` |
| Commercial sur poste **dédié** (canal `poste_id IS NOT NULL`) | Aucun rate limit, aucune modal cooldown, aucune déconnexion auto |
| `IdleDisconnectJob.run()` avec 1 idle pool + 1 idle dédié | Seul le pool est déconnecté |
| `GET /auth/me/settings` pour un commercial dédié | `hasDedicatedChannel: true` dans la réponse |
| `GET /auth/me/settings` pour un commercial pool | `hasDedicatedChannel: false` dans la réponse |
| `LectureSeuleView` admin | Bannière bleue visible en haut des 3 sections |

---

## 7. Règle clé à retenir

> **Seule source de vérité : `WhapiChannel.poste_id IS NOT NULL`.**  
> Un poste est "dédié" si au moins un de ses canaux a `poste_id` renseigné.  
> Cette vérification se fait **une fois par connexion** côté backend (gateway)  
> et **une fois au chargement** côté frontend (`/auth/me/settings`).  
> Aucun état partagé supplémentaire, aucune migration, aucun nouveau concept.

---

*Plan rédigé le 2026-05-25 — Dépend des 3 règles commerciaux déjà implémentées dans `LectureSeuleView`.*
