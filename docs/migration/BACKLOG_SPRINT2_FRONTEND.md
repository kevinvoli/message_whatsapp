# Backlog Sprint 2 — Axe B Frontend/Admin : Composants à porter + Dry-run staging
> Branche cible : `feature/convergence-production`  
> Priorité : **P0 — Bloquant avant go-live**  
> Semaine 2  
> Source : sections 10.2, 10.2b, 10.2c, 10.3b du plan de migration V2

---

## Partie A — Composants frontend (`front/`)

### F-01 — Gestion idle et cooldown (B1-7)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `IdleAndCooldownWrapper` : wrapper global qui détecte l'inactivité
  - `IdleWarningModal` : modal d'avertissement avant déconnexion automatique
  - `ReadCooldownModal` : modal de cooldown entre lectures (`read_cooldown_seconds`)
  - `useIdleTimer` : hook de détection inactivité
- **Dépendance backend :** `AddIdleDisconnectSettings` + `AddCooldownAndWarningSettings` (migrations portées en sprint 1)
- **Non-régression :** ne pas interférer avec le flux d'envoi de messages normal

### F-02 — Correctif fenêtre expirée — `ChatMainArea.tsx` (C1)
- **Effort :** XS
- **Fichier :** `front/src/components/chat/ChatMainArea.tsx`
- **Changement :** condition `windowExpired` → ajouter `windowExpiresAt != null &&` pour distinguer `null` (pas de session, champ débloqué) de "fenêtre expirée dans le passé" (champ bloqué)
- **Non-régression critique :** après ce fix, le champ de saisie ne doit plus être bloqué pour les conversations sans `window_expires_at` (historique avant le système de sessions)

### F-03 — Restriction conversations — `WebSocketEvents.tsx` (C9 + C10)
- **Effort :** S
- **Fichier :** `front/src/components/WebSocketEvents.tsx`
- **Changements :**
  - C9 : `socket.emit('restriction:check')` dans `refreshAfterConnect` au (re)connect — restaure le modal restriction après F5
  - C10 : handler `MESSAGE_SEND_ERROR` avec code `RESTRICTION_TRIGGERED` — nettoie le message optimiste et affiche l'erreur
- **Dépendance backend :** handler `restriction:check` (C7) doit être porté avant

### F-04 — Panneau médias commercial (B1-31)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `front/src/components/panel/MediaPanel.tsx` : tiroir latéral affichant les médias échangés sur le poste
  - `front/src/types/media-panel.ts` : types TypeScript
  - Visible uniquement si `media_panel_enabled = true` pour le poste
  - Respecte le filtre `media_panel_types` configuré par l'admin
- **Dépendance migration :** `AddMediaPanelToPoste1749513600001`

### F-05 — Pages quiz commercial (B1-32)
- **Effort :** M
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `front/src/app/quiz/page.tsx` : page d'accueil quiz (liste sessions actives)
  - `front/src/app/quiz/result/page.tsx` : page résultat quiz
  - Composants `front/src/components/quiz/` : QuizQuestion, QuizProgress, QuizAnswer
- **Non-régression :** commercial sans session quiz active accède normalement au chat

### F-06 — Middleware quiz (B1-35)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `front/src/middleware.ts` : protection routes quiz, redirection si quiz non complété, gestion sessions
- **Non-régression :** ne pas rediriger les commerciaux exemptés ou sans session active

### F-07 — Page d'erreur globale (B1-36)
- **Effort :** XS
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `front/src/app/global-error.tsx` : page d'erreur globale Next.js

### F-08 — Fermeture conversation — menu commercial (D4)
- **Effort :** XS
- **Fichier :** `front/src/components/conversation/conversationOptionMenu.tsx`
- **Changement :** supprimer `'fermé'` du tableau des options accessibles aux commerciaux
- **Non-régression :** les autres options du menu (transfert, labels, etc.) ne doivent pas être affectées

### F-09 — Nom expéditeur sous les bulles (B1-33)
- **Effort :** S
- **Statut production :** Livré
- **Fichier :** `front/src/components/chat/ChatMessage.tsx`
- **Changement :** afficher `sender_name` sous chaque bulle de message (prénom commercial sortant, `from_name` client entrant)
- **Non-régression :** champ `sender_name` existait déjà en DB — aucune migration nécessaire

