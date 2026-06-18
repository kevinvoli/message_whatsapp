# Backlog Non-Régression — Checklist complète (38 items)
> Principe fondamental : **Master V2 ne doit avoir aucune régression par rapport à la branche production.**  
> Toutes les fonctionnalités actives en production doivent être présentes et opérationnelles dans master V2.  
> À valider en environnement staging avant chaque go-live, et en J+1 post-déploiement.

---

## Domaine 1 — Connexion et sessions commerciaux

- [ ] **NR-01** Connexion commercial → session enregistrée dans `messaging_connection_log` (login_at renseigné, user_type = 'commercial')
- [ ] **NR-02** Déconnexion commercial → session fermée dans `messaging_connection_log` (logout_at renseigné)
- [ ] **NR-03** Inactivité détectée → modal d'avertissement `IdleWarningModal` s'affiche (`idle_warning_seconds` avant déconnexion)
- [ ] **NR-04** Inactivité prolongée → déconnexion automatique après `idle_disconnect_minutes` (socket fermé)
- [ ] **NR-05** Cooldown entre lectures → modal `ReadCooldownModal` visible et bloquant (`read_cooldown_seconds` respecté)

---

## Domaine 2 — Fenêtre glissante et sessions chat

- [ ] **NR-06** Champ de saisie commercial **débloqué** si `window_expires_at IS NULL` (conversation sans session active — historique)
- [ ] **NR-07** Champ de saisie commercial **bloqué** uniquement si `window_expires_at` est dans le passé (fenêtre effectivement expirée)
- [ ] **NR-08** Nouveau message client → `chat_session` créée, `active_session_id` mis à jour sur `whatsapp_chat`, `window_expires_at` calculé (now + 24h ou now + ttl_days_ctwa)
- [ ] **NR-09** Conversation fermée → `chat_session.ended_at` renseigné
- [ ] **NR-10** Fenêtre 72h CTWA → conversation arrivée via pub Meta a bien `is_ctwa = 1` et `window_expires_at = now + ttl_days_ctwa`
- [ ] **NR-11** Rappel fenêtre (Window Reminder cron J) → message de rappel envoyé avant expiration, `last_window_reminder_sent_at` mis à jour

---

## Domaine 3 — Restriction conversations

- [ ] **NR-12** Modal de restriction bloquant → s'affiche quand une autre conversation non répondue existe sur le même poste (guard `RESTRICTION_TRIGGERED`)
- [ ] **NR-13** Restriction restaurée après F5 → `socket.emit('restriction:check')` au reconnect restaure le modal si restriction active
- [ ] **NR-14** Poste dédié → restriction désactivée (canaux avec `poste_id IS NOT NULL` exemptés)
- [ ] **NR-15** `RESTRICTION_ENABLED = false` → restriction complètement inactive pour tous les postes

---

## Domaine 4 — Restriction contenu des messages

- [ ] **NR-16** Mot de plus de 26 caractères bloqué avant envoi (`MSG_RESTRICTION_MAX_WORD_LENGTH`)
- [ ] **NR-17** Répétition de lettre > 3 bloquée (ex: "aaaa" bloqué, "aaa" autorisé) (`MSG_RESTRICTION_MAX_REPEATED_CHARS`)
- [ ] **NR-18** Audio de moins de 10 secondes bloqué avant envoi (`MSG_RESTRICTION_MIN_AUDIO_DURATION_SECONDS`)
- [ ] **NR-19** Admin peut modifier les seuils depuis les paramètres système
- [ ] **NR-20** `MSG_RESTRICTION_ENABLED = false` → restriction contenu inopérante (aucun message bloqué)

---

## Domaine 5 — Fermeture des conversations

- [ ] **NR-21** Menu commercial ne contient **plus** l'option "Fermer" (supprimée en D4)
- [ ] **NR-22** Bouton "Fermer la conversation" visible et fonctionnel dans l'interface admin uniquement (D5)
- [ ] **NR-23** Conversation en_attente → redevient actif à la reconnexion du commercial sur le poste (fix C2 + C3)

---

## Domaine 6 — Médias et médiathèque

- [ ] **NR-24** Upload média depuis l'admin → visible dans la médiathèque (`media_asset` créé, `public_url` servie)
- [ ] **NR-25** Sélection d'un média dans un message auto → `media_asset_id` enregistré, média envoyé correctement
- [ ] **NR-26** Médias entrants téléchargés localement → `local_url` renseignée dans `whatsapp_media`, servie via `/uploads/media/...`
- [ ] **NR-27** Panneau médias commercial → tiroir latéral visible si `media_panel_enabled = true` pour le poste
- [ ] **NR-28** Filtres types médias → le panneau commercial respecte `media_panel_types` configuré par l'admin
- [ ] **NR-29** Galerie médias admin → filtres canal / poste / direction / type fonctionnent, miniatures affichées pour les médias avec `local_url`

