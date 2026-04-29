# Rapport Global — Projet WhatsApp Messaging
*Analyse par l'équipe whatsapp-dev-team — 2026-04-29*

---

## Vue d'ensemble

| Composant | Maturité | Score |
|---|---|---|
| Backend NestJS | Production-ready | 8.5/10 |
| Frontend React/Next.js | Solide mais incomplet | 6.5/10 |
| Panel Admin Next.js | Solide mais fragile | 7/10 |
| Sécurité | Bonne base, 2 points CRITIQUES | ⚠️ |

---

## Backend NestJS — `message_whatsapp/`

**Architecture DDD mature** — 71 modules, 91 entités, 92 services, 90 migrations.

### Points forts

- Multi-canaux unifié (WhatsApp, Meta, Telegram, Instagram, Messenger)
- Double DB proprement isolée (DB1 MySQL + DB2 commandes, null-safe)
- BullMQ pour tous les workflows async (webhooks, SLA, broadcasts)
- Outbox pattern pour la consistance DB → webhooks externes
- Sécurité en couches : JWT, HMAC, rate-limiting, audit trail, RBAC
- NestJS 11 + TypeORM 0.3 + BullMQ 5 — versions récentes stables

### Dépendances clés

| Catégorie | Package | Version |
|-----------|---------|---------|
| NestJS | `@nestjs/core` | 11.0.1 |
| ORM | `typeorm` | 0.3.28 |
| Queues | `bullmq` | 5.74.1 |
| Auth | `@nestjs/jwt` | 11.0.2 |
| Cache/Realtime | `ioredis` | 5.10.1 |
| Validation | `joi` | 18.0.2 |
| Sécurité | `helmet` | 8.1.0 |

### Points à améliorer

- `app.module.ts` : 87 imports → regrouper en 4-5 feature-modules umbrella
- Couverture tests non visible — services critiques à cibler >80%
- Pas de couche repository abstrait DB2 — logique éparpillée dans `OrderCallSyncService`, `CallObligationService`
- `ConfigService` à centraliser (env vars éparpillées par module)

### Modules principaux (71 modules)

**Messagerie Core :** `whatsapp_chat`, `whatsapp_message`, `whatsapp_message_content`, `whatsapp_media`, `whatsapp_commercial`, `whatsapp_contacts`, `whatsapp_customer`

**Intégrations :** `whapi`, `communication_whapi`, `channel`

**Fonctionnalités Premium :** `canned-response`, `label`, `conversation-transfer`, `conversation-merge`, `gdpr-optout`, `broadcast`, `whatsapp-template`, `flowbot`, `ai-assistant`, `ai-governance`, `sentiment`

**Métier E-GICOP :** `order-db`, `order-read`, `order-write`, `order-call-sync`, `call-obligations`, `call-log`, `gicop-platform`, `gicop-report`, `client-dossier`

**Infrastructure :** `dispatcher`, `queue`, `sla`, `audit`, `rbac`, `redis`, `realtime`, `system-config`, `system-health`, `system-alert`, `database`, `auth`, `auth_admin`

---

## Frontend React/Next.js — `front/`

**Architecture Zustand slices bien pensée** — Next.js 16.1.1, React 19.2.3, TypeScript strict.

### Points forts

- Zustand slices composés par feature (SocketSessionSlice + MessageSlice + ConversationSlice)
- Services purs séparés (merge, unread-counter, socket-event-router)
- WebSocket socket.io-client 4.8.3 avec reconnexion auto et routage centralisé
- Fonctionnalités métier complètes (fenêtre glissante Phase 9, obligations appels, GICOP, sticky assignment)
- TypeScript strict avec enums/unions bien typés (ConversationStatus, FollowUpType, etc.)
- Localisation fr-FR via `dateUtils.ts`

### Structure

