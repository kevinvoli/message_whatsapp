# Plan d'Implémentation — Fonctionnalités Partielles & Optimisations
> Basé sur l'analyse du 2026-06-22 — Source : FEATURES.md

Ce plan couvre trois catégories issues de l'analyse :
- **Fonctionnalités partielles / incomplètes** (🔄 dans FEATURES.md)
- **Duplications & réutilisables détectés** (section dédiée FEATURES.md)
- **Fonctionnalités sans UI frontend** (endpoints backend sans appelant front/admin)

## Légende priorités
- 🔴 P0 — Critique (qualité de code / sécurité / bug bloquant)
- 🟠 P1 — Important (fonctionnalité visible utilisateur incomplète)
- 🟡 P2 — Optimisation (performance, UX, dette technique)
- 🔵 P3 — Refactoring / nettoyage (aucun impact fonctionnel)

## Légende effort
- XS — < 2h | S — demi-journée | M — 1 jour | L — 2-3 jours | XL — +3 jours

---

## Groupe 1 — Type Safety (any TypeScript) 🔴 P0

> Point bloquant en review. Les `any` masquent des bugs potentiels et cassent l'inférence TypeScript.

### T1 — jwt.strategy.ts & jwt_admin.strategy.ts
- **Fichiers** : `src/auth/strategies/jwt.strategy.ts`, `src/auth_admin/jwt_admin.strategy.ts`
- **Problème** : `req.user` typé `any` dans la méthode `validate()`
- **Action** : Déclarer une interface `JwtPayload` et un type `AuthenticatedUser` ; typer le retour de `validate()`
- **Effort** : XS
- **Dépendances** : Aucune

### T2 — communication_whapi.service.ts
- **Fichiers** : `src/communication_whapi/communication_whapi.service.ts`
- **Problème** : Payload envoyé aux APIs Whapi/Meta typé `any`
- **Action** : Créer des interfaces DTOs pour chaque type de payload sortant (text, media, template)
- **Effort** : S
- **Dépendances** : Aucune

### T3 — label.service.ts
- **Fichiers** : `src/label/label.service.ts`
- **Problème** : Clauses `where` TypeORM typées `any`
- **Action** : Utiliser `FindOptionsWhere<LabelEntity>` explicitement
- **Effort** : XS
- **Dépendances** : Aucune

### T4 — sla.service.ts
- **Fichiers** : `src/sla/sla.service.ts`
- **Problème** : Clauses `where` TypeORM typées `any`
- **Action** : Typer avec `FindOptionsWhere<SlaRule>`
- **Effort** : XS
- **Dépendances** : Aucune

### T5 — gdpr-optout.service.ts
- **Fichiers** : `src/gdpr-optout/gdpr-optout.service.ts`
- **Problème** : Clauses `where` typées `any`
- **Action** : Typer avec `FindOptionsWhere<GdprOptout>`
- **Effort** : XS
- **Dépendances** : Aucune

### T6 — targets.service.ts
- **Fichiers** : `src/targets/targets.service.ts`
- **Problème** : `any` détecté dans le service
- **Action** : Identifier les zones `any` et typer correctement (résultats de requêtes raw → interface dédiée)
- **Effort** : S
- **Dépendances** : Aucune

### T7 — broadcast.service.ts
- **Fichiers** : `src/broadcast/broadcast.service.ts`
- **Problème** : `any` dans la gestion des payloads BullMQ
- **Action** : Typer les job data avec une interface `BroadcastJobData`
- **Effort** : XS
- **Dépendances** : Aucune

### T8 — metriques.controller.ts
- **Fichiers** : `src/metriques/metriques.controller.ts:116`
- **Problème** : `snap.data as any` lors de la lecture des snapshots
- **Action** : Déclarer un type `SnapshotData` correspondant à la structure réelle du snapshot
- **Effort** : XS
- **Dépendances** : Aucune

---

## Groupe 2 — Sécurité & Accès 🔴 P0 / 🟠 P1

