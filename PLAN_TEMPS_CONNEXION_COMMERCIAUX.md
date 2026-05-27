# Plan — Calcul et affichage du temps de connexion des commerciaux

**Date :** 2026-05-26  
**Branche :** `production`  
**Révision :** v4 — US-0d ferme toutes les sessions ouvertes (pas seulement la dernière), await dans IdleDisconnectJob

---

## 1. Contexte et état des lieux

### Infrastructure déjà en place

| Composant | Fichier | État |
|-----------|---------|------|
| Table SQL `messaging_connection_log` | `src/connection-log/entities/connection-log.entity.ts` | ✅ Existe (migration `ConnectionLog1746057600007`) |
| `ConnectionLogService` | `src/connection-log/connection-log.service.ts` | ✅ `logLogin`, `logLogout`, `getTotalConnectionMinutes`, `getBulkConnectionMinutes` |
| Login HTTP → `logLogin()` | `src/auth/auth.controller.ts` L.116 | ✅ Câblé |
| Logout HTTP → `logLogout()` | `src/auth/auth.controller.ts` | ✅ Câblé |
| disconnect-all job → `logLogout()` | `src/jorbs/disconnect-all-commercials.job.ts` L.38 | ✅ Câblé |
| `totalConnectionMinutes` dans `PerformanceCommercialDto` | `src/metriques/dto/create-metrique.dto.ts` | ✅ Calculé, affiché dans colonne "Heures co." (tableau liste admin) |

### Gaps identifiés

#### Gap 1 — Fiabilité : sessions non fermées sur déconnexion socket/idle

| Point de déconnexion | Fichier | Appelle `logLogout()` ? |
|---------------------|---------|-------------------------|
| Logout HTTP (`/auth/logout`) | `auth.controller.ts` | ✅ Oui |
| disconnect-all job | `disconnect-all-commercials.job.ts` | ✅ Oui |
| **Socket disconnect** (`handleDisconnect`) | `whatsapp_message.gateway.ts` L.291 | ❌ Non — met `isConnected=false` seulement |
| **Idle disconnect job** (`IdleDisconnectJob`) | `idle-disconnect.job.ts` L.69 | ❌ Non — met `isConnected=false` seulement |

Conséquence : si un commercial ferme l'onglet, perd le réseau ou est déconnecté par idle,
le log dans `messaging_connection_log` reste ouvert (`logoutAt IS NULL`).
Comme `getTotalConnectionMinutes()` utilise `COALESCE(logoutAt, NOW())`,
le temps continue d'augmenter indéfiniment jusqu'au prochain logout HTTP ou disconnect-all.

#### Gap 1b — Fiabilité : sessions multiples ouvertes (double comptage)

`logLogin()` crée toujours une nouvelle ligne sans fermer une éventuelle session précédente.
Si un commercial se reconnecte sans logout propre (refresh, crash réseau, reconnexion socket),
il peut exister plusieurs lignes avec `logoutAt IS NULL` pour le même user.
Avec la requête SUM par intersection, ces sessions se **cumulent** et double-comptent le temps.

Exemple : 2 lignes ouvertes → `COALESCE(logoutAt, NOW())` retourne `NOW()` pour chacune →
le même créneau horaire est compté deux fois.

---

#### Gap 2 — Fiabilité : calcul par intersection de période

La requête actuelle dans `getTotalConnectionMinutes()` et `getBulkConnectionMinutes()` :
```sql
WHERE log.loginAt >= :dateStart AND log.loginAt <= :dateEnd
```
Ne comptabilise pas les sessions commencées **avant** la période mais encore actives dedans.
Exemple : un commercial se connecte à 23h55 le lundi soir → pour le mardi, son temps de connexion
sera 0 même s'il était connecté jusqu'à 2h du matin.

#### Gap 3 — Affichage : `CommercialStatsDto` incomplet

