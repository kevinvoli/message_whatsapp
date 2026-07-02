# Plan d'implémentation — Priorités internes

> Branche : `production` · Référence : `RAPPORT_ARCHITECTURE.md`
> Scope : uniquement les améliorations sans dépendance à un service externe tiers

> **Règle d'architecture fondamentale :** Les 3 projets (`message_whatsapp/`, `front/`, `admin/`) sont entièrement auto-suffisants et déployables sur des serveurs distincts. Tout fichier hors de ces 3 répertoires (scripts/, plans .md, docker-compose, package.json racine) est **outillage local uniquement** — les projets ne doivent jamais en dépendre.

---

## Règles de développement durable — OBLIGATIONS ABSOLUES

```
R1. Toute nouvelle feature backend doit avoir ≥ 1 test unitaire sur le service
R2. Tout nouveau hook React doit avoir ≥ 1 test Vitest
R3. Toute migration SQL doit avoir un commentaire décrivant le rollback
R4. Zéro `any` TypeScript — bloquant en PR review
R5. Zéro requête SQL dans une boucle — utiliser IN (:...ids) ou jointures
R6. Tout endpoint exposé publiquement doit être rate-limité
R7. Les constantes Socket.IO ne sont jamais modifiées sans synchroniser TOUS les projets
    → Backend = source de vérité ; front/admin maintiennent des copies identiques
    → Script CI `check:socket-sync` bloque le merge en cas de divergence
    → INTERDIT : package partagé ou `file:` reference croisée (projets indépendants)
R8. Tout élément scrollable dans une flex column doit porter `min-h-0`
    → Pattern obligatoire : `flex-1 min-h-0 overflow-y-auto`
    → Tout conteneur flex intermédiaire dans la même chaîne doit aussi avoir `min-h-0`
    → Sans `min-h-0`, `min-height: auto` (valeur par défaut CSS) empêche le shrink
       et bypasse silencieusement overflow-hidden du parent — le contenu déborde
       sans aucun message d'erreur visible
```

## Points d'excellence à préserver

```
E1. Sécurité webhooks — HMAC + timingSafeEqual + idempotency
E2. Architecture modulaire NestJS — 31 modules bien délimités
E3. CI/CD avec migrations auto — migrations AVANT docker compose up
```

---

## Stratégie anti-régression globale

Chaque phase applique obligatoirement ces 4 garde-fous avant toute mise en production :

```
1. STAGING FIRST — toute modification est testée sur staging (master) avant production
2. FEATURE FLAG — tout changement de comportement est derrière un FF_ désactivé par défaut
3. ROLLBACK DOCUMENTÉ — chaque phase liste explicitement comment annuler le changement
4. SMOKE TEST POST-DEPLOY — liste de vérifications manuelles après chaque déploiement
```

**Ordre de déploiement obligatoire :**
```
Local → Staging (master) → Validation 24h → Production
```
Ne jamais déployer directement sur `production` sans validation staging.

---

## Phase 1 — Tooling qualité (Jalon J1) ✅ COMPLÈTE — 2026-07-01

### 1.1 Prettier + lint-staged + Husky ✅

**Objectif :** standardiser le style de code, bloquer les commits non conformes.

**Configuration `.prettierrc.json` (identique sur les 3 projets) :**
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

**`package.json` — scripts à ajouter :**
```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
  "*.{json,md}": ["prettier --write"]
},
"prepare": "husky install"
```

**Commandes :**
```bash
npm install -D prettier husky lint-staged
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

**Effort :** 0.5 jour

**Livré le 2026-07-01 :**
- `.prettierrc.json` créé sur `front/` et `admin/`
- `.prettierrc` mis à jour sur `message_whatsapp/` (ajout `semi`, `printWidth`, `tabWidth`)
- `.prettierignore` créé sur les 3 projets
- `eslint.config.mjs` mis à jour sur `front/` et `admin/` (ajout `eslintConfigPrettier` en dernier)
- `package.json` mis à jour sur les 3 projets (`lint-staged` config + `prepare: husky`)
- `.husky/pre-commit` créé sur les 3 projets
- `npm install` terminé sur les 3 projets (exit code 0)

---

#### Risques de régression — Phase 1.1

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R1.1a | Prettier entre en conflit avec des règles ESLint existantes → boucle infinie sur `--fix` | Bloque tous les commits | Élevée |
| R1.1b | Husky mal configuré → `--no-verify` généralisé par les devs pour contourner | Perd tout bénéfice du hook | Moyenne |
| R1.1c | Premier `prettier --write` génère un diff massif sur tous les fichiers → git blame illisible | Perd l'historique des auteurs sur les fichiers touchés | Moyenne |
| R1.1d | `lint-staged` appliqué à des fichiers générés (`.next/`, `dist/`) → erreurs parasites | Ralentit les commits | Faible |

**Prévention :**

```bash
# Vérifier la compatibilité ESLint + Prettier AVANT d'activer Husky
npx eslint-config-prettier .eslintrc.js   # liste les règles en conflit
```

Ajouter `eslint-config-prettier` et `eslint-plugin-prettier` :
```json
// .eslintrc → extends
["plugin:@typescript-eslint/recommended", "prettier"]
// "prettier" DOIT être le dernier élément pour écraser les règles conflictuelles
```

Exclure les dossiers générés dans `.prettierignore` :
```
.next/
dist/
node_modules/
*.generated.ts
```

**Procédure de déploiement sans régression :**
1. Appliquer Prettier sur un seul fichier non critique en premier, vérifier le résultat
2. Créer un commit unique `style: apply prettier formatting` (commit isolé, sans revue fonctionnelle)
3. Activer Husky sur la branche `master` uniquement pendant 48h avant `production`
4. Si un dev signale un blocage injustifié : `npx lint-staged --debug` pour diagnostiquer

**Rollback :**
```bash
# Désactiver Husky immédiatement sans modifier les fichiers
chmod -x .husky/pre-commit
# OU supprimer le hook
rm .husky/pre-commit
```

**Smoke test post-déploiement :**
- [ ] Créer un fichier `.ts` avec une faute de style volontaire → commit bloqué ✅
- [ ] `npm run build` passe sans erreur après le formatting ✅

---

### 1.2 Vitest — Setup initial frontend ✅

**Installation dans `front/` :**
```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