### S1 — Middleware IP sur chaque requête API 🔴 P0
- **Fichiers** : `src/geo-access/geo_access.controller.ts`, `src/geo-access/geo_access.service.ts`, `src/main.ts` + migration BDD
- **Problème** : La restriction IP n'est vérifiée qu'au login. De plus, certains postes ou commerciaux doivent pouvoir être dispensés individuellement.
- **Règles métier** :
  - Si **aucune zone IP n'est configurée** par l'admin → le guard laisse tout passer (désactivé de facto)
  - Si des zones sont configurées → le guard vérifie l'IP à **chaque requête authentifiée**
  - Un poste ou un commercial peut être **exempté individuellement** par l'admin (bypass total du guard pour cette entité)
- **Action** :
  1. **Migration BDD** : ajouter `ip_restriction_exempt: boolean` sur `WhatsappPoste` et `WhatsappCommercial` (défaut `false`)
  2. **GeoAccessService** : ajouter `isExempt(commercialId, posteId): Promise<boolean>` — vérifie les deux colonnes
  3. **IpAccessGuard** : créer le guard global — court-circuite si (a) aucune zone configurée OU (b) entité exemptée
  4. Appliquer via `APP_GUARD` dans `main.ts`, exclure routes publiques (`/auth/login`, `/webhooks/`, `/health`)
  5. **Admin UI** : ajouter un toggle "Exempté restriction IP" dans la fiche poste (`PostesView`) et la fiche commercial (`CommerciauxView`)
  6. **Admin UI** : exposer l'état global de la restriction (active/inactive) dans `IpAccessView` ou `SettingsView`
- **Effort** : L
- **Dépendances** : `GeoAccessService` déjà présent

### S2 — RBAC dynamique dans l'UI frontend (activable par super admin) 🟠 P1
- **Fichiers** : `front/src/contexts/AuthProvider.tsx`, `src/platform-settings/platform-settings.controller.ts`, composants concernés
- **Problème** : Le backend RBAC est complet mais les permissions ne conditionnent pas l'affichage des boutons/sections dans le frontend commercial. De plus, l'activation du RBAC doit être contrôlée par un super admin pour permettre un déploiement progressif.
- **Règles métier** :
  - Si `rbac_enabled = false` en settings → toutes les actions sont autorisées (comportement actuel, aucun changement)
  - Si `rbac_enabled = true` → les permissions du commercial conditionnent l'affichage et l'accès dans le frontend
- **Action** :
  1. **Platform settings** : ajouter la clé `rbac_enabled` (boolean) dans `PlatformSettings` — CRUD réservé au super admin
  2. **Backend** : exposer `rbac_enabled` dans `GET /auth/profile` (ou `GET /platform-settings/public`)
  3. **Frontend** : dans `AuthProvider`, charger `rbac_enabled` + les permissions du commercial au login
  4. **Hook** : créer `usePermission(permission: string): boolean` dans `front/src/hooks/` — retourne toujours `true` si `rbac_enabled = false`
  5. **Composants** : envelopper les éléments UI conditionnels avec ce hook
  6. **Admin UI** : toggle "Activer le contrôle RBAC frontend" dans `SettingsView` — visible uniquement pour le super admin
- **Effort** : L
- **Dépendances** : T1 (typage JWT payload)

---

## Groupe 3 — IA & Sentiment 🟠 P1

> Le backend IA est complet (suggestions, résumé, qualification, coaching, sentiment). Aucune UI frontend ne connecte ces endpoints.

### A1 — Widget suggestions IA dans le chat 🟠 P1
- **Fichiers** : `front/src/components/chat/ChatInput.tsx` (ou nouveau composant)
- **Endpoint** : `GET /ai/suggestions/:chat_id`
- **Action** :
  1. Créer un composant `AiSuggestionsPanel.tsx` — affiche 3 suggestions au-dessus du champ de saisie
  2. Bouton "Utiliser" pour injecter la suggestion dans `ChatInput`
  3. Toggle on/off selon gouvernance IA