```
src/
├── app/                # Pages (login, whatsapp, contacts, auto_connexion)
├── components/         # UI par domaine (chat, contacts, conversation, sidebar)
├── contexts/           # AuthProvider (JWT + geoloc), SocketProvider
├── hooks/              # useConversationFilters, useConversationSearch, useKeyboardShortcuts
├── lib/                # 7 API clients Axios + dateUtils + logger
├── modules/            # Feature-driven (chat/store, conversations, realtime)
├── store/              # chatStore composé + contactStore + stats.store
└── types/              # chat.ts — Enums, Interfaces
```

### Points à améliorer

| Problème | Impact | Priorité |
|---|---|---|
| Tests < 10% couverture (2 fichiers .test.tsx) | Régressions invisibles | Critique |
| Pas d'`ErrorBoundary` global | Crash = page blanche | Moyen |
| Pas de cache HTTP (Axios brut, aucun SWR/TanStack Query) | Re-fetch systématique | Moyen |
| Pas de virtualisation `ConversationList` | Perf dégradée à 1000+ items | Moyen |
| Accessibilité absente (aucun `aria-label`, non WCAG AA) | Non-conformité | Faible |
| Pas de `useMemo`/`useCallback` systématique | Re-renders inutiles | Faible |

---

## Panel Admin Next.js — `admin/`

**Structure solide** — 16 modules autonomes, 35 wrappers API, 25 vues métier.

### Points forts

- `useCrudResource` générique (CRUD réutilisable pour tous les domaines)
- Types centralisés dans `definitions.ts` (~300 lignes, aucun `any`)
- Cookies httpOnly + redirection 401 automatique
- 25 vues couvrent tous les domaines (dispatch, SLA, audit, RBAC, IA, GICOP)
- Docker-ready (`output: 'standalone'` dans `next.config.ts`)

### Pages/Routes disponibles (25 vues)

| Catégorie | Vues |
|---|---|
| Équipe | commerciaux, postes, performance, ranking |
| Conversations | conversations, messages, flowbot |
| Dispatch & Queue | queue, dispatch, crons |
| Infrastructure | canaux, contextes, observabilité, GO/NO-GO, santé serveur, intégration ERP |
| Analytics | analytics, clients, rapports |
| CRM & Contacts | champs CRM, relances, objectifs |
| Sécurité & Accès | restriction géo, heures travail, capacité, journal connexions |
| Diffusion | broadcasts, templates HSM |
| Gouvernance | SLA, audit, rôles, webhooks |
| Spécialisés | IA governance, GICOP supervision, outbox sync, plannings, plaintes |

### Scoring

| Aspect | Score |
|---|---|
| Structure & Modularité | 8/10 |
| TypeScript & Types | 9/10 |
| Authentification & Sécurité | 7/10 |
| API & Communication | 8/10 |
| Tests | 1/10 |
| UX & Performance | 6/10 |
| **Global** | **7/10** |

### Points à améliorer

| Problème | Impact | Sévérité |
|---|---|---|
| 1 seul fichier `.test.tsx` | Zéro couverture effective | Critique |
| Pas de middleware Next.js pour routes protégées | Flash contenu avant redirection `/login` | Moyen |
| Pas d'`ErrorBoundary` | Crash vue = navigation admin cassée | Moyen |
| Pas de cache API (N+1 requests) | Lenteur sur navigation | Moyen |
| `dateUtils.ts` dupliqué entre `front/` et `admin/` | Risque désynchronisation | Faible |
| Pas de debounce sur formulaires CRUD | Spamming requêtes API possible | Faible |

---

## Audit Sécurité — OWASP Top 10

### 🔴 CRITIQUES — Action immédiate requise

**1. Credentials réels dans `.env`**
- Fichier : `message_whatsapp/.env` lignes 52-53
- Problème : `ORDER_DB_USER=kevin` / `ORDER_DB_PASSWORD=kevinvoli` en clair
- Action : Révoquer les credentials DB2 + régénérer + ajouter `.env` au `.gitignore`

**2. Secret Meta en clair dans `.env.example`**
- Fichier : `message_whatsapp/.env.example` lignes 46-54
- Problème : `META_APP_SECRET=44293212c672c952517eb25d596762d2` (valeur réelle)
- Action : Révoquer sur Meta for Developers + remplacer par `CHANGE_ME`