**`front/vitest.config.ts` :**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', '.next'],   // jamais tester les fichiers générés
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

**Scripts `package.json` :**
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

**Effort :** 1 jour

**Livré le 2026-07-01 :**
- `front/vitest.config.ts` créé (jsdom, globals, alias `@`, setupFiles)
- `front/src/test/setup.ts` créé (mocks leaflet, react-leaflet, socket.io-client)
- `@testing-library/dom` ajouté (peer dep manquante de @testing-library/react v16)
- Scripts `test`, `test:watch`, `test:coverage` ajoutés à `front/package.json`

---

#### Risques de régression — Phase 1.2

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R1.2a | Vitest importe des modules qui utilisent `window` ou `document` → erreur JSDOM | Tests en erreur à cause de dépendances browser-only (leaflet, socket.io-client) | Élevée |
| R1.2b | Un test appelle l'API réelle (`getPlanningToday()`) → écrit/lit en base de test ou en prod | Pollution de données, faux positifs | Élevée |
| R1.2c | La config Vitest interfère avec la config Next.js (`next.config.js`) → `npm run build` cassé | Build de production impossible | Moyenne |
| R1.2d | Tests flakeys à cause d'états partagés entre tests (singletons socket, store Zustand non réinitialisé) | CI passe parfois, échoue parfois → perte de confiance | Élevée |

**Prévention :**

Mocker systématiquement les modules browser-only :
```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';

// Mock leaflet (utilise des APIs browser non disponibles en JSDOM)
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('react-leaflet', () => ({ MapContainer: () => null, TileLayer: () => null }));

// Mock socket.io-client (jamais de vrai WebSocket en test)
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(), off: vi.fn(), emit: vi.fn(),
    connected: false, disconnect: vi.fn(),
  })),
}));
```

Mocker toutes les fonctions API :
```typescript
// Pattern obligatoire dans chaque fichier spec
vi.mock('@/lib/api', () => ({
  getPlanningToday: vi.fn().mockResolvedValue(null),
  takeBreak: vi.fn().mockResolvedValue({}),
}));
```

Réinitialiser le store Zustand entre les tests :
```typescript
// Pour les tests de store
beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState());
});
```

**Procédure de déploiement sans régression :**
1. Configurer Vitest avec `test.isolate: true` (isolation par fichier)
2. Vérifier que `npm run build` passe APRÈS l'ajout de `vitest.config.ts`
3. Vérifier que `npm run dev` n'est pas impacté

**Rollback :**
```bash
# Retirer Vitest n'impacte pas le code applicatif
npm uninstall vitest @vitejs/plugin-react @testing-library/react
rm vitest.config.ts src/test/setup.ts
```

**Smoke test post-déploiement :**
- [ ] `npm test` passe avec ≥ 4 tests verts ✅
- [ ] `npm run build` passe sans modification ✅
- [ ] `npm run dev` démarre sans erreur ✅

---

### 1.3 Tests prioritaires — Hooks critiques (R1 + R2) ✅

**Ordre de priorité :**

| Hook / Store | Fichier spec | Cas critiques à couvrir |
|---|---|---|
| `useBreakPrompt` | `hooks/useBreakPrompt.spec.ts` | prompt null au montage, handleTakeBreak appelle l'API, erreur audio silencieuse |
| `usePlanningCommercial` | `hooks/usePlanningCommercial.spec.ts` | retourne null si pas de planning, ignore flag race condition (unmount pendant fetch) |
| `useIdleTimer` | `hooks/useIdleTimer.spec.ts` | timeout déclenche callback, reset annule le timer, cleanup au unmount |
| `chatStore` (Zustand) | `store/chatStore.spec.ts` | selectConversation change l'état, filterStatus filtre correctement |