Le endpoint `/auth/me/stats` (front commercial) et `/users/:id/stats` (admin tab statistiques)
utilisent `CommercialStatsService.getStats()` qui ne retourne pas `totalConnectionMinutes`.
Le DTO `CommercialStatsDto` n'a pas ce champ, ni les types TypeScript côté front/admin.

---

## 2. Architecture cible

```
[Login HTTP] ─────────────────────────────► ConnectionLogService.logLogin()   ← US-0d: ferme session existante avant d'en créer une
[Logout HTTP] ────────────────────────────► ConnectionLogService.logLogout()  ✅ existant
[disconnect-all] ─────────────────────────► ConnectionLogService.logLogout()  ✅ existant
[Socket disconnect] ──────────────────────► ConnectionLogService.logLogout()  ← US-0a AJOUT
[Idle disconnect job] ────────────────────► ConnectionLogService.logLogout()  ← US-0b AJOUT
                                                        │
                                               messaging_connection_log
                                                        │
ConnectionLogService.getTotalConnectionMinutes()        │ ← US-0c: requête intersection
ConnectionLogService.getBulkConnectionMinutes()         │ ← US-0c: requête intersection
                                                        │
CommercialStatsService.getStats()  ───── appelle ───────┘ ← US-1
        │
CommercialStatsDto { totalConnectionMinutes: number }  ← US-1
        │
        ├── GET /auth/me/stats  → ActivityPanel (front commercial)  ← US-3
        └── GET /users/:id/stats → tab "Statistiques" (admin)       ← US-2
```

---

## 3. Stories d'implémentation

### US-0a — Fiabiliser : fermer la session sur disconnect socket

**Fichiers :**
- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- `message_whatsapp/src/whatsapp_message/whatsapp_message.module.ts`

**Contexte :**  
`WhatsappMessageModule` n'importe pas `ConnectionLogModule`.  
`WhatsappMessageGateway` n'injecte pas `ConnectionLogService`.

**Changements :**

#### `whatsapp_message.module.ts`
Ajouter dans `imports[]` :
```typescript
import { ConnectionLogModule } from 'src/connection-log/connection-log.module';
// ...
ConnectionLogModule,
```

#### `whatsapp_message.gateway.ts`
1. Ajouter l'import :
   ```typescript
   import { ConnectionLogService } from 'src/connection-log/connection-log.service';
   ```
2. Injecter dans le constructeur (après les injections existantes) :
   ```typescript
   private readonly connectionLogService: ConnectionLogService,
   ```
3. Dans `handleDisconnect()`, après `this.connectedAgents.delete(client.id)` et avant `updateStatus()` :
   ```typescript
   void this.connectionLogService.logLogout(agent.commercialId, 'commercial');
   ```
   L'appel est `void` (fire-and-forget) pour ne pas bloquer le cycle de déconnexion.

---

### US-0b — Fiabiliser : fermer la session sur idle disconnect

**Fichier :** `message_whatsapp/src/jorbs/idle-disconnect.job.ts`

**Contexte :**  
`JorbsModule` importe déjà `ConnectionLogModule` (L.35). Il suffit d'injecter le service.

**Changements :**

1. Ajouter l'import :
   ```typescript
   import { ConnectionLogService } from 'src/connection-log/connection-log.service';
   ```
2. Injecter dans le constructeur :
   ```typescript
   private readonly connectionLogService: ConnectionLogService,
   ```
3. Dans la boucle `for (const commercial of idleCommercials)`, après le `save()` et avant le `server.emit()` :
   ```typescript
   await this.connectionLogService.logLogout(commercial.id, 'commercial');
   ```
   `await` et non `void` : on est dans une boucle `async` contrôlée, la fermeture du log fait partie
   de l'effet attendu du job. Une erreur doit être catchée et loggée (déjà couvert par le `try/catch`
   existant autour du bloc).

---

### US-0c — Fiabiliser : calcul par intersection de période

**Fichier :** `message_whatsapp/src/connection-log/connection-log.service.ts`

**Problème :** La requête actuelle filtre `WHERE loginAt >= dateStart` — elle ignore les sessions
qui ont démarré avant la période mais chevauchent la fenêtre de calcul.

