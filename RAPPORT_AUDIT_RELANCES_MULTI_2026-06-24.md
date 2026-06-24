# Rapport d'audit — Feature « Multi-tentatives de relance avant fermeture de fenêtre WhatsApp »

Date : 2026-06-24
Périmètre : backend `message_whatsapp/`, admin `admin/`
Branche : `production`

---

## 1. Synthèse exécutive

**Statut global : APPROUVÉ AVEC RÉSERVES — corrections requises avant merge.**

La feature est globalement bien conçue : le passage d'un flag booléen (`lastWindowReminderSentAt`) à un journal de tentatives (`window_reminder_log`) est la bonne approche, l'anti-concurrence par contrainte `UNIQUE(session_id, attempt_number)` est solide, et l'invalidation sur réponse client est en place. La logique métier critique (« fenêtre expirée → pas d'envoi », « client répond → invalider ») est correctement implémentée sur le **chemin nominal**.

Cependant, l'audit révèle **4 angles morts CRITIQUES** qui doivent être traités :

1. **Tests cassés** — le constructeur de `ChatSessionService` a gagné une dépendance (`WindowReminderLog` repo) non fournie dans le spec existant → la suite `chat-session.service.spec.ts` ne compile/instancie plus.
2. **Ordre de tentative calculé par `COUNT(*)` séparé dans la boucle** → N+1 réel + race condition (deux crons concurrents calculent le même `nextAttemptNumber`).
3. **`markWindowReminderAttempt()` AVANT l'envoi, avec envoi qui avale ses erreurs** → une tentative est comptabilisée comme « envoyée » même si l'envoi WhatsApp a échoué → perte définitive d'une tentative.
4. **Chemin d'entrée legacy** (`handleIncomingMessageLegacy`, actif si `FF_UNIFIED_WEBHOOK_ROUTER=false`) **n'appelle jamais `onClientMessage()`** → ni invalidation des relances, ni recalcul de fenêtre.

Aucun test ne couvre la nouvelle logique multi-tentatives (question 15).

---

## 2. Angles morts classés

### 🔴 CRITIQUE

#### C1 — Tests existants cassés par la nouvelle dépendance du constructeur
`ChatSessionService` injecte désormais `@InjectRepository(WindowReminderLog)` (`chat-session.service.ts:26-27`), mais `chat-session.service.spec.ts:54-60` ne déclare que les providers `ChatSession`, `WhatsappChat` et `DataSource`. NestJS échouera à résoudre `WindowReminderLogRepository` → tout le fichier de tests tombe.

> Fichier : `message_whatsapp/src/chat-session/chat-session.service.spec.ts:54-61`

**Correctif** : ajouter le provider manquant.
```typescript
import { WindowReminderLog } from './entities/window-reminder-log.entity';
// ...
const windowReminderLogRepo = mockRepository<WindowReminderLog>();
// dans providers:
{ provide: getRepositoryToken(WindowReminderLog), useValue: windowReminderLogRepo },
```
Vérifier de même tous les specs qui instancient `AutoMessageMasterJob` (le job dépend de `ChatSessionService`).

---

