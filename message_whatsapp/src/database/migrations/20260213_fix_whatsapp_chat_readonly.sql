-- TKT-P1-006
-- Normalize whatsapp_chat readonly flag to boolean read_only

ALTER TABLE `whatsapp_chat`
  MODIFY COLUMN `read_only` TINYINT(1) NOT NULL DEFAULT 0;

SET @has_readonly := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'whatsapp_chat'
    AND COLUMN_NAME = 'readonly'
);

SET @update_sql := IF(
  @has_readonly > 0,
  'UPDATE `whatsapp_chat`\n   SET `read_only` = CASE\n     WHEN LOWER(TRIM(COALESCE(`readonly`, ''''))) IN (''true'',''1'',''yes'',''y'',''on'') THEN 1\n     WHEN LOWER(TRIM(COALESCE(`readonly`, ''''))) IN (''false'',''0'',''no'',''n'',''off'') THEN 0\n     ELSE `read_only`\n   END\n   WHERE `readonly` IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt_update FROM @update_sql;
EXECUTE stmt_update;
DEALLOCATE PREPARE stmt_update;

SET @drop_sql := IF(
  @has_readonly > 0,
  'ALTER TABLE `whatsapp_chat` DROP COLUMN `readonly`',
  'SELECT 1'
);
PREPARE stmt_drop FROM @drop_sql;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;