**Nouvelle logique SQL pour les deux méthodes :**

```sql
-- Inclure les sessions qui se chevauchent avec la période [dateStart, dateEnd]
WHERE log.loginAt <= :dateEnd
  AND COALESCE(log.logoutAt, :now) >= :dateStart

-- Calcul du temps intersecté uniquement :
SUM(
  TIMESTAMPDIFF(
    MINUTE,
    GREATEST(log.loginAt, :dateStart),
    LEAST(COALESCE(log.logoutAt, :now), :dateEnd)
  )
)
```

**Changements dans `getTotalConnectionMinutes()` :**
- Remplacer les conditions `WHERE` et la formule `SUM`
- La condition devient : `loginAt <= :dateEnd AND COALESCE(logoutAt, :now) >= :dateStart`
- La somme devient : `SUM(TIMESTAMPDIFF(MINUTE, GREATEST(log.loginAt, :dateStart), LEAST(COALESCE(log.logoutAt, :now), :dateEnd)))`

**Changements dans `getBulkConnectionMinutes()` :**
- Même correction, même logique.

> Note : `GREATEST` et `LEAST` sont des fonctions MySQL natives.
> Le résultat ne peut pas être négatif car la condition WHERE garantit l'intersection.

---

### US-0d — Fiabiliser : éviter les sessions multiples ouvertes sur reconnexion

**Fichier :** `message_whatsapp/src/connection-log/connection-log.service.ts`

**Problème :** `logLogin()` crée toujours une nouvelle ligne sans vérifier si une session est déjà
ouverte pour ce user. Sur une reconnexion sans logout propre, on obtient plusieurs lignes
`logoutAt IS NULL` → le calcul SUM les cumule → double comptage.

**Correction :** `logLogin()` doit fermer **toutes** les sessions ouvertes existantes avant d'en créer
une nouvelle — pas seulement la dernière.

`logLogout()` existant utilise `findOne(..., order: loginAt DESC)` → il n'en ferme qu'une.
Si la base contient plusieurs anciennes lignes `logoutAt IS NULL` (données historiques polluées),
appeler `logLogout()` une seule fois ne suffirait pas à garantir l'unicité.

Ajouter une méthode privée `closeOpenSessions()` qui fait un UPDATE en masse, puis l'utiliser dans `logLogin()` :

```typescript
private async closeOpenSessions(
  userId: string,
  userType: ConnectionUserType,
): Promise<void> {
  await this.repo.update(
    { userId, userType, logoutAt: IsNull() },
    { logoutAt: new Date() },
  );
}

async logLogin(userId: string, userType: ConnectionUserType): Promise<ConnectionLog> {
  await this.closeOpenSessions(userId, userType);

  const log = this.repo.create({
    userId,
    userType,
    loginAt: new Date(),
    logoutAt: null,
  });
  return this.repo.save(log);
}
```

> `IsNull()` est déjà importé dans `connection-log.service.ts` (utilisé dans `logLogout()`).

**Pourquoi un UPDATE et pas un appel à `logLogout()` en boucle :** un seul `UPDATE` SQL cible
toutes les lignes en une passe. Robuste même sur une base historiquement polluée avec N lignes ouvertes.

**Impact sur l'existant :** aucun — `logLogin()` est appelé uniquement dans `auth.controller.ts`.
`logLogout()` n'est pas modifié : il reste utile tel quel pour les déconnexions unitaires (socket, idle, HTTP).

---

### US-1 — Backend : Enrichir `CommercialStatsDto` avec le temps de connexion

**Fichiers :**
- `message_whatsapp/src/whatsapp_commercial/dto/commercial-stats.dto.ts`
- `message_whatsapp/src/whatsapp_commercial/commercial-stats.service.ts`
- `message_whatsapp/src/whatsapp_commercial/whatsapp_commercial.module.ts`

