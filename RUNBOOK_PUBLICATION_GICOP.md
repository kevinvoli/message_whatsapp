# Runbook de publication GICOP — master → production

Date de rédaction : 2026-04-23
Statut : DRAFT (à finaliser après dry-run S9-001)

---

## 0. Pré-conditions (gate d'entrée)

Toutes les cases suivantes doivent être cochées avant de commencer.

- [ ] Dry-run migrations réussi sur copie de base `production` (S9-001)
- [ ] Décision GO validée en revue GO/NOGO (S9-004)
- [ ] Backup de la base `production` réalisé (voir §1)
- [ ] Fenêtre de maintenance communiquée aux commerciaux
- [ ] Au moins un admin disponible pendant le déploiement

---

## 1. Backup base production

```bash
# Sur le serveur DB ou via accès distant
mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  --single-transaction --quick \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Vérifier que le fichier est non vide
ls -lh backup_*.sql
```

---

## 2. Suspension des crons avant migration

Via le panel admin → Crons, désactiver **avant** tout changement de schéma :

| Cron | Action | Raison |
|------|--------|--------|
| `read-only-enforcement` | **OFF** | Éviter fermeture auto pendant migration |
| `sla-checker` | **OFF** | Éviter réinjection pendant migration |
| `offline-reinject` | **OFF** | Éviter réinjection pendant migration |
| `orphan-checker` | **OFF** | Éviter dispatch pendant migration |

Via l'interface admin → Paramètres → Crons → désactiver un par un.

---

## 3. Déploiement du code

```bash
# Sur le serveur applicatif
cd /path/to/message_whatsapp

git fetch origin
git checkout master
git pull origin master

npm install --production
```

---

## 4. Exécution des migrations TypeORM

Les migrations s'exécutent par ordre de timestamp. Toutes sont idempotentes (`hasTable` check).

```bash
npm run typeorm migration:run
```

### Migrations GICOP introduites (ordre chronologique)

| Fichier | Classe | Tables créées |
|---------|--------|---------------|
| `20260421_phase9_sliding_window.ts` | `Phase9SlidingWindow1745424000001` | `validation_engine_state`, `validation_criterion_config`, `call_event` |
| `20260422_commercial_phone.ts` | — | colonne `phone` sur `whatsapp_commercial` |
| `20260422_contact_assignment_affinity.ts` | — | `contact_assignment_affinity` |
| `20260422_gicop_conversation_report.ts` | — | `conversation_report` |
| `20260422_information_category_asset.ts` | `InformationCategoryAsset1745683200001` | `information_category_asset` |
| `20260422_sprint6_call_obligations.ts` | `Sprint6CallObligations1745769600001` | `commercial_obligation_batch`, `call_task` |

### Vérification post-migration

```sql
-- Vérifier que les tables GICOP existent
SHOW TABLES LIKE '%affinity%';
SHOW TABLES LIKE 'conversation_report';
SHOW TABLES LIKE '%obligation%';
SHOW TABLES LIKE 'call_task';
SHOW TABLES LIKE '%asset%';
SHOW TABLES LIKE '%window%';
SHOW TABLES LIKE 'call_event';
```

---

## 5. Redémarrage du serveur

```bash
pm2 restart message_whatsapp
# ou selon l'orchestrateur
systemctl restart whatsapp-backend

# Attendre 10 secondes, vérifier les logs
sleep 10
pm2 logs message_whatsapp --lines 50
```

Vérifier l'absence d'erreurs TypeORM et de `Cannot find column` au démarrage.

---

## 6. Configuration des feature flags GICOP

Via le panel admin → Paramètres → System Config :

| Clé | Valeur | Description |
|-----|--------|-------------|
| `FF_STICKY_ASSIGNMENT` | `true` | Sticky assignment obligatoire GICOP |
| `FF_GICOP_REPORT_REQUIRED` | `true` | Rapport GICOP obligatoire à la clôture |
| `SLIDING_WINDOW_ENABLED` | `true` | Fenêtre glissante active |
| `WINDOW_VALIDATION_THRESHOLD` | `0` | Toutes les conversations doivent être validées |
| `WINDOW_EXTERNAL_TIMEOUT_HOURS` | `0` | Désactiver auto-validation (ou valeur convenue) |
| `FF_FLOWBOT_ACTIVE` | `true` | FlowBot actif |