- **Effort** : M
- **Dépendances** : Gouvernance IA (22.2 ✅)

### A2 — Résumé de conversation IA 🟠 P1
- **Fichiers** : `front/src/components/chat/ChatHeader.tsx`
- **Endpoint** : `GET /ai/summary/:chat_id`
- **Action** : Ajouter un bouton "Résumé IA" dans `ChatHeader` ouvrant un modal avec le résumé généré
- **Effort** : S
- **Dépendances** : Gouvernance IA

### A3 — Réécriture de texte IA 🟠 P1
- **Fichiers** : `front/src/components/chat/ChatInput.tsx`
- **Endpoint** : `POST /ai/rewrite`
- **Action** : Ajouter des actions contextuelles sur le texte saisi (corriger / formaliser / améliorer) via menu dropdown
- **Effort** : S
- **Dépendances** : Gouvernance IA

### A4 — Qualification de conversation IA 🟠 P1
- **Fichiers** : `front/src/components/chat/ChatHeader.tsx` ou panel latéral
- **Endpoint** : `POST /ai/qualify/:chat_id`
- **Action** : Bouton "Qualifier" dans l'interface agent → affiche outcome, intérêt, objection détectés
- **Effort** : S
- **Dépendances** : Gouvernance IA

### A5 — Coaching qualité agent (admin) 🟡 P2
- **Fichiers** : `admin/src/app/ui/CommerciauxView.tsx` ou nouvel onglet
- **Endpoint** : `POST /ai/quality/:chat_id`
- **Action** : Ajouter un onglet "Coaching IA" par commercial dans l'admin, affichant l'analyse qualité des dernières conversations
- **Effort** : M
- **Dépendances** : Gouvernance IA, droits admin

### A6 — Synthèse dossier client IA 🟡 P2
- **Fichiers** : `front/src/components/contacts/ContactDetailView.tsx`
- **Endpoint** : `GET /ai/dossier/:contact_id`
- **Action** : Ajouter une section "Synthèse IA" dans le dossier client
- **Effort** : S
- **Dépendances** : Gouvernance IA

### A7 — Affichage sentiment des messages 🟡 P2
- **Fichiers** : `front/src/components/chat/ChatMessage.tsx`
- **Données** : colonnes `sentiment_score` + `sentiment_label` sur `whatsapp_message`
- **Action** :
  1. Exposer `sentiment_label` dans la réponse `GET /messages/:chat_id`
  2. Afficher une icône discrète (positif/neutre/négatif) sur chaque message dans `ChatMessage.tsx`
  3. Optionnel : filtre "conversations négatives" dans l'admin
- **Effort** : M
- **Dépendances** : Aucune (données déjà présentes en BDD)

---

## Groupe 4 — Templates HSM 🟠 P1