**Contexte :**  
`WhatsappCommercialModule` n'importe pas `ConnectionLogModule`.  
`CommercialStatsService` n'injecte pas `ConnectionLogService`.

**Changements :**

#### `whatsapp_commercial.module.ts`
Ajouter dans `imports[]` :
```typescript
import { ConnectionLogModule } from 'src/connection-log/connection-log.module';
// ...
ConnectionLogModule,
```

#### `commercial-stats.dto.ts`
Ajouter le champ :
```typescript
/** Durée totale de connexion en minutes sur la période */
totalConnectionMinutes: number;
```

#### `commercial-stats.service.ts`
1. Ajouter l'import :
   ```typescript
   import { ConnectionLogService } from 'src/connection-log/connection-log.service';
   ```
2. Injecter dans le constructeur :
   ```typescript
   private readonly connectionLogService: ConnectionLogService,
   ```
3. Dans `getStats()`, ajouter `getTotalConnectionMinutes()` dans le `Promise.all()` :
   ```typescript
   const [
     messagesRead,
     messagesHandled,
     conversationsReceived,
     conversationsReplied,
     conversationsHandledRows,
     totalConnectionMinutes,   // ← index 5 (nouveau)
   ] = await Promise.all([
     // ...5 requêtes existantes...
     this.connectionLogService.getTotalConnectionMinutes(
       commercialId,
       'commercial' as const,
       dateStart,
       dateEnd,
     ),
   ]);
   ```
4. Assigner dans le DTO :
   ```typescript
   dto.totalConnectionMinutes = totalConnectionMinutes;
   ```

---

### US-2 — Admin : Afficher le temps de connexion dans le panneau "Statistiques"

**Fichiers :**
- `admin/src/app/lib/definitions.ts`
- `admin/src/app/ui/CommerciauxView.tsx`

**Changements :**

#### `definitions.ts`
Dans le type `CommercialStatsDto`, ajouter :
```typescript
totalConnectionMinutes?: number;
```

#### `CommerciauxView.tsx` — panneau statistiques (L.851-1027)
Ajouter un bloc "Temps de connexion" **indépendant des deux modes** (messages/conversations).
Le placer entre le badge statut en ligne (L.853) et le `ModeToggle` (L.865), ou après les grilles
de KPIs de chaque mode — au choix. Le plus propre est un bloc séparé placé **après** la grille
de KPIs et **avant** la barre de taux de réponse, dans chaque mode.

La carte utilise `formatTemps(totalConnectionMinutes * 60)` — cohérent avec la colonne "Heures co."
du tableau liste (L.596) qui utilise la même conversion (minutes × 60 → secondes → formatTemps).

Importer `Timer` depuis `lucide-react` si absent.

```tsx
{/* Temps de connexion — indépendant du mode */}
{statsMap[statsPanel.id].totalConnectionMinutes != null && (
  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6 flex items-center gap-4">
    <Timer className="w-5 h-5 text-indigo-600 flex-shrink-0" />
    <div>
      <p className="text-xs text-indigo-700 font-medium">Temps de connexion</p>
      <p className="text-xl font-bold text-indigo-900">
        {formatTemps(statsMap[statsPanel.id].totalConnectionMinutes * 60)}
      </p>
    </div>
  </div>
)}
```

Placement exact : après le `ModeToggle` (L.865), avant les blocs `statsMode === 'messages'`
et `statsMode === 'conversations'` — ainsi la carte s'affiche dans les deux modes.

---

### US-3 — Frontend commercial : Afficher le temps de connexion dans `ActivityPanel`

**Fichiers :**
- `front/src/types/chat.ts`
- `front/src/components/sidebar/ActivityPanel.tsx`

**Changements :**

#### `chat.ts`
Dans `CommercialStatsDto` (L.62-70), ajouter :
```typescript
totalConnectionMinutes?: number;
```

#### `ActivityPanel.tsx`
Ajouter une carte "Temps de connexion" pleine largeur (`col-span-2`) sous la grille 2×2 existante.