---

## Partie B — Composants admin (`admin/`)

### A-01 — Médiathèque admin (B1-8)
- **Effort :** M
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/MediathequeView.tsx` : vue liste des media_assets avec filtres
  - `MediaPickerModal.tsx` : modal de sélection d'un média pour les messages auto
  - Endpoint : `GET /api/media-asset` + `POST /api/media-asset` (upload)
- **Dépendance backend :** B1-1 (service + controller)

### A-02 — Liens campagne admin (B1-9)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/CampaignLinksView.tsx` : liste liens, stats clics/conversions, création
- **Dépendance backend :** B1-2

### A-03 — Trafic messages admin (B1-10)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/MessageTrafficView.tsx` ou `ConversationsTrafficTab.tsx` : diagramme 24h + 8 KPIs + toggle heure/jour + auto-refresh 90s
- **Dépendance migration :** `AddTrafficGroupingIndexes1748995200001`

### A-04 — Canaux dédiés et lecture seule admin (B1-11)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/DedicatedChannelsView.tsx`
  - `admin/src/app/ui/LectureSeuleView.tsx`

### A-05 — Fonctions API dans `admin/lib/api/` (B1-12)
- **Effort :** M
- **Ce qu'il faut porter :**
  - Toutes les fonctions d'appels HTTP production absentes de master dans `admin/src/app/lib/api.ts`
  - Vérifier la couverture de : campaign-link, media-asset, quiz, galerie-media, metriques/commerciaux-stats, poste-panel/media

### A-06 — Statistiques commerciaux enrichies (B1-34)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/CommerciauxView.tsx` enrichi : onglet statistiques avec `messages_read_count`, `messages_handled_count`, `last_activity_at`, nombre de sessions depuis `messaging_connection_log`
  - Endpoint : `GET /api/metriques/commerciaux-stats`
- **Dépendance backend :** B1-5

### A-07 — Galerie médias conversation admin (B1-29)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/GalerieMediaView.tsx`
  - `admin/src/app/dashboard/galerie-media/page.tsx`
  - Endpoint : `GET /api/galerie-media?channel_id=&poste_id=&direction=IN|OUT&media_type=`
- **Dépendance backend :** B1-25

### A-08 — Configuration panneau médias par poste (B1-30)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/PosteMediaPanelModal.tsx` : modal admin pour activer/configurer `media_panel_enabled` et `media_panel_types`

### A-09 — Vue campagnes Meta CTWA (B1-28)
- **Effort :** S
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - `admin/src/app/ui/MetaCampaignsView.tsx` : conversations CTWA avec image d'annonce et KPIs (clics, conversions)
- **Dépendance migration :** `AddMetaAdReferral1780272000001` + `AddMetaAdKpiIndex1780272000002`

### A-10 — Gestion QCM admin (B1-22)
- **Effort :** L
- **Ce qu'il faut porter :**
  - `admin/src/app/dashboard/quiz/` : pages de gestion des catégories, questions, sessions, résultats, PDFs de formation
- **Dépendance backend :** B1-17 (module quiz)

### A-11 — Fermeture conversation côté admin (D5)
- **Effort :** S
- **Fichier :** `admin/src/app/ui/ConversationsView.tsx` ou composant approprié
- **Changement :** ajouter bouton "Fermer la conversation" (endpoint `PATCH /chats/:chat_id` déjà présent)
- **Non-régression :** la fermeture par l'admin doit être la seule voie après suppression de l'option côté commercial (D4)

### A-12 — Nom expéditeur sous les bulles admin (B1-33)
- **Effort :** S
- **Fichier :** `admin/src/app/ui/ConversationsView.tsx`
- **Changement :** afficher `sender_name` sous chaque bulle (même logique que front F-09)

### A-13 — Scroll chat auto-conditionnel (D2)
- **Effort :** S
- **Fichier :** `admin/src/app/ui/ConversationsView.tsx`
- **Changement :** auto-scroll vers le bas uniquement si l'admin était déjà en bas (ne pas forcer si en train de lire l'historique)