#### C2 — `nextAttemptNumber` via `COUNT(*)` séparé dans la boucle : N+1 + race condition
Dans `runWindowReminder()`, pour chaque session candidate un `SELECT COUNT(*)` séparé est exécuté (`auto-message-master.job.ts:564-568`). C'est :
- un **N+1 de fait** : avec 100 sessions éligibles → 100 requêtes supplémentaires (s'ajoutent aux 3 sous-requêtes déjà présentes dans la query principale, cf. I1) ;
- une **race condition** : si deux instances du cron tournent (ou un chevauchement d'exécution), elles lisent le même `COUNT(*)=N` et calculent toutes deux `nextAttemptNumber=N+1`. La contrainte `UNIQUE` protège l'intégrité (la 2ᵉ `INSERT` renvoie 1062 → `marked=false`), donc **pas de double envoi** — mais le numéro de tentative est dérivé d'une lecture non transactionnelle.

> Fichier : `message_whatsapp/src/jorbs/auto-message-master.job.ts:563-568`

**Correctif recommandé** : remonter le compte de tentatives directement dans la query principale via la jointure/agrégat, ou exposer `MAX(attempt_number)` par session déjà calculé. Exemple — ajouter une colonne calculée à la query de sélection :
```typescript
.addSelect(
  `(SELECT COUNT(*) FROM window_reminder_log l WHERE l.session_id = s.id)`,
  'attempt_count',
)
// puis getRawAndEntities() pour récupérer attempt_count par session
```
Et calculer `nextAttemptNumber = attemptCount + 1` sans requête supplémentaire dans la boucle. Idéalement, encapsuler « calcul du prochain numéro + insert » dans une seule méthode de service qui fait l'`INSERT ... SELECT COALESCE(MAX(attempt_number),0)+1` de façon atomique, en s'appuyant toujours sur la contrainte `UNIQUE` pour la sérialisation.

---

#### C3 — Tentative marquée « envoyée » avant l'envoi réel, qui avale ses erreurs
Séquence dans la boucle (`auto-message-master.job.ts:592-598`) :
1. `markWindowReminderAttempt(...)` → **INSERT dans `window_reminder_log`** ;
2. `sendWindowReminderWithTemplate(...)` → envoi WhatsApp.

Or `sendWindowReminderWithTemplate` **capture et avale ses propres erreurs** (`message-auto.service.ts:498-503` : try/catch + logger, pas de re-throw). Conséquence : si l'API WhatsApp échoue (timeout, channel down, token expiré), la tentative est **déjà comptabilisée** dans le journal. Le compteur monte vers `maxAttempts` sans qu'aucune relance n'ait réellement atteint le client → **perte sèche de tentatives**.

C'est exactement le scénario décrit en question 4 : oui, le risque « marqué envoyé mais pas envoyé » est réel.

> Fichiers : `message_whatsapp/src/jorbs/auto-message-master.job.ts:592-598` + `message_whatsapp/src/message-auto/message-auto.service.ts:461-508`

**Correctif** : deux options.
- **(a) recommandée** : faire remonter le succès/échec de l'envoi. `sendWindowReminderWithTemplate` doit retourner `boolean` (ou re-`throw`). Si l'envoi échoue, **supprimer la ligne** de `window_reminder_log` qu'on vient d'insérer (compensation), afin que la tentative soit rejouable au prochain tick :
```typescript
const marked = await this.chatSessionService.markWindowReminderAttempt(session.id, nextAttemptNumber, chat.id);
if (!marked) return;
const sent = await this.messageAutoService.sendWindowReminderWithTemplate(chat.chat_id, template);
if (!sent) {
  await this.chatSessionService.deleteWindowReminderAttempt(session.id, nextAttemptNumber);
}
```
- **(b)** : ne marquer qu'après envoi réussi — mais on perd alors la garantie anti-concurrence pré-envoi (deux instances pourraient envoyer avant que l'une ait marqué). L'option (a) conserve le verrou et compense en cas d'échec.

---

#### C4 — Le chemin d'ingestion legacy n'appelle pas `onClientMessage()`
`onClientMessage()` (qui déclenche `markClientRespondedToReminder()` ET le recalcul de la fenêtre) n'est appelé **que** depuis le routeur unifié : `webhooks/inbound-message.service.ts:165`.

Le chemin legacy `WhapiService.handleIncomingMessageLegacy()` (`whapi.service.ts:127-159`) persiste le message via `saveIncomingFromWhapi()` **sans aucune synchronisation de session**. Ce chemin est emprunté quand `FF_UNIFIED_WEBHOOK_ROUTER=false` (`whapi.service.ts:89-96`, défaut `true` via `readFlag(..., true)`).

Conséquence si le flag est désactivé : un client peut répondre, ses relances ne sont **jamais invalidées**, et la fenêtre n'est pas prolongée → relances envoyées à un client qui a déjà répondu, voire fenêtre considérée fermée à tort.

> Fichiers : `message_whatsapp/src/whapi/whapi.service.ts:89-159`

**Correctif** : soit confirmer formellement que le legacy est mort (et supprimer le chemin), soit y câbler la synchronisation `ChatSessionService.onClientMessage()` / `openSession()` comme dans le routeur unifié. À documenter dans `CLAUDE.md` (suggestion S1, voir §5).

---

### 🟠 IMPORTANT

#### I1 — 3 sous-requêtes corrélées sur `window_reminder_log` par session (question 1)
La query de sélection (`auto-message-master.job.ts:534-543`) embarque, pour **chaque** ligne de session évaluée par MySQL :
- `(SELECT COUNT(*) ...) < maxAttempts`
- `NOT EXISTS (SELECT 1 ... client_responded_at IS NOT NULL)`
- deux fois `(SELECT MAX(sent_at) ...)` (la sous-requête `MAX` est dupliquée à l'identique lignes 541-542).

Ce n'est pas un N+1 ORM (c'est une seule requête SQL), mais c'est 4 sous-requêtes corrélées non couvertes par un index optimal. À volume élevé de sessions actives, le coût est quadratique côté planner.

**Correctifs** :
- Factoriser le `MAX(sent_at)` dupliqué (lignes 541-542) — un seul calcul.
- Remplacer les sous-requêtes corrélées par un `LEFT JOIN` sur un agrégat pré-calculé :
  ```sql
  LEFT JOIN (
    SELECT session_id,
           COUNT(*) AS cnt,
           MAX(sent_at) AS last_sent,
           MAX(client_responded_at) AS last_resp
    FROM window_reminder_log GROUP BY session_id
  ) agg ON agg.session_id = s.id
  ```
  puis filtres sur `agg.cnt`, `agg.last_sent`, `agg.last_resp`. Cela fournit aussi le `cnt` nécessaire pour C2 (suppression du `COUNT(*)` dans la boucle).
- Vérifier qu'un index couvre `window_reminder_log (session_id, sent_at, client_responded_at)` (l'index actuel `idx_wrl_session_responded (session_id, client_responded_at)` ne couvre pas `sent_at`).