Vérifier que `formatTemps` est disponible dans `front/src/lib/dateUtils.ts`.
Si absent, utiliser une conversion locale :
```typescript
const formatMinutes = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
```

Importer `Timer` depuis `lucide-react`.

```tsx
{stats.totalConnectionMinutes != null && (
  <div className="bg-indigo-50 rounded-lg p-3 flex items-center gap-3 col-span-2">
    <Timer className="w-4 h-4 text-indigo-600 flex-shrink-0" />
    <div>
      <span className="text-xs font-medium text-indigo-700">Temps de connexion</span>
      <p className="text-xl font-bold text-indigo-800">
        {formatMinutes(stats.totalConnectionMinutes)}
      </p>
    </div>
  </div>
)}
```

---

## 4. Ordre d'exécution

```
US-0d  ──── en premier (garantit 1 session ouverte max par user)
   │
   ▼
US-0a  ┐
US-0b  ├─── en parallèle (indépendants) ────── ferment les sessions sur déconnexion
US-0c  ┘
   │
   ▼
 US-1  (enrichit le DTO backend)
   │
   ├── US-2  (admin, indépendant de US-3)
   └── US-3  (front, indépendant de US-2)
```

US-0d d'abord : c'est la garantie d'unicité à la source — si logLogin() peut créer des doublons,
les corrections US-0a/b ne suffisent pas (crash entre le socket disconnect et le re-login).
US-0a/b/c ensuite, en parallèle.
US-1 en dernier parmi le backend, puis US-2/US-3 en parallèle.

---

## 5. Récapitulatif des fichiers à modifier

| # | User Story | Fichier | Modification |
|---|-----------|---------|-------------|
| 1 | **US-0d** | `src/connection-log/connection-log.service.ts` | Ajouter `closeOpenSessions()` (UPDATE masse), `logLogin()` l'appelle avant de créer la nouvelle ligne |
| 2 | US-0a | `src/whatsapp_message/whatsapp_message.module.ts` | Ajouter `ConnectionLogModule` dans `imports[]` |
| 3 | US-0a | `src/whatsapp_message/whatsapp_message.gateway.ts` | Injecter `ConnectionLogService`, appeler `logLogout()` dans `handleDisconnect()` |
| 4 | US-0b | `src/jorbs/idle-disconnect.job.ts` | Injecter `ConnectionLogService`, appeler `logLogout()` dans la boucle idle |
| 5 | US-0c | `src/connection-log/connection-log.service.ts` | Requête intersection dans `getTotalConnectionMinutes()` et `getBulkConnectionMinutes()` |
| 6 | US-1 | `src/whatsapp_commercial/whatsapp_commercial.module.ts` | Ajouter `ConnectionLogModule` dans `imports[]` |
| 7 | US-1 | `src/whatsapp_commercial/dto/commercial-stats.dto.ts` | Ajouter `totalConnectionMinutes: number` |
| 8 | US-1 | `src/whatsapp_commercial/commercial-stats.service.ts` | Injecter `ConnectionLogService`, calculer dans `getStats()` |
| 9 | US-2 | `admin/src/app/lib/definitions.ts` | Ajouter `totalConnectionMinutes?: number` à `CommercialStatsDto` |
| 10 | US-2 | `admin/src/app/ui/CommerciauxView.tsx` | Carte "Temps de connexion" dans le panneau statistiques |
| 11 | US-3 | `front/src/types/chat.ts` | Ajouter `totalConnectionMinutes?: number` à `CommercialStatsDto` |
| 12 | US-3 | `front/src/components/sidebar/ActivityPanel.tsx` | Carte "Temps de connexion" dans la grille |

**Aucune migration SQL. Aucun nouveau endpoint. Aucun nouveau service.**

---

## 6. Points d'attention

### Garantie d'unicité : au plus une session ouverte par user
Après US-0d, `logLogin()` fait un `UPDATE ... WHERE logoutAt IS NULL` qui ferme **toutes** les lignes
ouvertes en une passe, même sur une base historiquement polluée. À partir du premier login post-déploiement,
la table ne peut avoir qu'une seule ligne `logoutAt IS NULL` par `(userId, userType)`. Le SUM par
intersection ne peut pas double-compter.

