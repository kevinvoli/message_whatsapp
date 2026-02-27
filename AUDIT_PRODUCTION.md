# AUDIT COMPLET — PRÉPARATION PRODUCTION
> Date : 2026-02-27 | Branche : `inification`

---

## RÉSUMÉ EXÉCUTIF

| Partie | Fichiers source | Tests | État |
|--------|----------------|-------|------|
| Backend NestJS | 221 .ts | 45 .spec.ts | ✅ Bon |
| Frontend Next.js | 40 .tsx/ts | 0 | ⚠️ Sans tests |
| Admin Next.js | 38 .tsx/ts | 0 | ⚠️ Sans tests |
| Scripts de test | 13 | — | ℹ️ Dev only |
| **Total** | **~450 fichiers** | | |

---

## 1. ACTIONS IMMÉDIATES — AVANT PRODUCTION

### 1.1 Console.log actifs à supprimer

| Fichier | Ligne | Contenu |
|---------|-------|---------|
| `message_whatsapp/src/communication_whapi/communication_meta.service.ts` | ~50 | `console.log("sss...", mediaType, mimeType)` |
| `message_whatsapp/src/communication_whapi/outbound-router.service.ts` | ~30 | `console.log("qqq...")` |
| `message_whatsapp/src/whapi/whapi.controller.ts` | multiple | 4 console.log actifs (payload, channel_id, erreurs) |
| `message_whatsapp/src/whatsapp_poste/whatsapp_poste.controller.ts` | ~20 | `console.log("enregistrement de poste:", ...)` |

### 1.2 Dépendance inutilisée à supprimer

```bash
cd message_whatsapp
npm uninstall @casl/ability
```

Aucune utilisation trouvée dans tout le code source. Économie : ~200 KB.

### 1.3 Fichiers de documentation obsolètes dans `message_whatsapp/`

À déplacer dans un dossier `message_whatsapp/docs/archive/` ou supprimer :

```
message_whatsapp/audit-timestamp-bug.md         ← bug résolu
message_whatsapp/cdc-historique-appels.md        ← spécifications anciennes
message_whatsapp/contact-page-prompt.md          ← UI ancienne
message_whatsapp/contact-ui-ux-audit.md          ← audit old
message_whatsapp/conversation-last-message-audit.md ← audit résolu
message_whatsapp/maturity-analysis.md            ← analyse ancienne
message_whatsapp/plan-correction-timestamp.md    ← plan résolu
message_whatsapp/read-status-flow.md             ← spécifications anciennes
```

### 1.4 Assets template Next.js inutilisés (front/)

```
front/public/next.svg      ← template par défaut Next.js
front/public/vercel.svg    ← template par défaut Vercel
```

---

## 2. CONFIGURATION PRODUCTION

### 2.1 Variables d'environnement requises (backend)

Validées par Joi dans `app.module.ts` :

```env
NODE_ENV=production

# Base de données
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=

# Serveur
SERVER_PORT=3002
SERVER_PUBLIC_HOST=https://your-domain.com

# Whapi webhook
WHAPI_WEBHOOK_SECRET_HEADER=
WHAPI_WEBHOOK_SECRET_VALUE=

# JWT
JWT_SECRET=                    # Obligatoire, long et aléatoire

# Admin (obligatoire)
ADMIN_EMAIL=                   # required
ADMIN_PASSWORD=                # min 12 caractères

# Feature flags (laisser activés)
FF_UNIFIED_WEBHOOK_ROUTER=true
FF_SHADOW_UNIFIED=true
FF_UNIFIED_WHAPI_PCT=100
```

### 2.2 Variables d'environnement requises (frontend)

```env
NEXT_PUBLIC_API_URL=https://your-domain.com
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com
```

### 2.3 Variables d'environnement requises (admin)

Pas de fichier `.env` actuellement — à créer :

```env
NEXT_PUBLIC_API_URL=https://your-domain.com
```

### 2.4 Fichiers .env — SÉCURITÉ

⚠️ Les fichiers `.env` actuels contiennent des secrets (JWT_SECRET, tokens Whapi).
Vérifier qu'ils sont bien dans le `.gitignore` de chaque sous-projet.

---

## 3. ÉTAT DES MODULES BACKEND (22 modules actifs)

