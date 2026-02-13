-- TKT-P2-005
-- Add durable idempotency store for webhook events

CREATE TABLE IF NOT EXISTS `webhook_event_log` (
  `id` char(36) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `event_key` varchar(191) NOT NULL,
  `event_type` varchar(64) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_webhook_event_log_event_key` (`event_key`),
  KEY `IDX_webhook_event_log_provider_createdAt` (`provider`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