#### I2 — Race condition fenêtre entre la query et l'envoi (question 2)
`s.autoCloseAt > NOW()` (ligne 528) garantit la non-expiration **au moment de la query**, mais entre la sélection et l'envoi réel (qui peut être différé par les envois précédents de la boucle + le `typingStart`), la fenêtre peut expirer. Aucune re-vérification `autoCloseAt > now` n'est faite juste avant `sendWindowReminderWithTemplate`. Risque : envoyer une relance hors fenêtre (échec provider, ou message hors-fenêtre facturé/refusé selon provider).

**Correctif** : re-tester `session.autoCloseAt > new Date()` à l'intérieur du `safeSend`, juste avant l'envoi (la session est déjà chargée en mémoire, coût nul). Idéalement borner aussi la marge (ne pas relancer s'il reste < X minutes au moment de l'envoi).

#### I3 — Aucune validation « intervalle × (tentatives−1) ≤ fenêtre » (questions 14)
Rien — ni backend (DTO `update-cron-config.dto.ts:117-127`) ni frontend (`MessageAutoView.tsx:340-361`) — n'empêche une config incohérente : ex. `maxAttempts=4`, `intervalMin=60` → 180 min nécessaires alors que la fenêtre normale commence à relancer à `normalEndMin=120` min avant fermeture. Résultat silencieux : les dernières tentatives ne partent jamais (plus assez de temps avant `autoCloseAt`), sans alerte pour l'admin.

**Correctif** : ajouter une validation croisée. Backend = validateur custom sur le DTO (`@ValidateIf` / validateur de classe vérifiant `intervalMin * (maxAttempts-1) <= normalEndMin`). Frontend = message d'avertissement sous le champ si la contrainte est violée. La validation backend est la garantie (frontière), le frontend est l'UX.

#### I4 — Aucun test sur la nouvelle logique (question 15)
Grep `markWindowReminderAttempt|markClientRespondedToReminder|runWindowReminder|WindowReminderLog` sur `**/*.spec.ts` → **0 résultat**. Aucune couverture de :
- idempotence `markWindowReminderAttempt` (retour `false` sur 1062) ;
- `markClientRespondedToReminder` avec 0 ligne affectée (cf. M1) ;
- éligibilité multi-tentatives (intervalle respecté, plafond `maxAttempts`, exclusion si `client_responded_at` non nul) ;
- backward-compat `maxAttempts=1` (cf. question 9).

**Correctif** : ajouter une suite de tests unitaires dédiée. C'est un point bloquant au regard du workflow projet (« ne jamais livrer une feature sans passer par tester »).

---

### 🟡 MINEUR