Tous les modules sont importés dans `app.module.ts` et actifs :

| Module | Rôle | État |
|--------|------|------|
| AdminModule | Gestion admins | ✅ |
| AuthModule | Auth commerciaux (JWT) | ✅ |
| AuthAdminModule | Auth admins (JWT) | ✅ |
| CallLogModule | Logs appels | ✅ |
| ChannelModule | Canaux WhatsApp | ✅ |
| CommunicationWhapiModule | Envoi messages (Whapi + Meta) | ✅ |
| ContactModule | Contacts | ✅ |
| DispatcherModule | File d'attente / assignation | ✅ |
| JorbsModule | Jobs CRON (timeouts, réinjection) | ✅ |
| LoggingModule | Service de log | ✅ |
| MessageAutoModule | Messages automatiques | ✅ |
| MetriquesModule | Statistiques | ✅ |
| WebhooksModule | Réception webhooks | ✅ |
| WhapiModule | Whapi (crypto, rate limit) | ✅ |
| WhatsappButtonModule | Boutons WhatsApp | ✅ |
| WhatsappChatModule | Conversations | ✅ |
| WhatsappChatLabelModule | Étiquettes | ✅ |
| WhatsappCommercialModule | Agents commerciaux | ✅ |
| WhatsappContactsModule | Contacts WhatsApp | ✅ |
| WhatsappMediaModule | Médias | ✅ |
| WhatsappMessageModule | Messages | ✅ |
| WhatsappPosteModule | Postes | ✅ |

---

## 4. MIGRATIONS BASE DE DONNÉES (19 migrations)

Toutes les migrations sont à exécuter en production dans l'ordre :

| # | Date | Fichier | Objectif |
|---|------|---------|----------|
| 1 | 2026-02-13 | add_dispatch_settings | File d'attente |
| 2 | 2026-02-13 | add_dispatch_settings_audit | Audit queue |
| 3 | 2026-02-13 | add_pending_message_payload | Payloads messages |
| 4 | 2026-02-13 | add_poste_queue_enabled | Queue postes |
| 5 | 2026-02-13 | remove_pending_messages | Nettoyage données |
| 6 | 2026-02-14 | add_multitenant_columns | Multi-tenancy |
| 7 | 2026-02-14 | add_perf_indexes | Index performance |
| 8 | 2026-02-14 | backfill_tenant_id | Rétrocompatibilité |
| 9 | 2026-02-14 | create_channels_mapping | Mapping canaux |
| 10 | 2026-02-14 | create_webhook_event_log | Log événements |
| 11 | 2026-02-14 | drop_global_uniques | Suppression contraintes |
| 12 | 2026-02-14 | sql_gates_validation | Validation gates |
| 13 | 2026-02-15 | add_error_fields_to_message | Champs erreur |
| 14 | 2026-02-16 | expand_whapi_channel_token | Token Whapi étendu |
| 15 | 2026-02-18 | create_call_log | Logs appels |
| 16 | 2026-02-26 | add_auto_message_settings | Paramètres auto-msg |
| 17 | 2026-02-26 | create_auto_message_scope_config | Scope auto-msg |
| 18 | 2026-02-26 | fix_channel_fk_on_delete_set_null | Correction FK |

Commande de migration :
```bash
cd message_whatsapp
npm run migration:run
```

---

## 5. ANALYSE DES DÉPENDANCES

### Backend — Dépendances actives