### A-14 — Recherche conversations avec debounce (D3)
- **Effort :** S
- **Fichier :** `admin/src/app/ui/ConversationsView.tsx`
- **Changement :** déclencher une requête `GET /chats?q=` avec debounce au lieu d'un filtre mémoire
- **Dépendance backend :** endpoint `GET /chats?q=` avec paramètre recherche (D3 backend)

---

## Partie C — Validation compilation

### B1-13 — Compilation 0 erreur
- **Effort :** S
- **Actions :**
  ```bash
  # Backend
  cd message_whatsapp && npx tsc --noEmit
  
  # Frontend
  cd front && npm run build
  
  # Admin
  cd admin && npm run build
  ```
- **Critère Go :** les 3 builds doivent passer sans erreur avant de passer au sprint 2 dry-run

---

## Partie D — Dry-run staging (fin semaine 2)

### DRY-01 — Import DB production sur staging
- **Actions :**
  1. Export phpMyAdmin production → `production_YYYYMMDD.sql.gz`
  2. Créer DB staging `db_v2_staging` (utf8mb4_unicode_ci)
  3. Import via phpMyAdmin (ou `mysql` CLI si > 500 MB)
  4. En tête SQL si erreur collation : `SET NAMES utf8mb4;`

### DRY-02 — Exécuter les migrations
```bash
cd message_whatsapp
npm run migration:run 2>&1 | tee docs/migration/dry_run_report_$(date +%Y%m%d).txt
```

### DRY-03 — Vérification intégrité (28 checks)
```bash
mysql -u$USER -p$PASS db_v2_staging < docs/migration/verify_integrity.sql \
  >> docs/migration/dry_run_report_$(date +%Y%m%d).txt
```
**Critères Go/NoGo :**
- Tous les checks `ORPHAN_*` = 0
- `COUNT_COMMERCIAL` = COUNT prod ± 0
- `COUNT_MESSAGE` = COUNT prod ± 0.1%
- `BIZ_HOURS_DAYS_COUNT` = 7
- `WINDOW_EXPIRES_AT_NULL_ACTIVE` = 0

### DRY-04 — Vérification spécifique migration DropLegacyChannelCredentials
```sql
SELECT id, label, provider, meta_app_id, meta_app_secret, application_id
FROM whapi_channels
WHERE provider IN ('meta', 'messenger', 'instagram')
  AND application_id IS NULL
  AND meta_app_secret IS NOT NULL AND meta_app_secret != '';
```
**Critère Go :** 0 ligne. Si > 0 ligne : créer les `messaging_application` manquants avant go-live.

### DRY-05 — Mesurer les durées
- Durée `AddTrafficGroupingIndexes` (index covering sur `whatsapp_message`)
- Durée `AddQuizSystem` (9 tables + FK)
- Durée `BackfillWindowExpiresAt` (UPDATE sur conversations actives)
- **Si une migration dépasse 5 min :** augmenter `command_timeout` dans `deploy-production.yml` (voir section 12.4 du plan)

### DRY-06 — Vérification conflit `AddWindowReminderSection` + `remove_auto_message_legacy`
- Vérifier dans les logs dry-run que `AddWindowReminderSection` ne cherche pas `messages_predefinis` après le renommage en `_legacy_messages_predefinis`
- Si conflit : adapter le nom de table dans la migration

---

## Checklist de non-régression frontend/admin

Après portage de chaque composant :

- [ ] `next build` front : 0 erreur TypeScript
- [ ] `next build` admin : 0 erreur TypeScript
- [ ] Connexion commercial → page chat s'affiche correctement
- [ ] Champ de saisie débloqué pour une conversation active sans `window_expires_at` (fix C1)
- [ ] Champ de saisie bloqué si `window_expires_at` dans le passé (comportement attendu)
- [ ] Modal idle-warning s'affiche avant la déconnexion automatique
- [ ] Modal cooldown s'affiche entre deux lectures rapides
- [ ] Menu commercial ne contient plus l'option "Fermer" (fix D4)
- [ ] Bouton "Fermer" visible uniquement dans l'interface admin (fix D5)
- [ ] Scroll admin ne force pas le défilement vers le bas quand l'admin lit l'historique (fix D2)
- [ ] Recherche conversations admin déclenche une requête HTTP (fix D3)
- [ ] Tiroir médias commercial visible si `media_panel_enabled = true`
- [ ] Modal restriction restauré après F5 commercial (fix C9)