**Effort :** 3 jours

**Livré le 2026-07-01 — 24 tests verts, 0 échec :**
- `front/src/hooks/useBreakPrompt.spec.ts` — 4 tests (prompt null, handleTakeBreak sans/avec prompt, clear event)
- `front/src/hooks/usePlanningCommercial.spec.ts` — 7 tests (loading, null, error, entry, mois loading, mois fetch, mois race condition)
- `front/src/hooks/useIdleTimer.spec.ts` — 5 tests (idleMinutes=0, showWarning, resetActivity, redirect, cleanup unmount)
- `front/src/store/chatStore.spec.ts` — 8 tests (état initial ×4, setTotalUnread, setSendError ×2, reset)

---

#### Risques de régression — Phase 1.3

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R1.3a | `useIdleTimer` — le timer n'est pas nettoyé dans le test → le test suivant reçoit le callback | Tests interdépendants, faux positifs | Élevée |
| R1.3b | `useBreakPrompt` — le mock socket ne simule pas la déconnexion → le hook ne teste pas le cleanup | Fuite mémoire en production non détectée par les tests | Moyenne |
| R1.3c | `chatStore` — l'état global persiste entre tests → état pollué | Tests qui passent seuls mais échouent en suite | Élevée |

**Prévention :**

Toujours vérifier le cleanup avec `afterEach` :
```typescript
afterEach(() => {
  vi.clearAllTimers();
  vi.clearAllMocks();
  cleanup(); // @testing-library/react
});
```

Utiliser `vi.useFakeTimers()` pour les hooks avec setTimeout/setInterval :
```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('timeout déclenche le callback après 30s', () => {
  const onIdle = vi.fn();
  renderHook(() => useIdleTimer({ onIdle, timeout: 30_000 }));
  vi.advanceTimersByTime(30_000);
  expect(onIdle).toHaveBeenCalledOnce();
});
```

---

## Phase 2 — Refactoring interne (Jalon J2)

### 2.1 Validation CI — synchronisation des événements Socket.IO (R7) ✅

> **Règle d'architecture absolue :** les 3 projets (`message_whatsapp/`, `front/`, `admin/`) sont indépendants et peuvent être déployés sur des serveurs différents. **Aucun package partagé** — zéro `file:` reference croisée dans les `package.json`.

**Problème à résoudre :** le fichier `socket-events.constants.ts` est dupliqué entre backend et frontend. Un renommage silencieux casse la communication sans erreur visible.

**Solution retenue : script CI de diff automatique**

Le backend est la **source de vérité**. Le front et l'admin maintiennent des copies identiques. Un script CI bloque le merge si les fichiers divergent.

**Script `scripts/check-socket-events-sync.js` (à la racine du monorepo) :**
```javascript
const fs = require('fs');
const crypto = require('crypto');

const files = [
  'message_whatsapp/src/realtime/events/socket-events.constants.ts',
  'front/src/lib/socket/socket-events.constants.ts',
];

const hashes = files.map((f) => {
  const content = fs.readFileSync(f, 'utf8')
    .replace(/\/\/.*/g, '')       // ignore les commentaires
    .replace(/\s+/g, ' ')         // normalise les espaces
    .trim();
  return { file: f, hash: crypto.createHash('sha256').update(content).digest('hex') };
});

const [ref, ...others] = hashes;
const divergent = others.filter((h) => h.hash !== ref.hash);

if (divergent.length > 0) {
  console.error('❌ socket-events.constants.ts désynchronisé :');
  divergent.forEach((h) => console.error(`   ${h.file}`));
  console.error(`   Référence : ${ref.file}`);
  process.exit(1);
}

console.log('✅ socket-events.constants.ts synchronisé sur tous les projets');
```

**Ajouter dans `package.json` racine :**
```json
"scripts": {
  "check:socket-sync": "node scripts/check-socket-events-sync.js"
}
```

**Procédure de modification d'un event Socket.IO :**
1. Modifier `message_whatsapp/src/realtime/events/socket-events.constants.ts` (source de vérité)
2. Copier la modification dans `front/src/lib/socket/socket-events.constants.ts`
3. `npm run check:socket-sync` → doit afficher ✅
4. Inclure les 2 fichiers dans le même commit

**Effort :** 0.5 jour

**Livré le 2026-07-01 :**
- `scripts/check-socket-events-sync.js` créé (hash SHA-256, normalisation commentaires + whitespace)
- `package.json` racine : scripts `check:socket-sync` et `test:all` ajoutés
- Validé : `npm run check:socket-sync` → ✅ synchronisé

---

#### Risques de régression — Phase 2.1

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R2.1a | Un event est renommé dans le backend mais pas dans le front → les events ne sont plus reçus | Frontend sourd aux events backend — pas d'erreur visible, juste silencieux | **Critique** |
| R2.1b | Le script CI n'est pas exécuté dans le workflow → la divergence passe inaperçue | Retour au problème initial | Faible (si CI bien configuré) |

