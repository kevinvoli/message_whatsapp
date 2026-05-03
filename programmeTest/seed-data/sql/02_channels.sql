SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Table: whapi_channels
-- 5 enregistrement(s)

INSERT INTO `whapi_channels` (`id`, `tenant_id`, `label`, `provider`, `external_id`, `channel_id`, `token`, `meta_app_id`, `meta_app_secret`, `webhook_secret`, `verify_token`, `page_id`, `token_expires_at`, `start_at`, `uptime`, `version`, `device_id`, `ip`, `is_business`, `api_version`, `core_version`, `poste_id`, `no_read_only`, `no_close`, `createdAt`, `updatedAt`) VALUES
  ('b0000001-0001-4000-8000-000000000001', 'f0000001-0001-4000-8000-000000000001', 'Canal Abobo', 'whapi', 'ext_abobo_001', 'ch_abobo@c.us', 'tok_abobo_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', NULL, NULL, NULL, NULL, NULL, NULL, 1700000000, 86400, '2.5.1', 1, '192.168.1.1', 1, '7.9', '2.9', 'a1b2c3d4-0001-4000-8000-000000000001', 0, 0, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('b0000001-0002-4000-8000-000000000002', 'f0000001-0001-4000-8000-000000000001', 'Canal Cocody', 'whapi', 'ext_cocody_002', 'ch_cocody@c.us', 'tok_cocody_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7', NULL, NULL, NULL, NULL, NULL, NULL, 1700000001, 86400, '2.5.1', 2, '192.168.1.2', 1, '7.9', '2.9', 'a1b2c3d4-0002-4000-8000-000000000002', 0, 0, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('b0000001-0003-4000-8000-000000000003', 'f0000001-0001-4000-8000-000000000001', 'Canal Yopougon', 'whapi', 'ext_yopougon_003', 'ch_yopougon@c.us', 'tok_yopougon_c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', NULL, NULL, NULL, NULL, NULL, NULL, 1700000002, 86400, '2.5.1', 3, '192.168.1.3', 1, '7.9', '2.9', 'a1b2c3d4-0003-4000-8000-000000000003', 0, 0, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('b0000001-0004-4000-8000-000000000004', 'f0000001-0001-4000-8000-000000000001', 'Canal Marcory', 'whapi', 'ext_marcory_004', 'ch_marcory@c.us', 'tok_marcory_d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9', NULL, NULL, NULL, NULL, NULL, NULL, 1700000003, 86400, '2.5.1', 4, '192.168.1.4', 1, '7.9', '2.9', 'a1b2c3d4-0004-4000-8000-000000000004', 0, 0, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('b0000001-0005-4000-8000-000000000005', 'f0000001-0001-4000-8000-000000000001', 'Canal Koumassi', 'whapi', 'ext_koumassi_005', 'ch_koumassi@c.us', 'tok_koumassi_e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', NULL, NULL, NULL, NULL, NULL, NULL, 1700000004, 86400, '2.5.1', 5, '192.168.1.5', 1, '7.9', '2.9', 'a1b2c3d4-0005-4000-8000-000000000005', 0, 0, '2026-01-01 08:00:00', '2026-01-01 08:00:00');

SET FOREIGN_KEY_CHECKS = 1;
