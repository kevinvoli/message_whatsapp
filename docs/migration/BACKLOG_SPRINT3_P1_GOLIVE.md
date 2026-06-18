# Backlog Sprint 3 — P1 + Préparation Go-live
> Branche cible : `feature/convergence-production` → merge dans `master`  
> Priorité : **P1 — Après validation sprint 1 + 2**  
> Semaine 3  
> Source : sections 10.3, 12 du plan de migration V2

---

## Partie A — Modules P1 (sprint B2)

### B2-1 — Couverture FlowBot business hours
- **Effort :** S
- **Action :** vérifier que le FlowBot master évalue correctement les business hours lors du déclenchement des triggers. Comparer le comportement production vs master sur un cas de message entrant hors horaires.
- **Non-régression :** les triggers FlowBot existants en production doivent se comporter identiquement dans master

### B2-2 — `ActivityPanel` front + `callButton` front
- **Effort :** S
- **Action :** porter les composants frontend d'activité (historique appels ou indicateur d'activité) présents en production et absents de master
- **Dépendance :** vérifier que `src/order-db/` (DB2) est correctement injecté

### B2-3 — `ChannelStatsView` admin
- **Effort :** S
- **Action :** porter la vue statistiques par canal (admin) de production vers master

### B2-4 — `TemplatesView` — alignement production vs master
- **Effort :** S
- **Action :** comparer `admin/src/app/ui/modules/templates/TemplatesView.tsx` (master) avec la version production. Si des fonctionnalités production manquent dans master (soumission, statuts PAUSED/IN_APPEAL/FLAGGED), les porter.
- **Non-régression :** le module `whatsapp-template` V2 (master) doit conserver ses fonctionnalités nouvelles

### B2-5 — `ProfilePicStorageService` — portage uniquement
- **Effort :** S
- **Statut production :** Livré (`src/media-storage/profile-pic-storage.service.ts`)
- **Action :** portage par cherry-pick — le service est déjà implémenté sur production (voir B1-18)
- **Non-régression :** Instagram → résolution photo de profil reste un no-op (App Review Meta requis)

### B2-6 — KPIs CTWA / métriques Meta Ad Referral
- **Effort :** S
- **Action :** endpoint admin `GET /api/metriques/meta-ad-kpi` — agrège `meta_ad_referral` + `IDX_msg_ctwa_kpi`
- **Dépendance :** B1-16 (module meta-ad-referral) + `AddMetaAdKpiIndex1780272000002`

---

## Partie B — Merge et second dry-run

### M-01 — Review avant merge
- **Action :** soumettre `feature/convergence-production` à une review complète
  ```
  → tester   : npm test (0 régression) + couverture conversation-restriction + gateway
  → reviewer : sécurité (HMAC webhooks, tokens, SQL injection) + conventions TypeORM
  ```
- **Critères Go :**
  - `tsc --noEmit` backend : 0 erreur
  - `npm test` : 0 régression
  - `next build` front + admin : 0 erreur
  - Review tester + reviewer validée

### M-02 — Merge `feature/convergence-production` → `master`
- **Action :** créer la Pull Request
  ```
  Base : master
  Head : feature/convergence-production
  ```
- **Règle :** ne jamais merger directement — toujours via PR avec review approuvée

### M-03 — Second dry-run sur staging propre
- **Actions :**
  1. Push master → `ci-cd.yml` déclenche automatiquement `migration:run` sur DB dev + deploy dev server
  2. Vérifier les logs GitHub Actions (toutes les migrations avec "success")
  3. Relancer `docs/migration/verify_integrity.sql` sur la DB dev (28 checks)
  4. Générer le rapport : `docs/migration/dry_run_report_YYYYMMDD_final.txt`
- **Ce rapport est un livrable obligatoire avant d'ouvrir la fenêtre de maintenance go-live**

---

## Partie C — Ajustements CI/CD pour le go-live

### CI-01 — Backup automatique avant migration (Ajout 1 dans `deploy-production.yml`)
- **Fichier :** `.github/workflows/deploy-production.yml`
- **Action :** ajouter le step backup avant le bloc "Migrations AVANT de démarrer les containers"
  ```yaml
  - name: Backup DB before migration
    uses: appleboy/ssh-action@v1
    with:
      host: ${{ secrets.PROD_SSH_HOST }}
      username: ${{ secrets.PROD_SSH_USER }}
      key: ${{ secrets.PROD_SSH_KEY }}
      script: |
        set -e
        set -a && source /var/www/whatsapp/message_whatsapp/.env && set +a
        BACKUP_FILE="/var/backups/db_prod_$(date +%Y%m%d_%H%M%S).sql.gz"
        docker exec whatsapp-db \
          mysqldump -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" --single-transaction "${MYSQL_DATABASE}" \
          | gzip > "$BACKUP_FILE"
        echo "Backup créé : $BACKUP_FILE"
        ls -lh "$BACKUP_FILE"
  ```