**Prévention :**
- Ajouter `check:socket-sync` comme étape obligatoire du workflow CI avant le build
- Les commentaires dans les deux fichiers indiquent déjà : "ces deux fichiers DOIVENT rester identiques"

**Rollback :**
- Le script est non-invasif — le supprimer ne casse rien

**Smoke test post-déploiement :**
- [ ] `npm run check:socket-sync` retourne ✅
- [ ] Un commercial reçoit bien un message en temps réel (event `MESSAGE_ADD` OK)
- [ ] Le prompt de pause s'affiche (`break:prompt` reçu)

---

### 2.2 Pagination keyset uniforme ✅

**Règle :** tout endpoint de liste utilise :
```
GET /resource?cursor={cursor}&limit={n}
→ { data: [], nextCursor: string | null, hasMore: boolean }
```

**Réalisé :**
- `GET /contact` — keyset implémenté (`contact.service.ts::findAllKeyset`, curseur compound `{at, id}` base64url)
- `admin/src/app/lib/api.ts` — `getClients(limit, cursor?, search?)` + `getClientsOffset` (export compat)
- `admin/src/app/ui/ClientsView.tsx` — remplace `<Pagination>` par nav prev/next avec pile de curseurs
- `admin/src/app/lib/exportService.ts` — migré vers `getClientsOffset`
- `GET /audit-logs` — à faire si nécessaire (volume faible, offset OK pour l'instant)

**Effort :** 1 jour

---

#### Risques de régression — Phase 2.2

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R2.2a | L'admin ou le front utilise encore les anciens paramètres `page` / `offset` → liste vide | Utilisateurs voient une liste vide sans message d'erreur | Élevée |
| R2.2b | La migration keyset change le tri par défaut → l'ordre des éléments change | Confusion utilisateur, tests snapshot cassés | Moyenne |

**Prévention :**
- Maintenir les anciens paramètres `page`/`offset` en parallèle pendant 1 sprint (déprécation douce)
- Mettre à jour le front et l'admin AVANT de supprimer les anciens paramètres backend
- Documenter le changement dans le CHANGELOG

**Rollback :**
- Réactiver les anciens paramètres (code conservé en commentaire temporairement)

---

## Phase 3 — Sécurité interne (Jalon J2)

### 3.1 Refresh token pour les commerciaux

**Architecture cible :**
```
Access token  : 15 minutes · stocké en mémoire côté client
Refresh token : 7 jours    · HTTP-only cookie (RefreshToken)
```

**Endpoints :**
```
POST /auth/refresh  → renvoie un nouvel access token
POST /auth/logout   → invalide le refresh token + efface les cookies
```

**Migration SQL :**
```typescript
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tokenHash: string;       // SHA-256 — jamais le token brut en BDD
  @Column() commercialId: string;
  @Column() expiresAt: Date;
  @CreateDateColumn() createdAt: Date;
  @Column({ nullable: true }) revokedAt: Date | null;
}
// Rollback : DROP TABLE refresh_tokens;
// Restaurer JWT_EXPIRY=7d dans auth.service.ts
```

**Effort :** 2 jours

---

#### Risques de régression — Phase 3.1

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R3.1a | Tous les commerciaux sont déconnectés au moment du déploiement si le comportement des cookies change | Interruption de service pendant les heures de travail | **Critique** |
| R3.1b | Le front ne rafraîchit pas silencieusement le token → les commerciaux sont déconnectés toutes les 15 min | UX catastrophique | **Critique** |
| R3.1c | `POST /auth/refresh` non protégé ou mal protégé → brute-force possible | Faille de sécurité | Élevée |
| R3.1d | Le cookie `RefreshToken` écrase le cookie `Authentication` existant → sessions invalides | Déconnexion immédiate de tous les commerciaux | Élevée |

**Prévention :**

**Déploiement hors heures de travail obligatoire** (nuit ou week-end).

Implémenter le rafraîchissement silencieux AVANT de réduire l'expiry à 15 min :
```typescript
// AuthProvider.tsx — rafraîchissement silencieux
useEffect(() => {
  // Rafraîchir 2 minutes avant expiry
  const refreshTimer = setInterval(async () => {
    await refreshToken(); // POST /auth/refresh
  }, (15 * 60 - 120) * 1000); // 13 minutes
  return () => clearInterval(refreshTimer);
}, []);
```

Utiliser un nom de cookie distinct pour le refresh token :
```typescript
// Ne pas réutiliser 'Authentication' — cookie séparé
res.cookie('RefreshToken', token, { httpOnly: true, sameSite: 'strict', secure: true });
```

**Ordre de déploiement :**
1. Déployer le backend avec `POST /auth/refresh` (access expiry encore à 7j — pas de breaking change)
2. Déployer le front avec le rafraîchissement silencieux
3. Valider sur staging pendant 48h que les sessions persistent
4. **SEULEMENT ALORS** réduire l'expiry access à 15 min

**Feature flag de sécurité :**
```env
FF_SHORT_JWT_EXPIRY=false   # passer à true uniquement à l'étape 4
```

**Rollback :**
```bash
# Remettre FF_SHORT_JWT_EXPIRY=false → les tokens durent à nouveau 7j
# Les refresh tokens existants restent valides (pas de migration destructive)
```

**Smoke test post-déploiement (étapes 1-3) :**
- [ ] Un commercial se connecte → session active ✅
- [ ] Après 14 minutes → session toujours active (refresh silencieux) ✅
- [ ] `POST /auth/logout` → cookie effacé, commercial déconnecté ✅

---

### 3.2 Rate-limiting HTTP — `@nestjs/throttler` (R6)

**Installation :**
```bash
npm install @nestjs/throttler
```

**Configuration :**
```typescript
ThrottlerModule.forRootAsync({
  useFactory: () => ([
    { name: 'short',  ttl: 1_000,  limit: 10  },
    { name: 'medium', ttl: 10_000, limit: 50  },
    { name: 'long',   ttl: 60_000, limit: 200 },
  ]),
}),
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

**Effort :** 1 jour

---

#### Risques de régression — Phase 3.2

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R3.2a | Le ThrottlerGuard global bloque les webhooks entrants → messages perdus | **Perte de messages WhatsApp** — critique pour le métier | **Critique** |
| R3.2b | Les actions admin en batch (ex : export, bulk update) dépassent la limite → opération interrompue | Fonctionnalités admin cassées | Élevée |
| R3.2c | Socket.IO utilise des requêtes HTTP upgrade → le throttler bloque les connexions socket | Tous les commerciaux déconnectés | Élevée |
| R3.2d | Les crons backend qui appellent des endpoints internes sont throttlés | Jobs critiques (SLA checker) ne s'exécutent plus | Moyenne |

**Prévention :**

Marquer TOUS les endpoints webhook avec `@SkipThrottle()` :
```typescript
@Controller('webhooks')
@SkipThrottle()   // webhooks protégés par HMAC — jamais throttler
export class WebhooksController {}
```

Marquer les endpoints Socket.IO upgrade :
```typescript
// NestJS WebSocketGateway n'utilise pas le ThrottlerGuard HTTP — vérifier quand même
// Ajouter @SkipThrottle() sur le gateway si nécessaire
```

Tester en staging avec un script de charge avant production :
```bash
# Simuler 15 requêtes rapides sur /auth/login → doit retourner 429 à la 11e
# Simuler 1 webhook → doit retourner 200 quelle que soit la fréquence
for i in {1..15}; do curl -X POST http://staging/auth/login; done
```

**Rollback :**
```bash
# Désactiver le guard global sans redéploiement
# Mettre ThrottlerModule en mode passif en retirant APP_GUARD du providers[]
```

**Smoke test post-déploiement :**
- [ ] Envoyer un message WhatsApp → reçu normalement ✅
- [ ] Tenter 15 logins rapides → 429 à partir du 11e ✅
- [ ] Les commerciaux restent connectés en Socket.IO ✅
- [ ] Le cron SLA checker s'exécute normalement ✅

---

### 3.3 Health endpoint structuré

**Endpoint :** `GET /health`

**Installation :**
```bash
npm install @nestjs/terminus
```

**Effort :** 1 jour

---

#### Risques de régression — Phase 3.3

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R3.3a | `/health` est exposé sans authentification et révèle des informations sensibles (version, host DB) | Fuite d'information | Faible |
| R3.3b | Le check DB dans `/health` génère une requête SQL à chaque appel du monitoring (toutes les 30s) → charge DB | Dégradation perf si le monitoring est trop fréquent | Faible |

**Prévention :**
- Ne jamais retourner les credentials, host DB, ou stack trace dans `/health`
- Limiter le check DB à `SELECT 1` (requête minimale)
- Configurer le monitoring externe à 60s minimum d'intervalle (pas 5s)

**Rollback :** suppression du endpoint (aucun impact sur le code existant).

---

## Phase 4 — Performance base de données (Jalon J3)

### 4.1 Audit index MySQL — hot paths

**Méthode :** `EXPLAIN ANALYZE` sur les requêtes les plus fréquentes.

**Requêtes candidates :**

| Query | Table | Colonnes à indexer |
|---|---|---|
| Conversations par poste | `whatsapp_chat` | `(poste_id, status, deleted_at, last_message_at)` |
| Messages d'une conversation | `whatsapp_message` | `(chat_id, created_at, deleted_at)` |
| Conversations unread | `whatsapp_chat` | `(poste_id, status, unread_count)` |
| SLA checker | `whatsapp_chat` | `(status, unread_count, last_client_message_at)` |

**Effort :** 2 jours

---

#### Risques de régression — Phase 4.1

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R4.1a | `ALTER TABLE` avec `ADD INDEX` pose un lock exclusif sur la table → indisponibilité de service sous charge | Commerciaux ne reçoivent plus les messages pendant la migration | **Critique** |
| R4.1b | Un index composite avec le mauvais ordre de colonnes est plus lent qu'aucun index | Dégradation silencieuse des performances | Moyenne |
| R4.1c | Un index couvre trop de colonnes → taille de l'index dépasse 767 bytes (limite MySQL InnoDB) → erreur migration | Migration échoue en production | Faible |

**Prévention :**

Utiliser `ALGORITHM=INPLACE, LOCK=NONE` pour tous les `ADD INDEX` :
```sql
-- Rollback : DROP INDEX idx_chat_poste_status ON whatsapp_chat;
ALTER TABLE whatsapp_chat
  ADD INDEX idx_chat_poste_status (poste_id, status, deleted_at)
  ALGORITHM=INPLACE, LOCK=NONE;
```

`LOCK=NONE` permet les lectures ET écritures pendant la création de l'index (Online DDL MySQL 8). Vérifier que la version MySQL utilisée supporte l'Online DDL pour chaque type d'index.

Valider l'ordre des colonnes avec `EXPLAIN ANALYZE` AVANT et APRÈS sur staging :
```sql
EXPLAIN ANALYZE
SELECT * FROM whatsapp_chat
WHERE poste_id = 'xxx' AND status = 'actif' AND deleted_at IS NULL
ORDER BY last_message_at DESC
LIMIT 20;
```
→ `type` doit passer de `ALL` (scan complet) à `ref` ou `range`.

**Rollback :**
```sql
DROP INDEX idx_chat_poste_status ON whatsapp_chat;
-- Opération rapide, pas de lock exclusif
```

**Smoke test post-déploiement :**
- [ ] `SHOW INDEX FROM whatsapp_chat` — nouvel index visible ✅
- [ ] Requête conversations par poste — temps de réponse amélioré ou stable ✅
- [ ] Aucun timeout durant la création d'index (vérifier les logs pendant le déploiement) ✅

---

### 4.2 Détection et correction des N+1 queries (R5)

**Méthode :** activer le logging SQL en dev, identifier les patterns de requêtes répétées.

```env
TYPEORM_LOGGING=query   # en dev uniquement — JAMAIS en prod
```

**Pattern interdit :**
```typescript
// ❌ N+1 — génère N requêtes SQL pour N conversations
for (const chat of chats) {
  chat.messages = await this.messageRepo.find({ where: { chatId: chat.id } });
}

// ✅ Un seul aller-retour
const chats = await this.chatRepo
  .createQueryBuilder('c')
  .leftJoinAndSelect('c.messages', 'm')
  .where('c.posteId = :posteId', { posteId })
  .getMany();
```

**Effort :** 1 jour d'audit

---

#### Risques de régression — Phase 4.2

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R4.2a | `leftJoinAndSelect` charge trop de données (ex : tous les messages d'une conversation au lieu des 20 derniers) → OOM | Service backend plante | Élevée |
| R4.2b | La jointure retourne des doublons non anticipés (entité avec multiple relations) → données corrompues côté client | Affichage erroné (ex : message dupliqué) | Moyenne |
| R4.2c | La nouvelle query retourne les résultats dans un ordre différent → les tests snapshot échouent | Régressions détectées par les tests (bon signal, pas de régression utilisateur) | Faible |

**Prévention :**

Pour les jointures avec des collections potentiellement grandes, **toujours limiter** :
```typescript
// ✅ Jointure avec limite
.leftJoinAndSelect('c.messages', 'm')
.where('m.createdAt > :since', { since: cutoff })  // limiter par date
// OU
.take(20)  // limiter le nombre total
```

Tester la nouvelle query avec un jeu de données large (≥ 1000 conversations) sur staging avant production.

**Test de non-régression obligatoire :**
```typescript
// Vérifier que le résultat est identique avant/après la correction
it('findConversationsWithMessages retourne les mêmes données', async () => {
  const resultBefore = await legacyQuery();
  const resultAfter  = await newQuery();
  expect(resultAfter.map(r => r.id).sort()).toEqual(resultBefore.map(r => r.id).sort());
});
```

---

## Phase 5 — Developer Experience (Jalon J3)

### 5.1 MySQL dans docker-compose local

**`docker-compose.local.yml` — ajout du service MySQL :**
```yaml
mysql:
  image: mysql:8.0
  environment:
    MYSQL_ROOT_PASSWORD: root
    MYSQL_DATABASE: whatsappflow
    MYSQL_USER: whatsapp
    MYSQL_PASSWORD: whatsapp
  ports: ["3306:3306"]
  volumes: [mysql_local_data:/var/lib/mysql]
  healthcheck:
    test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
    interval: 10s
    retries: 5
```

**Effort :** 0.5 jour

---

#### Risques de régression — Phase 5.1

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R5.1a | Le port 3306 est déjà utilisé par une instance MySQL locale → conflit de port | `docker compose up` échoue | Moyenne |
| R5.1b | Un dev applique les migrations sur le MySQL local sans réaliser qu'il n'est pas sur staging → perd du temps à déboguer | Perte de temps, pas de régression en prod | Faible |

**Prévention :**
- Documenter dans le README que le MySQL docker est **dev local uniquement**
- Utiliser le port `3307` pour le MySQL docker afin d'éviter le conflit avec une installation locale :
```yaml
ports: ["3307:3306"]
```

---

### 5.2 Audit trail admin

**Entité `AdminAuditLog` :**
```typescript
@Entity('admin_audit_log')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() adminId: string;
  @Column() action: string;
  @Column({ type: 'json' }) payload: Record<string, unknown>;
  @Column({ nullable: true }) targetId: string | null;
  @Column() targetEntity: string;
  @CreateDateColumn() createdAt: Date;
}
// Rollback : DROP TABLE admin_audit_log;
```

**Effort :** 2 jours

---

#### Risques de régression — Phase 5.2

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R5.2a | Le décorateur `@AuditLog` plante silencieusement → la réponse HTTP n'est plus renvoyée | Endpoint admin en erreur 500 | Élevée |
| R5.2b | Le payload de l'audit log contient des données sensibles (`webhook_secret`, `token`) | Fuite de secrets dans la table `admin_audit_log` | Élevée |

**Prévention :**

Le décorateur doit être `try/catch` — un échec d'audit ne doit JAMAIS bloquer l'action :
```typescript
// audit-log.decorator.ts
export function AuditLog(action: string): MethodDecorator {
  return (target, key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (...args: unknown[]) {
      const result = await original.apply(this, args);
      try {
        await this.auditService.log(action, args);  // non-bloquant
      } catch (err) {
        this.logger.warn(`AuditLog failed for ${action}: ${err.message}`);
      }
      return result;
    };
  };
}
```

Sanitiser le payload avant de l'écrire (réutiliser `sanitizeChannel()`) :
```typescript
const safePayload = sanitizeObject(payload, ['token', 'webhook_secret', 'meta_app_secret']);
```

**Smoke test post-déploiement :**
- [ ] Supprimer un canal → entrée dans `admin_audit_log` créée ✅
- [ ] L'entrée ne contient pas `token` ni `webhook_secret` ✅
- [ ] Si l'insert d'audit échoue → l'action admin s'est quand même exécutée ✅

---

## Phase 6 — File de messages robuste — Redis + BullMQ (Jalon J2) ✅ COMPLÈTE — 2026-07-02

### Contexte

**Problème actuel :** `WebhookDegradedQueueService` stocke les tâches webhook en `Map` mémoire.
Un redémarrage du process = perte des messages en cours de traitement.

Redis est auto-hébergé sur le même serveur que le backend — aucune dépendance externe, même nature que MySQL.

**Note :** `ioredis` est déjà dans les dépendances. Variables `REDIS_*` déjà dans `.env.example`. Infrastructure préparée.

---

### 6.1 Infrastructure Redis — docker-compose.yml

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
  volumes: [redis_data:/data]
  ports: ["6379:6379"]
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    retries: 5
```