| Package | Utilisation |
|---------|-------------|
| @nestjs/* | Framework principal |
| typeorm + mysql2 | ORM + driver MySQL |
| @nestjs/jwt + passport-jwt | Authentification |
| bcrypt | Hachage mots de passe |
| joi | Validation variables d'env |
| axios | HTTP vers Whapi/Meta |
| cookie-parser | Gestion cookies JWT |
| socket.io | WebSockets temps réel |
| class-validator + class-transformer | Validation DTOs |
| async-mutex | Locks concurrence dispatcher |
| @nestjs/schedule | CRON jobs |
| jsonwebtoken | JWT (token-refresh interceptor) |

### Backend — Dépendances à supprimer

| Package | Raison |
|---------|--------|
| **@casl/ability** | ❌ Aucune utilisation dans le code source |

### Frontend — Dépendances actives

| Package | Utilisation |
|---------|-------------|
| next 16.1.1 + react 19.2.3 | Framework |
| zustand | State management |
| socket.io-client | WebSockets |
| axios | HTTP |
| lucide-react | Icônes |
| emoji-mart + @emoji-mart/* | Sélecteur emoji |
| tailwindcss | Styles |

### Admin — Dépendances actives

| Package | Utilisation |
|---------|-------------|
| next 16.1.6 + react 19.2.3 | Framework |
| socket.io-client | WebSockets |
| lucide-react | Icônes |
| recharts | Graphiques statistiques |
| tailwindcss | Styles |

---

## 6. CONSOLE.LOG COMMENTÉS (inactifs)

Ces lignes sont déjà commentées et peuvent rester pour le débogage futur. Elles ne polluent pas la production :

- `dispatcher/dispatcher.service.ts` — 3 lignes
- `jorbs/first-response-timeout.job.ts` — 3 lignes
- `whatsapp_message/whatsapp_message.service.ts` — 3 lignes
- `whatsapp_message/whatsapp_message.gateway.ts` — 1 ligne
- `whapi/whapi.controller.ts` — 4 lignes
- `auth_admin/jwt_admin.strategy.ts` — 2 lignes

---

## 7. ÉTAT DES TESTS

| Partie | Fichiers spec | Couverture estimée |
|--------|-------------|-------------------|
| Backend | 45 .spec.ts | ~70% services, ~90% controllers |
| Frontend | 0 | ❌ Aucun |
| Admin | 0 | ❌ Aucun |

---

## 8. FICHIERS À CONSERVER / ARCHIVER / SUPPRIMER

### À SUPPRIMER (sans risque)

```
front/public/next.svg
front/public/vercel.svg
```

### À ARCHIVER (déplacer dans docs/archive/)

```
message_whatsapp/audit-timestamp-bug.md
message_whatsapp/cdc-historique-appels.md
message_whatsapp/contact-page-prompt.md
message_whatsapp/contact-ui-ux-audit.md
message_whatsapp/conversation-last-message-audit.md
message_whatsapp/maturity-analysis.md
message_whatsapp/plan-correction-timestamp.md
message_whatsapp/read-status-flow.md
```

### À CONSERVER (actifs ou utiles)

```
programmeTest/     ← scripts de test webhook (utile en recette)
docs/              ← documentation projet
scripts/           ← scripts utilitaires
.github/workflows/ ← CI/CD
docker-compose.yml ← déploiement
```

---

## 9. CHECKLIST PRODUCTION

### Backend
- [ ] Supprimer les 4 console.log actifs
- [ ] `npm uninstall @casl/ability`
- [ ] Vérifier `.env` non commité (secrets)
- [ ] Créer `.env.example` documenté
- [ ] `npm run migration:run` sur la DB de production
- [ ] `NODE_ENV=production` défini
- [ ] `npm run build` sans erreurs TypeScript
- [ ] `npm run test` → tous verts

### Frontend
- [ ] `.env` avec les bonnes URLs de production
- [ ] `npm run build` sans erreurs
- [ ] Supprimer `next.svg` et `vercel.svg` si inutilisés

### Admin
- [ ] Créer `.env` avec l'URL de production
- [ ] `npm run build` sans erreurs

### Infrastructure
- [ ] `docker-compose.yml` revu pour production
- [ ] Variables d'environnement injectées (pas de .env en prod)
- [ ] HTTPS configuré
- [ ] MySQL accessible depuis le backend

---

## 10. PRIORITÉS PAR URGENCE

### 🔴 CRITIQUE — Avant tout déploiement
1. Supprimer les 4 console.log de debug (fuite d'info en logs prod)
2. Secrets .env hors du dépôt Git
3. `NODE_ENV=production`

### 🟠 IMPORTANT — Dans les 48h
4. `npm uninstall @casl/ability`
5. Créer `.env.example` pour chaque sous-projet
6. Tester `npm run build` sur les 3 projets

### 🟡 À FAIRE — Sprint suivant
7. Archiver les 8 docs obsolètes
8. Supprimer assets template Next.js
9. Ajouter au moins quelques tests frontend/admin sur les pages critiques

---

*Généré par audit automatique — 2026-02-27*