---

## 7. Initialisation des batches d'obligations d'appels

Via l'API admin (ou le panel admin → Dispatch → Obligations) :

```bash
curl -X POST https://<API_HOST>/call-obligations/init-all \
  -H "Cookie: <admin-session-cookie>"
```

Résultat attendu : `{ "created": N, "alreadyActive": 0 }` où N = nombre de postes.

---

## 8. Réactivation des crons

Après vérification du démarrage et des feature flags :

| Cron | Action | Notes |
|------|--------|-------|
| `sla-checker` | **ON** | Réactiver |
| `offline-reinject` | **ON** | Réactiver |
| `orphan-checker` | **ON** | Réactiver |
| `read-only-enforcement` | **ON** | Réactiver (FF_GICOP_REPORT_REQUIRED=true protège le rapport) |
| `webhook-purge` | **ON** | Doit rester actif |

---

## 9. Vérification post-déploiement

### 9.1 Tests manuels critiques

- [ ] Un commercial peut se connecter
- [ ] Les conversations s'affichent correctement dans la sidebar
- [ ] La badge "Obligations appels" est visible (si batch créé)
- [ ] L'onglet "Rapport GICOP" est accessible dans le chat
- [ ] La clôture d'une conversation sans rapport est bloquée (si FF_GICOP_REPORT_REQUIRED=true)
- [ ] Le badge "Fidèle" s'affiche pour les contacts avec affinité
- [ ] Le catalogue multimédia est accessible

### 9.2 Vérifications admin

- [ ] Panel admin → Dispatch → File d'attente : pas d'orphelins anormaux
- [ ] Panel admin → Dispatch → Obligations : chaque poste a un batch actif
- [ ] Panel admin → Go/No-Go → Section GICOP : tous les crons et flags au vert
- [ ] Panel admin → Crons : dernière exécution récente pour chaque cron

### 9.3 Logs à surveiller

```bash
pm2 logs message_whatsapp --lines 200 | grep -E "ERROR|WARN|AFFINITY|GICOP|CAPACITY"
```

---

## 10. Rollback logique (si anomalie critique)

Le rollback est **logique** (pas destructif) :

### 10.1 Désactiver les features GICOP

Via admin → System Config :
- `FF_GICOP_REPORT_REQUIRED` → `false`
- `FF_STICKY_ASSIGNMENT` → `false`
- `SLIDING_WINDOW_ENABLED` → `false`

### 10.2 Suspendre les crons GICOP

Via admin → Crons :
- `read-only-enforcement` → OFF
- `sla-checker` → OFF (temporairement)

### 10.3 Rollback code (si bug bloquant)

```bash
git checkout <commit-précédent>
npm install --production
pm2 restart message_whatsapp
```

> Les tables GICOP restent en base mais sont inactives. Les migrations `down()` existent
> mais ne doivent être exécutées qu'en dernier recours (perte de données).

---

## 11. Contacts et escalade

| Rôle | Action si problème |
|------|-------------------|
| Lead technique | Rollback logique §10 + diagnostic logs |
| Métier GICOP | Informer les commerciaux de la maintenance |
| DBA | Rollback BDD depuis backup §1 (en dernier recours) |

---

## Annexe — Crons internes non gérés via le panel

Ces handlers sont déclenchés par événements (pas via `CronConfigService`) :
- `ValidationEngineService.handleExternalCriterionTimeout` — timeout critère externe (fenêtre glissante)
- `FlowPollingJob.pollQueueWait` — polling FlowBot file d'attente
- `FlowPollingJob.pollInactivity` — polling FlowBot inactivité

Pour les désactiver : mettre `WINDOW_EXTERNAL_TIMEOUT_HOURS=0` et `FF_FLOWBOT_ACTIVE=false`.