### 🟠 ÉLEVÉS

**3. `console.log` avec tokens de vérification**
- Fichier : `message_whatsapp/src/whapi/whapi.controller.ts` lignes 209-216
- Problème : Tokens et challenges loggés en clair en production
- Action : Supprimer, utiliser AppLogger avec masquage des tokens

**4. Routes GET webhook sans rate-limit spécifique**
- Fichier : `message_whatsapp/src/whapi/whapi.controller.ts` lignes 522-535
- Problème : Brute-force possible sur tokens de vérification
- Action : Rate-limit 1 req/sec par IP + `timingSafeEqual` pour comparaison token

### 🟡 MOYENS

**5. DB2 credentials acceptent chaînes vides**
- Fichier : `message_whatsapp/src/app.module.ts` lignes 145-149
- Problème : Joi `.optional()` sur tous les champs DB2 — pas de validation cohérente
- Action : Validation conditionnelle Joi `.when()` (si HOST défini → tous requis)

**6. Content-Security-Policy désactivé**
- Fichier : `message_whatsapp/src/main.ts` ligne 36
- Problème : `contentSecurityPolicy: false` dans Helmet
- Action : Configurer CSP au niveau Nginx (reverse proxy)

### ✅ Ce qui va bien (non trouvé)

- **Zéro injection SQL** — QueryBuilder paramétré partout, aucune raw query
- **CORS whitelist stricte** — origines autorisées explicitement
- **HMAC-SHA256** sur tous les webhooks entrants (Whapi, Meta, Messenger, Instagram)
- **bcrypt v6** pour les mots de passe
- **Tous les endpoints sensibles protégés** — AdminGuard / AuthGuard cohérents
- **Rate-limiting global** — 20 req/s, 300 req/min par IP
- **Dépendances à jour** — NestJS 11, TypeORM 0.3, Next.js 16 — aucun CVE critique détecté

---

## Plan d'action

### Urgent (aujourd'hui)

- [ ] Révoquer `META_APP_SECRET` sur Meta for Developers
- [ ] Révoquer les credentials `ORDER_DB_USER/PASSWORD` sur DB2
- [ ] Vider `.env` et `.env.example` de tout secret réel — remplacer par `CHANGE_ME`
- [ ] Vérifier que `.env` est bien dans `.gitignore`

### Court terme (cette semaine)

- [ ] Supprimer les `console.log` dans `whapi.controller.ts:209-216`
- [ ] Ajouter un middleware Next.js pour la protection des routes admin
- [ ] Ajouter `ErrorBoundary` dans `front/` et `admin/`
- [ ] Rate-limit spécifique sur les GET `/webhooks/*`

### Moyen terme (sprint suivant)

- [ ] Monter la couverture tests à 70%+ (frontend + admin)
- [ ] Ajouter TanStack Query v5 pour le cache HTTP (front + admin)
- [ ] Consolider la couche repository DB2 (centraliser `OrderCallSyncService`, `CallObligationService`)
- [ ] Mutualiser `dateUtils.ts` en package partagé (ou symlink `front/ ↔ admin/`)
- [ ] Regrouper les 87 imports de `app.module.ts` en feature-modules umbrella
- [ ] Virtualiser `ConversationList` (react-window ou react-virtual)

### Long terme (roadmap)

- [ ] Accessibilité WCAG AA (axe-core audit + fixes)
- [ ] Storybook + Chromatic pour les composants UI
- [ ] Sentry pour l'observabilité frontend (front + admin)
- [ ] Centraliser `ConfigService` backend (unifier validation Joi)

---

*Rapport généré par l'équipe whatsapp-dev-team :*
- **backend-dev** — Analyse NestJS (71 modules, 91 entités, 92 services)
- **frontend-dev** — Analyse React/Next.js (front/)
- **admin-dev** — Analyse panel admin Next.js (admin/)
- **security-reviewer** — Audit OWASP Top 10
- **tech-lead** — Consolidation & synthèse