- **Important :** désactiver/supprimer ce step après le go-live (inutile pour les migrations incrémentales futures)

### CI-02 — Timeout SSH pour migrations longues (Ajout 2 dans `deploy-production.yml`)
- **Action :** ajouter `command_timeout: 30m` sur le step "Deploy via SSH (production)"
  ```yaml
  - name: Deploy via SSH (production)
    uses: appleboy/ssh-action@v1
    with:
      command_timeout: 30m
  ```
- **Raison :** les index covering sur `whatsapp_message` et la création des 9 tables quiz peuvent dépasser le timeout SSH par défaut (30s)
- **Important :** remettre à la valeur par défaut après le go-live

---

## Partie D — Checklist go-live (fenêtre de maintenance)

> Durée estimée : 45-60 min. Prévoir une fenêtre de 2h.

### Avant le push production (étapes manuelles obligatoires)

- [ ] Activer la page de maintenance (front + admin inaccessibles pour les utilisateurs)
- [ ] Arrêter les workers BullMQ production (éviter les écritures pendant la migration)
- [ ] Vérifier que le backup DB automatique (CI-01) est bien configuré dans le pipeline

### Surveillance pendant le pipeline

Surveiller dans GitHub Actions → onglet **Actions** → job `deploy-production.yml` :

- [ ] Step "Backup DB" : fichier `.sql.gz` créé sur le serveur
- [ ] Step "Migrations" : toutes les migrations listées avec **"success"** — aucune ligne "bloquée" ou `throw new Error`
- [ ] Step "docker compose up" : tous les containers démarrés
- [ ] Message final : **"DÉPLOIEMENT PRODUCTION RÉUSSI"**
- [ ] Aucun message **"ROLLBACK TERMINÉ"**

### Smoke tests avant ouverture utilisateurs

- [ ] Connexion commercial → session dans `messaging_connection_log`
- [ ] Envoi + réception message (Whapi + Meta)
- [ ] Lien campagne → redirect + clic enregistré + stats admin
- [ ] Upload média → médiathèque → sélection dans message auto
- [ ] Déconnexion idle après N minutes (si possible en accéléré)
- [ ] FlowBot trigger sur message entrant

### Ouverture

- [ ] Smoke tests OK → retirer la page de maintenance
- [ ] Surveiller les logs Docker pendant 30 min : `docker logs whatsapp-back --tail=200 -f`
- [ ] Vérifier les erreurs TypeORM au démarrage

---

## Partie E — Procédure de rollback (si smoke tests KO)

> **Ne pas retirer la page de maintenance avant que les smoke tests soient OK.**

### Rollback si `migration:run` échoue (pipeline s'arrête avec exit 1)

Les containers V1 continuent de tourner (non touchés). Analyser l'erreur :
```bash
# Récupérer les logs depuis GitHub Actions ou via SSH :
docker logs whatsapp-back --tail=100
```

Si la DB est partiellement migrée :
```bash
# Sur le serveur production :
set -a && source /var/www/whatsapp/message_whatsapp/.env && set +a
gunzip -c /var/backups/db_prod_YYYYMMDD_HHMMSS.sql.gz \
  | docker exec -i whatsapp-db mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}"
```

### Rollback si `docker compose up` échoue après `migration:run`

Le pipeline restaure automatiquement l'image `:prod-previous`. **Attention :** la DB est déjà au schéma V2.

**Vérifier immédiatement :**
```bash
docker logs whatsapp-back --tail=100
# Chercher des erreurs sur messages_predefinis (renommé) ou meta_app_id (supprimé)
```

- Si smoke V1 OK : toléré temporairement, corriger V2 et repush
- Si smoke V1 KO : rollback DB obligatoire via backup

---

## Partie F — Surveillance J+1

- [ ] Erreurs TypeORM dans les logs (colonnes manquantes, types incompatibles)
- [ ] Webhooks Whapi + Meta reçus et traités correctement
- [ ] Jobs BullMQ actifs (FlowBot, idle-disconnect, window-reminder)
- [ ] `window_expires_at` correctement mis à jour sur les nouvelles conversations
- [ ] Quiz quotidien délivré aux commerciaux
- [ ] Restriction conversations opérationnelle (si `RESTRICTION_ENABLED = true`)
- [ ] Médias téléchargés localement (`local_url` renseignée dans `whatsapp_media`)