#### m1 — `markClientRespondedToReminder` avec 0 ligne : silencieux (question 6)
L'`UPDATE ... WHERE session_id = ? AND client_responded_at IS NULL` (`chat-session.service.ts:319-327`) n'affecte aucune ligne quand la session n'a jamais eu de relance. **Aucune erreur** n'est levée (un `UPDATE` à 0 ligne réussit en SQL). Comportement correct et silencieux. RAS — simplement confirmé non problématique.

#### m2 — `lastWindowReminderSentAt` / `last_window_reminder_sent_at` : champs morts (question 8)
La colonne existe toujours sur `ChatSession` (`chat-session.entity.ts:49-50`) et sur `WhatsappChat` (`whatsapp_chat.entity.ts:305-307`, commentée « cache »), mais la nouvelle logique ne l'écrit plus jamais (seul `openSession` la met à `null`, `chat-session.service.ts:113`). Aucune **lecture** dans le code source (`src/**`) ne s'appuie dessus pour une décision → pas de bug fonctionnel, mais **dette / champ trompeur** : le commentaire « source de vérité » est désormais faux. Restera `NULL` indéfiniment.

**Correctif (non bloquant)** : soit retirer les colonnes (migration de nettoyage), soit corriger les commentaires pour indiquer qu'elles sont dépréciées au profit de `window_reminder_log`. Référencé aussi dans la factory de test `test/factories/conversation.factory.ts:75`.

#### m3 — Méthode `markWindowReminderSent` dépréciée conservée
`chat-session.service.ts:334-336` garde un wrapper `@deprecated` délégant à `markWindowReminderAttempt(sessionId, 1, ...)`. Vérifier qu'aucun appelant vivant ne l'utilise (grep) ; si mort, supprimer pour éviter la confusion.

#### m4 — `_whatsappChatId` inutilisé dans `markWindowReminderAttempt`
Le paramètre `_whatsappChatId` (`chat-session.service.ts:294`) n'est pas utilisé. Préfixe `_` correct, mais autant le retirer de la signature et des appelants (`auto-message-master.job.ts:592-594`) pour clarifier.

#### m5 — Numéro de tentative non garanti contigu après compensation (lié à C3)
Si on adopte la compensation (C3 option a), un échec laisse un « trou » potentiel si une autre instance a inséré entre-temps. La contrainte `UNIQUE(session_id, attempt_number)` reste respectée, mais `attempt_number` peut sauter une valeur. Sans impact fonctionnel (le `COUNT(*)`/plafond reste cohérent), à documenter.

---

## 3. Réponses ciblées aux 15 questions

| # | Question | Verdict |
|---|----------|---------|
| 1 | N+1 sur les 3 sous-requêtes ? | Pas un N+1 ORM, mais sous-requêtes corrélées coûteuses + `MAX` dupliqué → **I1**. Optimiser via LEFT JOIN agrégat. |
| 2 | `autoCloseAt > NOW()` suffit ? Race query↔envoi ? | Garantit au moment de la query seulement. Race réelle entre sélection et envoi → **I2**. Re-vérifier avant envoi. |
| 3 | `COUNT(*)` séparé dans la boucle = N+1 ? | **Oui — C2** (N+1 + race). Remonter le compte dans la query principale. |
| 4 | `safeSend` garantit-il l'envoi ? Marqué envoyé mais pas envoyé ? | `safeSend` existe (`auto-message-master.job.ts:670-681`) mais avale les erreurs ; pire, l'envoi interne avale **aussi** (`message-auto.service.ts:498`). Marquage AVANT envoi → **C3** : tentative perdue si échec. |
| 5 | `sessionId` toujours le bon dans `onClientMessage` ? | L'`activeSessionId` est résolu/fallback via `getActiveSession` (`inbound-message.service.ts:154-162`) → correct sur le chemin unifié. Mais **C4** : chemin legacy non couvert. |
| 6 | UPDATE 0 ligne → erreur ? | Non, **silencieux et correct** — **m1**. |
| 7 | Tous les chemins entrants appellent `onClientMessage` ? | **Non — C4**. Seul le routeur unifié l'appelle ; legacy (`FF_UNIFIED_WEBHOOK_ROUTER=false`) ne l'appelle pas. |
| 8 | `lastWindowReminderSentAt` encore lue ? | Plus aucune lecture décisionnelle, écrite seulement à `null`. Champ mort/trompeur → **m2**. Pas de bug, mais dette. |
| 9 | `maxAttempts=1` ≡ ancienne logique ? Backward-compat ? | Oui : avec `maxAttempts=1`, `COUNT(*)<1` ⇔ aucune ligne ⇔ comportement « 1 seul J par session ». Compatible. À **prouver par test** (I4). |
| 10 | `chat_session` existe au moment de la migration ? | **Risque sur DB fraîche** : `AddWindowReminderMultiAttempt` porte le timestamp `1750867200001`, **antérieur** à `AddChatSessionEntity` (`1780531200000`). TypeORM ordonne par timestamp → la nouvelle migration (FK vers `chat_session`) s'exécuterait **avant** la création de `chat_session` → échec FK. En prod déjà déployée, `chat_session` existe donc seule la nouvelle migration tourne (OK), mais un environnement neuf (CI, nouveau tenant) casserait. Voir **§4**. |
| 11 | `down()` cohérent ? | `down()` drop la table + colonnes mais ne « restaure » pas `lastWindowReminderSentAt`. Comme ce champ n'est plus la source de vérité, l'état après rollback redevient « 1 J par session via le flag » — cohérent **seulement si** le code rollback correspondant est aussi déployé. Rollback code+DB couplé : acceptable, à noter. |
| 12 | Champs sauvegardés ET rechargés ? | **Oui** : payload `handleSave` (`MessageAutoView.tsx:174-175`) + `load` (`:127-128`). Types présents (`definitions.ts:709-710, 736-737`). OK. |
| 13 | `attemptIntervalMin` rechargé même si caché ? | **Oui** : le state est chargé inconditionnellement dans `load` (`:128`) ; l'affichage conditionnel `maxAttempts > 1` (`:350`) ne dépend pas du chargement. La valeur survit au rechargement. OK. |
| 14 | Validation `interval × (maxAttempts−1) < fenêtre` ? | **Absente — I3** (ni back ni front). |
| 15 | Tests sur la nouvelle logique ? | **Aucun — I4**. De plus, tests existants cassés — **C1**. |