**Variables d'environnement à ajouter dans `.env` :**
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
FF_BULLMQ_WEBHOOK=false   # désactivé par défaut — activer progressivement
```

**Effort :** 0.5 jour

---

### 6.2 Migration WebhookDegradedQueueService → BullMQ

**Installation :**
```bash
npm install @nestjs/bullmq bullmq
```

**Architecture cible :**
```
Webhook entrant
  → [HMAC validation — E1 toujours actif]
  → UnifiedIngressService (idempotency check)
  → BullMQ queue "webhook-inbound" (persisté en Redis)
    → WebhookWorker (concurrence : 15)
      → InboundMessageService → DispatcherService
```

**Migration progressive avec feature flag :**
```typescript
// UnifiedIngressService
if (process.env.FF_BULLMQ_WEBHOOK === 'true') {
  await this.webhookProducer.enqueue(provider, payload, eventId);
} else {
  await this.legacyDegradedQueue.enqueue(provider, payload);
}
```

**Circuit breaker Redis obligatoire — si Redis est down, fallback automatique sur la file mémoire :**
```typescript
// webhook-producer.service.ts
async enqueue(provider: string, payload: unknown, eventId: string): Promise<void> {
  try {
    await this.queue.add(provider, { provider, payload, eventId }, {
      jobId: eventId,              // déduplication par eventId (idempotence)
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 500,
      removeOnFail: 200,
    });
  } catch (err) {
    this.logger.error(`BullMQ unavailable, falling back to memory queue: ${err instanceof Error ? err.message : String(err)}`);
    await this.legacyDegradedQueue.enqueue(provider, payload);
  }
}
```

**Limite de concurrence worker ≤ 15** (laisse 15 connexions MySQL libres pour le reste) :
```typescript
@Processor('webhook-inbound', { concurrency: 15 })
```

**Effort :** 3.5 jours

---

#### Risques de régression — Phase 6

| # | Régression | Impact | Probabilité |
|---|---|---|---|
| R6.1 | Redis est indisponible et le circuit breaker n'est pas implémenté → tous les webhooks bloqués | **Perte de tous les messages WhatsApp entrants** | **Critique** |
| R6.2 | La concurrence BullMQ sature le pool MySQL (30 connexions max) | Backend en deadlock DB | **Critique** |
| R6.3 | `FF_BULLMQ_WEBHOOK=true` activé avant que le worker soit déployé → jobs en file jamais consommés | Messages perdus | Élevée |
| R6.4 | Jobs en échec s'accumulent et saturent la mémoire Redis (512 MB) | Redis OOM → indisponibilité | Moyenne |

**Ordre de déploiement obligatoire :**
1. Déployer Redis (vérifier `redis-cli ping` → PONG)
2. Déployer le backend avec `FF_BULLMQ_WEBHOOK=false` (aucun changement de comportement)
3. Vérifier en staging que le worker consomme bien les jobs
4. Activer `FF_BULLMQ_WEBHOOK=true` sur staging pendant 24h
5. Activer sur production uniquement après validation staging

**Rollback immédiat sans redéploiement :**
```bash
FF_BULLMQ_WEBHOOK=false   # modification .env + restart backend
```

**Smoke test post-déploiement :**
- [ ] Envoyer un message WhatsApp → reçu côté commercial ✅
- [ ] Redémarrer le backend pendant un webhook → message reçu malgré tout ✅
- [ ] Couper Redis → message reçu via fallback mémoire, log warn visible ✅

---

## Récapitulatif — Tableau de bord

| Phase | Tâche | Effort | Criticité | Jalon | Risques critiques identifiés | Statut |
|---|---|---|---|---|---|---|
| 1.1 | Prettier + Husky | 0.5j | P1 | J1 | Conflit ESLint (R1.1a) | ✅ |
| 1.2 | Vitest setup | 1j | P0 | J1 | Modules browser-only (R1.2a), appels API réels (R1.2b) | ✅ |
| 1.3 | Tests hooks (×4) | 3j | P0 | J1 | États partagés entre tests (R1.3c) | ✅ |
| 2.1 | Package socket-contracts | 2j | P1 | J2 | Renommage silencieux d'events (R2.1a) | ✅ |
| 2.2 | Pagination keyset | 1j | P2 | J2 | Paramètres anciens non migrés (R2.2a) | ✅ |
| 3.1 | Refresh token | 2j | P0 | J2 | Déconnexion massive au déploiement (R3.1a/b) | ✅ |
| 3.2 | Rate-limiting | 1j | P1 | J2 | Webhooks throttlés (R3.2a) | ✅ |
| 3.3 | Health endpoint | 1j | P1 | J2 | Fuite d'info (R3.3a) | ✅ |
| 4.1 | Index MySQL | 2j | P1 | J3 | Lock table en production (R4.1a) | ✅ |
| 4.2 | Correction N+1 | 1j | P0 | J3 | OOM par jointure trop large (R4.2a) | ✅ |
| 5.1 | MySQL docker local | 0.5j | P2 | J3 | Conflit port 3306 (R5.1a) | — abandonné |
| 5.2 | Audit trail admin | 2j | P2 | J3 | Secrets dans l'audit log (R5.2b) | ✅ |
| 6.1 | Redis docker-compose | 0.5j | P0 | J2 | — | |
| 6.2 | BullMQ webhook queue | 3.5j | P0 | J2 | Redis down bloque webhooks (R6.1), pool MySQL saturé (R6.2) | |
| **Total** | | **~21j** | | | |

---

## Checklist universelle de non-régression (avant chaque PR)

```
□ npm run build  → passe sans erreur (backend ET front)
□ npm test       → tous les tests verts
□ npm run lint   → 0 warning, 0 erreur
□ Aucun `any` TypeScript introduit (R4)
□ Aucune requête SQL dans une boucle (R5)
□ Nouveaux endpoints publics → ThrottlerGuard actif ou @SkipThrottle() justifié (R6)
□ Nouvelles constantes Socket.IO → dans le package socket-contracts (R7)
□ Nouvelle migration → commentaire rollback présent (R3)
□ Nouveau hook React → fichier .spec.ts créé (R2)
□ Nouveau service backend → fichier .spec.ts créé (R1)
□ assertWhapiSecret() / assertMetaSignature() non commentés (E1)
□ Workflow CI non modifié (E3)

— Layout (R8) —
□ Tout nouveau composant scrollable dans une flex column → `min-h-0` présent sur lui-même
□ Tout nouveau conteneur flex intermédiaire entre la racine et un scrollable → `min-h-0` présent
□ Scroller manuellement une liste longue dans le navigateur avant de valider une PR UI
□ Vérifier que la page entière ne scroll pas (seul le composant interne doit scroller)
```
