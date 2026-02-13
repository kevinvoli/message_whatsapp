-- TKT-QUEUE-ADMIN
-- Add is_queue_enabled flag to whatsapp_poste

SET @has_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'whatsapp_poste'
    AND COLUMN_NAME = 'is_queue_enabled'
);

SET @add_sql := IF(
  @has_col = 0,
  'ALTER TABLE `whatsapp_poste` ADD COLUMN `is_queue_enabled` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt_add FROM @add_sql;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

SET @update_sql := IF(
  @has_col > 0,
  'UPDATE `whatsapp_poste` SET `is_queue_enabled` = 1 WHERE `is_queue_enabled` IS NULL',
  'SELECT 1'
);
PREPARE stmt_update FROM @update_sql;
EXECUTE stmt_update;
DEALLOCATE PREPARE stmt_update;