---

## 4. Focus migration / ordre d'exécution (questions 10-11)

`AddWindowReminderMultiAttempt1750867200001` (juin **2025** en epoch) crée une FK `fk_wrl_session → chat_session(id)`. La table `chat_session` est créée par `AddChatSessionEntity1780531200000` (juin **2026** en epoch). TypeORM exécute les migrations **par ordre croissant du timestamp** extrait du nom de classe → `1750…` passe **avant** `1780…`.

- **Prod déjà déployée** : `chat_session` existe déjà (migration antérieurement appliquée), seule la nouvelle migration non-exécutée tourne → **OK**.
- **Base neuve / CI from scratch / restauration** : la nouvelle migration tenterait de créer une FK vers une table inexistante → **échec de déploiement**.

**Correctif** : renommer la migration avec un timestamp **postérieur** à `1780531200000` (et à toutes les migrations chat_session : `AddWindowReminderCronFields1780531200002` etc.), p.ex. `AddWindowReminderMultiAttempt1780600000000`, classe `AddWindowReminderMultiAttempt1780600000000`. Comme la migration n'est probablement pas encore appliquée en prod, le renommage est sans risque ; si elle l'est déjà, prévoir une entrée corrective dans la table `migrations`.

> Fichiers : `message_whatsapp/src/database/migrations/AddWindowReminderMultiAttempt1750867200001.ts` (renommer)

Note `down()` : ordre de drop correct (colonnes `cron_config` puis table). Le `DROP TABLE` sans `IF EXISTS` est acceptable. La FK `ON DELETE CASCADE` est cohérente (suppression de session → purge du journal).

---

## 5. Points correctement implémentés