### H1 — Activer le nouveau module templates
- **Fichiers** : `src/whatsapp_message/whatsapp_message.controller.ts:54`
- **Problème** : `HSM_TEMPLATES_ENABLED = false` — le nouveau module `whatsapp-template/` est complet mais désactivé
- **Action** :
  1. Passer `HSM_TEMPLATES_ENABLED` à `true` (ou via variable d'environnement)
  2. Tester les endpoints du nouveau module en staging
  3. Valider que `TemplateSelectorModal.tsx` appelle bien les bons endpoints
- **Effort** : S
- **Dépendances** : Tests en staging obligatoires avant production

### H2 — Supprimer l'ancien module templates (legacy) 🔵 P3
- **Fichiers** : `src/whatsapp_template/` (tout le dossier)
- **Problème** : Duplication de code entre `whatsapp_template/` (ancien) et `whatsapp-template/` (nouveau)
- **Action** :
  1. S'assurer que H1 est validé en production
  2. Vérifier qu'aucun appelant ne référence encore l'ancien module
  3. Supprimer `src/whatsapp_template/` et retirer son import de `AppModule`
- **Effort** : S
- **Dépendances** : H1 validé en production

---

## Groupe 5 — ERP Client Sync 🟡 P2

### E1 — Implémenter la sync retour vers ERP
- **Fichiers** : `src/erp-client-sync/` (dossier existant, peu développé)
- **Problème** : Le dossier `erp-client-sync/` existe mais n'est pas implémenté — la sync de retour des données vers l'ERP/GICOP est manquante
- **Action** :
  1. Définir le schéma des données à synchroniser vers l'ERP (statut conversations, GICOP reports, appels)
  2. Implémenter le service de sync avec écriture dans les tables miroir `messaging_*`
  3. Ajouter un job BullMQ pour la sync périodique
  4. Ajouter les logs dans `IntegrationSyncLog`
- **Effort** : XL
- **Dépendances** : Schéma DB2 confirmé, règle "jamais d'écriture tables natives DB2"
- **Note** : Bloquer jusqu'à confirmation du schéma DB2 par l'équipe métier

---

## Groupe 6 — PWA 🟡 P2

### P1 — Compléter la configuration PWA
- **Fichiers** : `front/src/components/PwaRegister.tsx`, `front/public/manifest.json` (à créer/compléter)
- **Problème** : Service worker enregistré mais offline mode non confirmé, manifest incomplet
- **Action** :
  1. Vérifier et compléter `manifest.json` (icônes, thème, orientation, `start_url`)
  2. Configurer le service worker pour le cache des assets statiques (Next.js)
  3. Tester l'installation PWA sur mobile Chrome/Safari
  4. Gérer l'état offline : afficher un banner "Hors ligne" si connexion perdue
- **Effort** : M
- **Dépendances** : Aucune

---

## Groupe 7 — Endpoints sans appelant identifié (backend sans UI) 🟡 P2

> Ces endpoints existent et fonctionnent côté backend mais n'ont aucun appelant frontend ou admin clairement identifié dans le codebase. Chaque item doit soit recevoir une UI, soit être documenté comme intentionnellement interne.

### O1 — GDPR opt-out dans l'admin 🟡 P2
- **Fichiers** : `admin/src/app/ui/` (nouvelle vue ou intégration dans Settings)
- **Endpoint** : `GET /admin/gdpr/optout`
- **Problème** : Endpoint CRUD complet côté backend (`gdpr-optout.controller.ts`) mais non visible dans les vues admin listées
- **Action** : Créer ou exposer une vue admin listant les opt-outs avec possibilité d'anonymisation (`DELETE /admin/gdpr/optout/:phone/anonymize`)
- **Effort** : S
- **Dépendances** : Aucune

### O2 — Bouton "Forcer validation" fenêtre glissante (admin) 🟡 P2
- **Fichiers** : `admin/src/app/modules/dispatch/` ou vue supervision
- **Endpoint** : `POST /window/force-validate/:chatId`
- **Problème** : Endpoint admin sans bouton évident dans l'UI — la validation forcée d'une conversation n'est pas accessible à l'admin depuis l'interface
- **Action** : Ajouter un bouton dans la vue de supervision ou dans la fiche conversation permettant à un admin de forcer la validation dans la fenêtre glissante
- **Effort** : S
- **Dépendances** : Aucune

### O3 — Chat contexts par poste (usage à clarifier) 🟡 P2
- **Fichiers** : `admin/src/app/modules/contexts/`
- **Endpoint** : `GET /contexts/poste/:posteId/chat-contexts`
- **Problème** : Endpoint admin sans appelant clairement identifié dans l'UI — usage prévu non confirmé
- **Action** : Investiguer l'usage prévu et soit l'intégrer dans `ContextsView`, soit le documenter comme endpoint interne (appelé par le FlowBot ou le frontend commercial)
- **Effort** : S
- **Dépendances** : Décision produit requise

### O4 — Analytics P5.2 : discordance endpoints / UI 🟡 P2
- **Fichiers** : `src/analytics/analytics.controller.ts`, `admin/src/app/ui/AnalyticsView.tsx`
- **Endpoints** : `GET /admin/analytics/summary`, `/conversations`, `/agents`, `/channels`
- **Problème** : Le module `src/analytics/` (P5.2) expose des endpoints distincts des endpoints `src/metriques/`. Une `AnalyticsView` admin existe mais il n'est pas confirmé qu'elle appelle `/admin/analytics/` plutôt que `/api/metriques/`. Risque de double implémentation ou d'endpoints fantômes.
- **Action** :
  1. Vérifier quels endpoints sont effectivement appelés dans `AnalyticsView.tsx` et `admin/src/app/lib/api/`
  2. Si `/admin/analytics/` n'est pas appelé → brancher `AnalyticsView` sur ces endpoints ou les supprimer
  3. Si les deux coexistent légitimement → documenter la différence (métriques opérationnelles vs analytics métier)
- **Effort** : S (investigation) + M (branchement UI si nécessaire)
- **Dépendances** : Aucune

---

## Groupe 8 — Optimisations Performance 🟡 P2

### PERF1 — Cache Redis sur RBAC getPermissions
- **Fichiers** : `src/rbac/rbac.service.ts`
- **Problème** : `getPermissions(commercialId)` requête BDD à chaque appel API protégé par guard
- **Action** :
  1. Injecter `Redis` dans `RbacService`
  2. Cache `rbac:permissions:{commercialId}` avec TTL de 5 minutes
  3. Invalider le cache lors d'une modification de rôle (`PATCH /rbac/roles/:id`, `POST /rbac/commercials/:id/roles`)
- **Effort** : S
- **Dépendances** : Redis déjà disponible dans le projet

### PERF2 — Indexation des entités métriques & analytics 🟡 P2
- **Fichiers** : `src/database/migrations/` (nouvelle migration), entités concernées
- **Problème** : Les requêtes métriques et analytics opèrent sur de larges volumes de données sans index couvrants sur les colonnes de filtrage/agrégation les plus fréquentes.
- **Entités & colonnes à indexer** :

  | Table | Colonnes | Requêtes concernées |
  |---|---|---|
  | `whatsapp_message` | `(chat_id, created_at)` | Trafic horaire, messages par conversation |
  | `whatsapp_message` | `(status, created_at)` | Taux livraison, SLA |
  | `whatsapp_message` | `(direction, created_at)` | Volume entrant/sortant |
  | `whatsapp_chat` | `(assigned_commercial_id, status, created_at)` | Métriques par commercial |
  | `whatsapp_chat` | `(channel_id, status, created_at)` | Métriques par canal |
  | `whatsapp_chat` | `(status, last_client_message_at)` | SLA, conversations en attente |
  | `audit_log` | `(action, created_at)` | Audit trail paginé |
  | `call_log` | `(commercial_id, called_at)` | Obligations appels, qualité |
  | `call_log` | `(phone, called_at)` | Match appel → tâche |
  | `whatsapp_message` | `(sentiment_label, created_at)` | Filtres sentiment |
  | `outbound_webhook_log` | `(webhook_id, created_at, status)` | Monitoring webhooks sortants |
  | `whatsapp_broadcast_recipient` | `(broadcast_id, status)` | Stats broadcast |

- **Action** :
  1. Créer une migration `AddMetricsAnalyticsIndexes<timestamp>` regroupant tous les `CREATE INDEX` listés ci-dessus
  2. Préfixer chaque index par `idx_` + table abrégée + colonnes : ex. `idx_msg_chat_created`, `idx_chat_commercial_status`
  3. Utiliser des **index couvrants** (covering indexes) quand les colonnes SELECT font partie des colonnes indexées
  4. Vérifier l'absence de doublons avec les index déjà créés dans `AddTrafficGroupingIndexes1748995200001` et `AddChannelStatsIndexes1782086400001`
  5. Après déploiement : valider avec `EXPLAIN` sur les endpoints les plus lourds (`/api/metriques/commerciaux`, `/admin/analytics/conversations`)
- **Effort** : M
- **Dépendances** : Vérifier les index existants avant de créer les nouveaux (éviter les doublons)

### PERF3 — Optimisation N+1 analytics (requêtes séquentielles)
- **Fichiers** : `src/metriques/metriques.service.ts`, `src/analytics/analytics.service.ts`
- **Problème** : Les endpoints d'analytics font potentiellement plusieurs requêtes séquentielles par commercial/canal au lieu de les paralléliser ou de les fusionner en `JOIN`
- **Action** :
  1. Profiler les requêtes SQL générées par `/api/metriques/commerciaux` et `/admin/analytics/agents`
  2. Remplacer les boucles séquentielles par `Promise.all()` si les requêtes sont indépendantes
  3. Fusionner les sous-requêtes récurrentes en `JOIN` ou sous-requêtes SQL natives
- **Effort** : M
- **Dépendances** : PERF2 (les index doivent être en place avant de profiler)

---

## Groupe 9 — Duplications & Réutilisables 🔵 P3

> Ces items proviennent directement de la section "Duplications / réutilisables détectés" de FEATURES.md. Ils n'ont pas d'impact fonctionnel immédiat mais génèrent de la confusion et alourdissent la maintenance.

### R1 — Déduplication modules templates backend 🔵 P3
- **Fichiers** : `src/whatsapp_template/` (legacy) vs `src/whatsapp-template/` (nouveau)
- **Problème** : Deux modules templates coexistent. Le nouveau (`whatsapp-template/`) est complet mais désactivé. L'ancien est en production mais à supprimer.
- **Action** :
  1. Activer le nouveau module (H1, déjà planifié)
  2. Vérifier qu'aucun appelant ne référence encore `whatsapp_template/`
  3. Supprimer `src/whatsapp_template/` et retirer son import de `AppModule`
- **Effort** : S
- **Dépendances** : H1 validé en production (voir Groupe 4)

### R2 — Déduplication vues admin (ui/ vs modules/) 🔵 P3
- **Fichiers** :
  - `admin/src/app/ui/ChannelsView.tsx` vs `admin/src/app/modules/channels/components/ChannelsView.tsx`
  - `admin/src/app/ui/AlertConfigView.tsx` vs `admin/src/app/modules/notifications/components/AlertConfigView.tsx`
  - Autres doublons `ui/` ↔ `modules/` (migration en cours)
- **Problème** : Migration vers architecture modulaire en cours — certaines vues existent en double. La version dans `ui/` est l'ancienne, celle dans `modules/` est la cible.
- **Action** :
  1. Pour chaque doublon, confirmer quelle version est effectivement routée dans `admin/src/app/dashboard/commercial/page.tsx`
  2. Conserver uniquement la version dans `modules/`
  3. Supprimer les fichiers orphelins dans `ui/`
- **Effort** : S par doublon (2-3 doublons identifiés)
- **Dépendances** : Aucune — vérifier les imports avant suppression

### R3 — Compléter l'UI Analytics FlowBot 🔵 P3
- **Fichiers** : `admin/src/app/modules/flowbot/components/FlowBuilderView.tsx`
- **Endpoint** : `GET /flowbot/flows/:flowId/analytics`
- **Problème** : L'endpoint analytics FlowBot existe et retourne des métriques d'exécution mais aucune UI admin ne les affiche clairement
- **Action** : Ajouter un onglet "Analytics" dans `FlowBuilderView.tsx` ou `FlowListView.tsx` affichant les métriques d'exécution (taux succès, temps moyen, erreurs par nœud)
- **Effort** : S
- **Dépendances** : Aucune

---

## Récapitulatif par priorité

| Priorité | Nb tâches | Effort total estimé |
|---|---|---|
| 🔴 P0 — Type Safety + Sécurité | 9 (T1→T8, S1) | ~4 jours |
| 🟠 P1 — Fonctionnel incomplet | 7 (S2, A1→A4, H1) | ~6 jours |
| 🟡 P2 — Optimisations + IA admin | 13 (A5→A7, E1, P1, O1→O4, PERF1→PERF3) | ~11 jours |
| 🔵 P3 — Duplications / nettoyage | 3 (R1→R3) | ~2 jours |
| **Total** | **32 tâches** | **~23 jours** |

---

## Ordre d'implémentation recommandé

### Sprint A — Type Safety (P0) — ~2 jours
```
T1 + T3 + T4 + T5 + T7 + T8  [en parallèle — XS chacune]
T2 + T6                        [en parallèle — S chacune]
```

### Sprint B — Sécurité & RBAC (P0/P1) — ~4 jours
```
S1 (middleware IP)
S2 (RBAC frontend) [dépend de T1]
```

### Sprint C — IA Frontend (P1) — ~3 jours
```
A1 + A2 + A3  [en parallèle]
A4            [après A1/A2]
H1            [indépendant]
```

### Sprint D — Endpoints & Complétion (P2) — ~8 jours
```
O4 (investigation analytics P5.2)  [en premier — peut annuler des tâches]
PERF2 (indexation métriques)        [migration BDD — indépendant]
PERF1 (cache Redis RBAC)
PERF3 (N+1 analytics)              [après PERF2]
A7 (sentiment UI)
A5 + A6  [en parallèle — IA admin]
O1 + O2 + O3  [en parallèle]
P1 (PWA)
```

### Sprint E — ERP Sync (P2, bloqué métier)
```
E1 [débloquer après confirmation schéma DB2 par l'équipe métier]
```

### Sprint F — Refactoring (P3) — ~2 jours
```
R1 [après H1 validé en production]
R2 [indépendant]
R3 [indépendant]
```

---

## Table de correspondance — Sections FEATURES.md → Tâches du plan

### Fonctionnalités partielles / incomplètes (🔄 FEATURES.md)

| Fonctionnalité | Réf FEATURES.md | Tâche(s) |
|---|---|---|
| RBAC non appliqué en UI front | 1.5 | S2 |
| Contrôle IP uniquement au login | 1.8 | S1 |
| Templates HSM feature flag désactivé | 6.2 | H1 |
| ERP client sync non implémenté | 9.7 | E1 |
| Suggestions IA sans UI | 22.1 | A1, A2, A3, A4 |
| Sentiment sans affichage | 22.3 | A7 |
| PWA incomplète | 31.1 | P1 (Groupe 6) |

### Duplications / réutilisables détectés (section FEATURES.md)

| Duplication | Tâche(s) |
|---|---|
| `whatsapp_template/` (legacy) vs `whatsapp-template/` (nouveau) | H1 → R1 |
| `admin/ui/ChannelsView` vs `admin/modules/channels/ChannelsView` | R2 |
| `admin/ui/AlertConfigView` vs `admin/modules/notifications/AlertConfigView` | R2 |
| Autres doublons `ui/` ↔ `modules/` (migration en cours) | R2 |
| `any` TypeScript dans 8 services | T1 → T8 |

### Fonctionnalités sans UI frontend identifiée (section FEATURES.md)

| Endpoint backend | Tâche(s) |
|---|---|
| `GET /ai/suggestions/:chat_id` | A1 |
| `GET /ai/summary/:chat_id` | A2 |
| `POST /ai/rewrite` | A3 |
| `POST /ai/qualify/:chat_id` | A4 |
| `POST /ai/quality/:chat_id` (coaching) | A5 |
| `GET /ai/dossier/:contact_id` | A6 |
| `sentiment_score` / `sentiment_label` (BDD sans rendu) | A7 |
| `GET /admin/analytics/summary\|conversations\|agents\|channels` (P5.2) | O4 |

### Endpoints backend sans appelant admin identifié (section FEATURES.md)

| Endpoint | Tâche(s) |
|---|---|
| `GET /admin/gdpr/optout` | O1 |
| `POST /window/force-validate/:chatId` | O2 |
| `GET /contexts/poste/:posteId/chat-contexts` | O3 |
| `GET /flowbot/flows/:flowId/analytics` | R3 |
