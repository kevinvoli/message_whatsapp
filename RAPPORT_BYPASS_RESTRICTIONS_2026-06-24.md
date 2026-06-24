# Rapport d'audit — Feature `bypass_restrictions`

**Date** : 2026-06-24
**Périmètre** : backend NestJS (`message_whatsapp/src/`) + admin Next.js (`admin/src/`)
**Auteur** : reviewer (audit sécurité + complétude)

---

## 1. Synthèse exécutive

**Statut global : CHANGES REQUISES.**

La feature est partiellement fonctionnelle mais comporte **deux angles morts critiques qui annulent l'objectif principal** dans le scénario d'usage le plus courant (commercial connecté envoyant un message via la gateway WebSocket), plus un défaut UI bloquant côté commercial.

- La **sécurité est correcte** : tous les endpoints d'activation (`poste`, `users`, `channel`) sont protégés par `AdminGuard`, le `ValidationPipe` global est en `whitelist + forbidNonWhitelisted`, et aucun chemin ne permet à un commercial de s'auto-attribuer le flag.
- En revanche, la **complétude est insuffisante** : la voie d'envoi réelle des commerciaux (la gateway `message:send`) applique plusieurs restrictions **avant** d'appeler `createAgentMessage`, sans jamais consulter `bypassRestrictions`. Le bypass posé dans `createAgentMessage` est donc court-circuité pour ces cas.
- L'**admin UI commerciaux** ne reçoit jamais l'état réel du flag depuis le backend → toggle toujours réinitialisé à `false`, écrasement silencieux de la valeur en base.
- La **couverture de test du bypass est nulle** (le seul test « corrigé » ne fait qu'ajouter `bypassRestrictions: false` à une factory).

Récapitulatif des 5 restrictions visées :

| Restriction | Couverte par le bypass ? | Où |
|---|---|---|
| 1. Response timeout 24h/72h | Partiel — OK dans `createAgentMessage`, **KO dans la gateway** | voir CRITIQUE-1 |
| 2. Read-only (N messages) | OK (`createAgentMessage` + `markConversationAsRead`) | — |
| 3. Content restrictions | Partiel — `validateContent` OK, **minChars KO** | voir CRITIQUE-1 |
| 4. Idle disconnect | OK (`idle-disconnect.job`) | — |
| 5. Read rate limit | OK (`message-read.service`) | — |
| (bonus) Restriction QCM `ConversationRestrictionService` | **Non couverte** | voir IMPORTANT-4 |
| (bonus) Fermeture auto 24h `read-only-enforcement.job` | **Non couverte** | voir IMPORTANT-5 |

---

## 2. Angles morts détectés

### CRITIQUE-1 — La gateway `message:send` ignore `bypassRestrictions` (timeout + minChars)

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

C'est le chemin d'envoi normal d'un commercial (socket `message:send`). Plusieurs guards s'exécutent **avant** l'appel à `createAgentMessage` (ligne 1108) et **aucun ne teste `agent.bypassRestrictions`** :

1. **Fenêtre de messagerie 23h/72h** (lignes 989-1028) : `windowExpired` est calculé puis, si expiré, la conversation est **fermée automatiquement** (`closeExpiredChatByWindowExpiry`, ligne 1011) et un `MESSAGE_SEND_ERROR / WINDOW_EXPIRED` est renvoyé. Le bypass équivalent posé dans `createAgentMessage` (lignes 156-174) n'est jamais atteint. → **Restriction 1 non bypassée pour le commercial connecté.** Pire : la conversation est fermée, effet de bord destructeur.

2. **Restriction min caractères d'envoi** (lignes 1048-1063) : `restrictionCfg.minCharsSendEnabled` bloque avec `MESSAGE_TOO_SHORT` sans tester le bypass. → **Restriction 3 (contenu) partiellement non bypassée.**

À noter : la validation de contenu « lourde » (`validateContent`) est, elle, correctement désactivée via `validateContent: !agent.isDedicated && !agent.bypassRestrictions` (ligne 1117). L'incohérence est donc interne au même handler : une partie du contrôle de contenu respecte le bypass, l'autre non.

**Impact** : pour un commercial connecté (cas nominal), le bypass timeout et minChars est inopérant. L'objectif « si bypass, toutes les restrictions sont désactivées » n'est pas atteint.

**Correctif recommandé** : englober ces guards dans `if (!agent.bypassRestrictions) { ... }`, en particulier la fenêtre 23h/72h (lignes 989-1028) et le bloc minChars (lignes 1048-1063). Pour la fenêtre, attention à ne pas fermer la conversation quand le bypass est actif.

---

### CRITIQUE-2 — L'admin UI commerciaux ne reçoit jamais `bypassRestrictions` (toggle fantôme + écrasement)

**Fichiers** :
- `message_whatsapp/src/metriques/metriques.service.ts` (lignes 647-656 et 793-811)
- `admin/src/app/ui/CommerciauxView.tsx` (lignes 341, 298-304)

La liste des commerciaux de l'admin est alimentée par `getPerformanceCommerciaux` (route `GET /metriques/...`, `MetriquesService`), **pas** par `GET /users`. Or le `SELECT` de cette requête (lignes 647-656) sélectionne `allowOutsideHours` mais **pas `bypassRestrictions`**, et le mapping de retour (lignes 793-811) ne l'inclut pas non plus.

Conséquence en cascade dans `CommerciauxView.tsx` :
- `handleOpenEditModal` (ligne 341) : `setFormBypassRestrictions(commercial.bypassRestrictions ?? false)` → `commercial.bypassRestrictions` est **toujours `undefined`** → le toggle s'affiche **toujours à `false`**, même si la valeur en base est `true`. L'admin ne voit jamais l'état réel.
- `handleUpdateCommercial` (lignes 298-304) : le payload envoie `bypassRestrictions: formBypassRestrictions`. Si l'admin modifie n'importe quel autre champ (nom, email…) sans toucher le toggle, il **réinitialise silencieusement `bypassRestrictions` à `false`** en base via `update()` (service ligne 377-379).

**Impact** : impossible d'auditer ou de maintenir l'état du bypass commercial depuis l'admin ; risque élevé de désactivation accidentelle.

**Correctif recommandé** : ajouter `'commercial.bypassRestrictions as bypassRestrictions'` au `SELECT` (ligne ~653), `bypassRestrictions: Boolean(perf.bypassRestrictions)` au mapping (ligne ~799), et le champ correspondant dans le type `PerformanceCommercial` (`admin/src/app/lib/definitions.ts` ligne ~548).

À noter : pour le **canal** (`ChannelsView.tsx` lignes 466-489) et le **poste** (`PostesView.tsx` ligne 86, source `getPostes` → `findAll()` entité complète), l'initialisation depuis l'API est correcte. Le problème ne touche que le commercial.

---

### IMPORTANT-3 — Le bypass de la gateway est figé à la connexion (pas de recalcul à chaud)

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` (lignes 168-187)

`bypassRestrictions` est résolu une seule fois dans `handleConnection` et stocké dans `connectedAgents`. Si l'admin active le bypass **après** la connexion du commercial, la session en cours ne le voit pas tant que le socket n'est pas recréé.

De plus, le `bypassRestrictions` du **canal** y est résolu via un `COUNT` sur les canaux **dédiés au poste** (`poste_id: posteId, bypassRestrictions: true`, lignes 172-174). Ce calcul ne couvre que les canaux en mode dédié rattachés au poste : un commercial du **pool global** dont le canal effectif d'une conversation a `bypassRestrictions = true` n'est pas couvert par cette résolution « à la connexion ». Le bon niveau de résolution du flag canal est **par conversation** (le canal réel du message), comme c'est fait dans `createAgentMessage` via `channelEarly` (lignes 153-159) — cette partie-là est correcte.

**Impact** : angle mort temporel (activation à chaud sans effet) + résolution canal incomplète pour le pool global côté gateway.

**Correctif recommandé** :
- Soit re-résoudre `bypassRestrictions` dans le handler `message:send` (et `conversation:read`) à partir du canal réel de la conversation, plutôt que de se fier au flag figé de `connectedAgents`.
- Soit, a minima, documenter qu'une activation nécessite une reconnexion et émettre un événement de rafraîchissement de session lors du changement de flag.

---

### IMPORTANT-4 — `ConversationRestrictionService` (restriction QCM) non couvert par le bypass

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` (lignes 822-880, 1069-1104)

La restriction « conversations non répondues » (`restrictionService.checkRestriction`) est exemptée uniquement pour les postes **dédiés** ou si la config est désactivée (`isRestrictionExemptPoste`, lignes 822-828). Elle **n'intègre pas `agent.bypassRestrictions`**. Un commercial bypassé sur poste non-dédié reste donc bloqué par cette restriction (handler `message:send` lignes 1069-1104, ainsi que `conversation:accessed` / `restriction:check`).

La question de l'audit demandait si c'est « couvert ou intentionnellement exclu » : rien dans le code n'indique une exclusion volontaire. Au vu de l'intitulé du toggle UI (« Contourne le timeout de réponse, lecture seule, rate limit et restrictions de contenu »), cette restriction n'est pas listée — ce **pourrait** être un choix, mais il n'est ni documenté ni cohérent avec « TOUTES les restrictions ».

**Correctif recommandé** : trancher explicitement. Si le bypass doit la couvrir, ajouter `agent.bypassRestrictions` à la condition d'exemption (`isRestrictionExemptPoste` ou en amont des blocs lignes 1069 et 838). Sinon, le documenter dans le `CLAUDE.md` et ajuster le libellé du toggle.

---

### IMPORTANT-5 — Fermeture automatique 24h (`read-only-enforcement.job`) non couverte par le bypass

**Fichiers** :
- `message_whatsapp/src/jorbs/read-only-enforcement.job.ts` (lignes 125-133, 191-212)
- `message_whatsapp/src/channel/channel.service.ts` (`getChannelIdsToSkipAutoClose`, lignes 554-565)

Ce cron ferme les conversations dont la fenêtre est expirée. L'ensemble des canaux à ignorer (`buildSkipSet` → `getChannelIdsToSkipAutoClose`) ne filtre que sur `no_close` et `poste_id` (canal dédié). **`bypassRestrictions` n'y est pas pris en compte.** Une conversation rattachée à un canal/poste/commercial avec bypass, mais dont le canal n'est ni dédié ni `no_close`, sera **fermée automatiquement** malgré le bypass.

L'objectif annonce explicitement « idle disconnect » et « response timeout » dans le périmètre ; la fermeture auto 24h est l'expression côté cron de la fenêtre de réponse. Elle devrait donc être bypassée pour rester cohérente avec CRITIQUE-1.

**Correctif recommandé** : étendre `getChannelIdsToSkipAutoClose` (ou la filtration de `read-only-enforcement.job`) pour exclure les canaux avec `bypass_restrictions = true`. Le niveau poste/commercial est plus délicat à résoudre dans ce cron (pas de jointure commercial directe sur le chat) — au minimum couvrir le niveau canal, et documenter la limite poste/commercial.

---

### MINEUR-6 — Aucun indicateur visuel du bypass dans les listes admin

**Fichiers** : `admin/src/app/ui/PostesView.tsx`, `CommerciauxView.tsx`, `ChannelsView.tsx`

Aucune des trois listes n'affiche de badge « Bypass actif » :
- `ChannelsView.tsx` (lignes 717-722) affiche bien des badges `RO` (no_read_only) et `FC` (no_close) mais **pas** de badge bypass, alors que la donnée est disponible côté UI.
- `PostesView.tsx` et `CommerciauxView.tsx` n'ont aucun badge ; pour le commercial c'est de toute façon impossible tant que CRITIQUE-2 n'est pas corrigé (donnée absente).

**Impact** : un flag de sécurité aussi sensible (désactive toutes les protections) devrait être repérable d'un coup d'œil pour éviter les oublis d'activation.

**Correctif recommandé** : ajouter un badge orange « Bypass » dans les trois listes (cohérent avec la couleur orange déjà utilisée pour le toggle).

---

### MINEUR-7 — Couverture de test du bypass inexistante

**Fichier** : `message_whatsapp/src/jorbs/first-response-timeout.job.spec.ts`

Le « test corrigé » mentionné dans le contexte ne teste pas le bypass : il ajoute seulement `bypassRestrictions: false` à la factory `makePoste` (ligne 475) pour satisfaire le type `WhatsappPoste`. Aucun cas ne vérifie qu'un poste/commercial/canal bypassé échappe effectivement aux restrictions.

Aucun test n'existe pour :
- `idle-disconnect.job` avec `bypassRestrictions = true` (les deux `andWhere` lignes 59-63) ;
- `message-read.service.markConversationAsRead` avec `bypassRestrictions = true` (lignes 41-42) ;
- `createAgentMessage` avec chacun des trois niveaux bypassés (lignes 156-159) ;
- la gateway (le `.spec.ts` ne mentionne pas le bypass).

**Correctif recommandé** : ajouter des specs ciblées pour chaque point d'application, en particulier un test confirmant que la gateway `message:send` n'applique pas la fenêtre 23h/minChars quand `agent.bypassRestrictions = true` (une fois CRITIQUE-1 corrigé).

---

### MINEUR-8 — `IN`/évaluation TypeORM de la condition idle-disconnect : OK mais à confirmer

**Fichier** : `message_whatsapp/src/jorbs/idle-disconnect.job.ts` (lignes 59-63)

La condition `(poste.id IS NULL OR poste.bypassRestrictions = :bypassFalse)` est correcte : avec un `leftJoinAndSelect` sur `c.poste`, un commercial sans poste donne `poste.id IS NULL` (TRUE) et la branche `bypassRestrictions` n'est pas évaluée. Pas de bug ici. Le `c.bypassRestrictions = :bypassFalse` (ligne 59) couvre le niveau commercial, et le canal dédié est déjà exclu par le `NOT EXISTS` (lignes 53-58). **Ce job est le plus complet des trois.** Aucune action requise, hormis le test (MINEUR-7).

---

## 3. Points correctement implémentés (confirmations)

- **Sécurité des endpoints (Q6/Q7/Q8)** : `WhatsappCommercialController` (`@UseGuards(AdminGuard)` au niveau classe, ligne 27), `WhatsappPosteController` (`@UseGuards(AdminGuard)` sur `@Patch(':id')` et `@Post()`, lignes 62-63 et 51), `ChannelController` (`@UseGuards(AdminGuard)` au niveau classe, ligne 21). Aucun endpoint exposant `bypassRestrictions` n'est accessible à un commercial.
- **Pas d'auto-attribution possible (Q8)** : il n'existe aucun endpoint commercial (`AuthGuard('jwt')`) acceptant `bypassRestrictions`. Le `ValidationPipe` global (`main.ts` lignes 24-26, `whitelist: true, forbidNonWhitelisted: true`) rejette tout champ non déclaré ; les DTOs `Create*`/`Update*` qui exposent le flag sont tous derrière `AdminGuard`.
- **`createAgentMessage` (Q12)** : le canal utilisé pour le bypass (`channelEarly`, lignes 153-159) est bien le canal du message (`data.channel_id`), résolu en parallèle avec commercial et poste. Le bypass timeout (lignes 163-174), content (lignes 175-185) et read-only (lignes 270-281) sont correctement conditionnés par `bypassed`. Logique correcte sur ce chemin.
- **`message-read.service` (rate limit, restriction 5)** : `markConversationAsRead` saute le rate-limit si `isDedicated || bypassRestrictions` (lignes 41-42). Correct.
- **`idle-disconnect.job` (restriction 4)** : exclut commercial bypassé et poste bypassé (lignes 59-63), en plus du canal dédié. Correct et complet.
- **Migration** : `AddBypassRestrictions1750780800004.ts` respecte la convention de nommage (timestamp 13 chiffres), ajoute les 3 colonnes `TINYINT(1) NOT NULL DEFAULT 0` cohérentes avec `default: false` des entités, et fournit un `down()` symétrique. Conforme.
- **Entités** : les 3 colonnes suivent la convention TypeORM (`name: 'bypass_restrictions'` snake_case, propriété `bypassRestrictions` camelCase). Conforme au `CLAUDE.md`.
- **Admin canal (Q13/Q14 pour le canal)** : `ChannelsView.tsx` initialise le toggle depuis `channel.bypassRestrictions` (ligne 469) et l'envoie via `updateChannel` (lignes 487-489) ; le `GET /channel` renvoie l'entité sanitizée complète (le flag n'est pas dans la liste des champs masqués par `sanitizeChannel`). Correct.
- **Admin poste (Q13/Q14 pour le poste)** : `getPostes` → `WhatsappPosteService.findAll()` renvoie l'entité complète, donc `bypassRestrictions` est présent ; `PostesView.tsx` initialise depuis `poste.bypassRestrictions` (ligne 86) et l'envoie (ligne 129). Correct.
- **Propagation back (update services)** : commercial (`whatsapp_commercial.service.ts` lignes 377-379), poste (`Object.assign` via DTO `bypassRestrictions` présent dans `CreateWhatsappPosteDto`), canal (`Object.assign(channel, dto)`). Les 3 propagent correctement.

---

## 4. Recommandations correctives (priorisées)

| # | Sévérité | Action | Fichier(s) |
|---|---|---|---|
| 1 | CRITIQUE | Conditionner les guards fenêtre 23h/72h et minChars par `!agent.bypassRestrictions` ; ne pas fermer la conversation si bypass | `whatsapp_message.gateway.ts` ~989-1063 |
| 2 | CRITIQUE | Ajouter `bypassRestrictions` au SELECT + mapping de `getPerformanceCommerciaux` + type `PerformanceCommercial` | `metriques.service.ts` ~653/799 ; `definitions.ts` ~548 |
| 3 | IMPORTANT | Re-résoudre le bypass canal par conversation dans la gateway (ou rafraîchir la session à l'activation) | `whatsapp_message.gateway.ts` 168-187 |
| 4 | IMPORTANT | Trancher et implémenter la couverture de `ConversationRestrictionService` ; aligner le libellé du toggle | `whatsapp_message.gateway.ts` 822-828/1069-1104 |
| 5 | IMPORTANT | Exclure les canaux `bypass_restrictions = true` de la fermeture auto | `channel.service.ts` 554-565 ; `read-only-enforcement.job.ts` |
| 6 | MINEUR | Ajouter un badge « Bypass » dans les 3 listes admin | `PostesView.tsx`, `CommerciauxView.tsx`, `ChannelsView.tsx` |
| 7 | MINEUR | Ajouter les specs de bypass (gateway, createAgentMessage, idle, read) | `*.spec.ts` |

### Suggestion CLAUDE.md (désynchronisation)
Le `CLAUDE.md` du projet ne documente pas la feature `bypass_restrictions` ni la règle de résolution « OU des 3 niveaux ». Une fois les correctifs ci-dessus appliqués (notamment le périmètre exact : QCM ? fermeture auto ?), il serait utile d'y ajouter une section décrivant les points d'application du bypass et le niveau de résolution attendu (par conversation pour le canal). Je n'ai pas les outils pour modifier le `CLAUDE.md` ; à déléguer.