- **Modèle de données** : passage flag → journal `window_reminder_log` = bonne décision. Contrainte `UNIQUE(session_id, attempt_number)` + gestion `errno 1062` dans `markWindowReminderAttempt` (`chat-session.service.ts:296-313`) = anti-concurrence propre, pas de double envoi.
- **Invalidation sur réponse** : `markClientRespondedToReminder` appelé dans `onClientMessage` (`chat-session.service.ts:187`), filtre `client_responded_at IS NULL` idempotent.
- **Exclusion des sessions déjà répondues** dans la query (`NOT EXISTS ... client_responded_at IS NOT NULL`, ligne 538) — règle métier respectée.
- **Respect de la fenêtre** : bornage `autoCloseAt BETWEEN min AND max` distinct normal/CTWA (lignes 529-532) + `autoCloseAt > NOW()` (ligne 528).
- **Respect de l'intervalle** entre tentatives via `MAX(sent_at) <= intervalThreshold` (lignes 540-543).
- **Fast-exit** si aucun template J actif (lignes 505-509) — évite tout le travail si la feature n'est pas configurée.
- **Scope-awareness** : `scopeConfigService.isEnabledFor` + `getTemplateForTrigger` scope-aware, cohérent avec les triggers A–I.
- **Sélection J1/J2** (with_replies / no_replies) basée sur `lastPosteMessageAt >= lastClientMessageAt` (lignes 571-577) — logique claire.
- **Admin UI** : sauvegarde/rechargement corrects, affichage conditionnel de l'intervalle, bornes UI `1–5` / `5–240` alignées avec le DTO (`@Min/@Max`).
- **Types** : zéro `any` introduit dans le code de la feature ; typage explicite y compris pour le retour MySQL `{ count: string }[]`.

---

## 6. Recommandations correctives — priorisation

**Bloquant avant merge :**
1. **C1** — réparer `chat-session.service.spec.ts` (provider `WindowReminderLog`) + tout spec instanciant `AutoMessageMasterJob`.
2. **C3** — ne pas comptabiliser une tentative dont l'envoi a échoué (faire remonter le succès depuis `sendWindowReminderWithTemplate`, compenser sinon).
3. **C4** — câbler `onClientMessage` sur le chemin legacy **ou** acter formellement sa mort.
4. **Migration §4** — renommer avec un timestamp postérieur à `chat_session`.
5. **I4** — ajouter les tests de la logique multi-tentatives.

**Fortement recommandé :**
6. **C2 / I1** — supprimer le `COUNT(*)` dans la boucle et factoriser les sous-requêtes via un LEFT JOIN agrégat.
7. **I2** — re-vérifier `autoCloseAt` juste avant l'envoi.
8. **I3** — validation croisée `interval × (maxAttempts-1) ≤ fenêtre` (backend + UX front).

**Nettoyage (non bloquant) :**
9. **m2/m3/m4** — déprécier/retirer `lastWindowReminderSentAt`, `markWindowReminderSent`, paramètre inutilisé.

**Suggestion documentation (CLAUDE.md désynchronisé) :**
- **S1** — `CLAUDE.md` décrit le flux entrant via `unified-ingress` uniquement, sans mentionner le chemin legacy `handleIncomingMessageLegacy` (encore actif si `FF_UNIFIED_WEBHOOK_ROUTER=false`) ni le fait que la synchronisation `ChatSession`/relances n'y est pas câblée. À documenter (je n'ai pas les outils d'édition ; déléguer la mise à jour).

---

## 7. Fichiers référencés

- `message_whatsapp/src/jorbs/auto-message-master.job.ts` (runWindowReminder : 491-601 ; COUNT boucle : 563-568 ; mark→send : 592-598)
- `message_whatsapp/src/chat-session/chat-session.service.ts` (onClientMessage : 133-197 ; markWindowReminderAttempt : 291-313 ; markClientRespondedToReminder : 319-327 ; markWindowReminderSent déprécié : 334-336)
- `message_whatsapp/src/chat-session/chat-session.service.spec.ts` (providers incomplets : 54-61)
- `message_whatsapp/src/chat-session/entities/window-reminder-log.entity.ts`
- `message_whatsapp/src/chat-session/entities/chat-session.entity.ts:49-50`
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts:305-307`
- `message_whatsapp/src/message-auto/message-auto.service.ts:461-508` (envoi avalant les erreurs)
- `message_whatsapp/src/webhooks/inbound-message.service.ts:139-191` (seul appelant onClientMessage)
- `message_whatsapp/src/whapi/whapi.service.ts:78-159` (chemin legacy sans sync session)
- `message_whatsapp/src/database/migrations/AddWindowReminderMultiAttempt1750867200001.ts` (timestamp à corriger)
- `message_whatsapp/src/jorbs/entities/cron-config.entity.ts:122-128`
- `message_whatsapp/src/jorbs/dto/update-cron-config.dto.ts:117-127`
- `admin/src/app/ui/MessageAutoView.tsx:101-102, 122-129, 168-176, 340-361`
- `admin/src/app/lib/definitions.ts:704-710, 731-737`