---

## Domaine 7 — Liens campagne

- [ ] **NR-30** Lien campagne → redirect correct vers WhatsApp (`/c/:shortCode`)
- [ ] **NR-31** Clic enregistré → `click_count` incrémenté sur `campaign_link`, entrée dans `campaign_link_click`
- [ ] **NR-32** Stats admin → vue `CampaignLinksView` affiche clics et conversions

---

## Domaine 8 — Provider Instagram

- [ ] **NR-33** Envoi message texte commercial vers client Instagram fonctionne (`provider = 'instagram'`)
- [ ] **NR-34** Envoi média avec caption fonctionne (image, vidéo) — caption transmise correctement
- [ ] **NR-35** IDs messages Instagram longs (> 255 chars) correctement stockés (VARCHAR(512))

---

## Domaine 9 — QCM quotidien

- [ ] **NR-36** Commercial bloqué tant que le quiz du jour n'est pas complété (si session active et non exempté)
- [ ] **NR-37** Commercial exempté → accède au chat sans passer par le quiz
- [ ] **NR-38** Admin → résultats du quiz consultables (agrégats par commercial, par session, PDFs de formation téléchargeables)

---

## Domaine 10 — Fonctionnalités existantes à préserver (non-régression core)

Ces fonctionnalités existaient déjà dans les deux branches et ne doivent pas régresser :

- [ ] **NR-C1** Connexion commercial → page chat charge et affiche les conversations
- [ ] **NR-C2** Envoi + réception message Whapi (texte + média)
- [ ] **NR-C3** Envoi + réception message Meta/Messenger (texte + média)
- [ ] **NR-C4** Dispatcher → assignation conversation au bon poste (mode dédié et mode queue globale)
- [ ] **NR-C5** FlowBot → tous les triggers actifs en production déclenchent correctement (MESSAGE_RECEIVED, LABEL_ADDED, SLA_BREACH, etc.)
- [ ] **NR-C6** Templates HSM → création, soumission Meta, statut mis à jour (APPROVED/REJECTED/PAUSED)
- [ ] **NR-C7** Labels, réponses prédéfinies, audit trail → fonctionnent
- [ ] **NR-C8** Canaux dédiés → comportement exclusif préservé (rate-limit, cooldown, idle-disconnect désactivés)
- [ ] **NR-C9** Business hours → FlowBot respecte les horaires configurés
- [ ] **NR-C10** Trafic messages admin → diagramme 24h + 8 KPIs + auto-refresh 90s + toggle heure/jour
- [ ] **NR-C11** Mode lecture seule → compteur `max_messages_before_readonly` respecté, basculement automatique
- [ ] **NR-C12** Nom expéditeur → affiché sous chaque bulle (prénom commercial sortant, `from_name` client entrant)
- [ ] **NR-C13** Photo de profil Messenger → `profile_pic_fetched_at` mis à jour après résolution
- [ ] **NR-C14** Campagnes Meta CTWA → vue admin liste conversations avec image d'annonce et KPIs (clics, conversions)
- [ ] **NR-C15** Recherche conversations admin → déclenche une requête backend avec debounce (pas un filtre mémoire)
- [ ] **NR-C16** Scroll chat admin → ne force pas le défilement vers le bas si l'admin consulte l'historique
- [ ] **NR-C17** Statistiques commerciaux admin → `messages_read_count`, `messages_handled_count`, nombre de sessions depuis `messaging_connection_log`
- [ ] **NR-C18** Vérification signature HMAC webhooks → `assertWhapiSecret()`, `assertMetaSignature()`, `assertMessengerSignature()` actives (ne jamais commenter)

---

## Tableau de synthèse par sprint

| Sprint | Items couverts | Validé en |
|---|---|---|
| Sprint 1 Migrations (Axe A) | Infrastructure migrations DB — NR-06..11, NR-33..35 | Dry-run staging (28 checks SQL) |
| Sprint 1 Backend (Axe B) | Domaines 1, 3, 4, 5, 6 partiellement | Tests Jest + smoke test staging |
| Sprint 2 Frontend | Domaines 1, 2, 3, 4, 5, 6, 7, 8, 9 | `next build` + smoke test staging |
| Sprint 3 Go-live | Tous les 38 items NR | Smoke tests production J+0 + surveillance J+1 |

---

## Commandes de vérification rapide

```bash
# Backend : 0 erreur TypeScript
cd message_whatsapp && npx tsc --noEmit

# Tests unitaires : 0 régression
cd message_whatsapp && npm test

# Tests ciblés restriction + gateway
npm test -- --testPathPattern=conversation-restriction
npm test -- --testPathPattern=gateway

# Frontend : builds sans erreur
cd front && npm run build
cd admin && npm run build

# Intégrité DB post-migration
mysql -u$USER -p$PASS $DB < docs/migration/verify_integrity.sql
```
