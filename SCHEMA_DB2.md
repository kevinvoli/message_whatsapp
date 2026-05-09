# Schéma DB2 — Tables créées par la plateforme messagerie

> Base de données : `ORDER_DB` (connexion séparée MySQL ERP GICOP)  
> Règle : la plateforme messagerie ne crée qu'une seule table dans DB2.  
> Toutes les autres tables DB2 sont en lecture seule.

---

## `messaging_client_dossier_mirror`

Table créée et maintenue par la plateforme messagerie.  
Contient le miroir des dossiers clients issus des rapports de conversation.  
**À créer manuellement par l'équipe DB2.**

### DDL

```sql
CREATE TABLE IF NOT EXISTS messaging_client_dossier_mirror (
  messaging_chat_id        VARCHAR(100) NOT NULL,
  id_client                INT          DEFAULT NULL,
  id_commercial            INT          DEFAULT NULL,
  client_messaging_contact VARCHAR(200) DEFAULT NULL,
  client_phones            TEXT         DEFAULT NULL,
  client_name              VARCHAR(200) DEFAULT NULL,
  commercial_name          VARCHAR(200) DEFAULT NULL,
  commercial_phone         VARCHAR(30)  DEFAULT NULL,
  commercial_email         VARCHAR(200) DEFAULT NULL,
  ville                    VARCHAR(100) DEFAULT NULL,
  commune                  VARCHAR(100) DEFAULT NULL,
  quartier                 VARCHAR(100) DEFAULT NULL,
  product_category         VARCHAR(200) DEFAULT NULL,
  client_need              TEXT         DEFAULT NULL,
  interest_score           TINYINT      DEFAULT NULL,
  next_action              VARCHAR(50)  DEFAULT NULL,
  follow_up_at             DATETIME     DEFAULT NULL,
  notes                    TEXT         DEFAULT NULL,
  conversation_result      VARCHAR(50)  DEFAULT NULL,
  closed_at                DATETIME     DEFAULT NULL,
  sync_status              ENUM('pending','synced','error') DEFAULT 'pending',
  sync_error               TEXT         DEFAULT NULL,
  submitted_at             DATETIME     DEFAULT NULL,
  updated_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (messaging_chat_id),
  KEY IDX_mirror_id_client     (id_client),
  KEY IDX_mirror_id_commercial (id_commercial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Droits requis

| Opération | Tables | Raison |
|-----------|--------|--------|
| `SELECT` | `messaging_client_dossier_mirror` | Lecture statut sync |
| `INSERT` | `messaging_client_dossier_mirror` | Création dossier |
| `UPDATE` | `messaging_client_dossier_mirror` | Mise à jour dossier, fermeture |
| `DELETE` | aucune | Les données sont archivées, jamais supprimées |

### Impact si absent

Si cette table n'existe pas en DB2, chaque soumission de rapport commercial échoue silencieusement. L'outbox accumule des entrées `failed` avec backoff exponentiel (max 24h). L'alerte `OutboxAlertService` se déclenche au bout de 10 minutes d'attente ou 5 entrées en échec.