### `logLogout()` reste idempotent et inchangé
`logLogout()` cherche `findOne({ logoutAt: IsNull(), order: loginAt DESC })`.
Il n'est pas modifié — il reste utile pour les déconnexions unitaires (socket, idle, HTTP).
Si aucune session ouverte n'existe (double appel), il ne fait rien. Inoffensif.

### `void` vs `await` selon le contexte
- **`handleDisconnect()` (Gateway)** : `void` sans `await` — on est dans un handler socket event,
  ne pas bloquer le cycle de déconnexion. Erreur swallowed, acceptable pour un log non-critique.
- **`IdleDisconnectJob` (loop)** : `await` — on est dans une boucle async contrôlée avec un `try/catch`
  existant. La fermeture du log fait partie de l'effet attendu du job ; une erreur doit être capturée
  et loggée via le `catch` déjà présent.

### Formatage `formatTemps`
`formatTemps(seconds)` est utilisé dans `CommerciauxView.tsx` L.596 avec `totalConnectionMinutes * 60`.
La conversion `minutes × 60 = secondes` est obligatoire.
Côté front (`ActivityPanel.tsx`), vérifier d'abord si `formatTemps` existe dans `front/src/lib/dateUtils.ts`.

### Session active dans le calcul
`COALESCE(logoutAt, NOW())` assure qu'une session actuellement ouverte est comptée jusqu'à l'instant T.
Ce comportement est correct : le commercial voit son temps augmenter en temps réel si le composant
est rafraîchi.

### `QueueService` bulk reset (L.519) — hors scope
`QueueService` fait un `UPDATE whatsapp_commercial SET isConnected=false` en masse au `QUEUE_BOOTSTRAP`
(redémarrage serveur). Il ne ferme pas les logs. Un redémarrage serveur peut donc laisser des sessions
orphelines dans `messaging_connection_log` si aucun mécanisme de clôture au boot n'existe.
Ce cas est hors scope de ce plan : corriger nécessiterait un hook `onModuleInit` dans un service dédié,
et `disconnect-all` est censé être exécuté manuellement avant tout redémarrage planifié.
À documenter dans le runbook de déploiement comme limitation connue.

---

## 7. Critères de validation

**US-0d :**
- [ ] Deux logins consécutifs sans logout → une seule ligne `logoutAt IS NULL` en base
- [ ] Base polluée avec 3 lignes `logoutAt IS NULL` → après login, toutes les 3 sont fermées, une nouvelle est créée
- [ ] Premier login (aucune session existante) → `closeOpenSessions()` ne plante pas, session créée normalement

**US-0a/b :**
- [ ] Fermer l'onglet navigateur → le log se ferme dans les secondes suivantes (socket disconnect)
- [ ] Un commercial idle → le log se ferme quand `IdleDisconnectJob` le déconnecte
- [ ] Double appel `logLogout()` (socket + idle simultané) → aucune erreur, second appel no-op

**US-0c :**
- [ ] Session démarrant avant minuit → comptée correctement pour le lendemain (période `today`)
- [ ] Session entièrement dans la période → résultat identique à l'ancienne requête

**US-1/2/3 :**
- [ ] `GET /auth/me/stats` retourne `totalConnectionMinutes` ≥ 0
- [ ] `GET /users/:id/stats` retourne `totalConnectionMinutes` ≥ 0
- [ ] Tab "Statistiques" admin affiche la carte "Temps de connexion" avec valeur formatée "Xh Ym"
- [ ] Onglet "Mon activité" (front commercial) affiche la carte "Temps de connexion"
- [ ] La valeur est cohérente avec la colonne "Heures co." du tableau liste admin (même période, même commercial)
- [ ] 0 erreur TypeScript dans `front/`, `admin/` et `message_whatsapp/`
