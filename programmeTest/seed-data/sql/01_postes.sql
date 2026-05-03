SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Table: whatsapp_poste
-- 5 enregistrement(s)

INSERT INTO `whatsapp_poste` (`id`, `code`, `name`, `is_active`, `numero_poste`, `is_queue_enabled`, `created_at`, `updated_at`) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'POSTE_ABOBO', 'Poste Abobo', 1, 1, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'POSTE_COCODY', 'Poste Cocody', 1, 2, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'POSTE_YOPOUGON', 'Poste Yopougon', 1, 3, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('a1b2c3d4-0004-4000-8000-000000000004', 'POSTE_MARCORY', 'Poste Marcory', 1, 4, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('a1b2c3d4-0005-4000-8000-000000000005', 'POSTE_KOUMASSI', 'Poste Koumassi', 1, 5, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00');

SET FOREIGN_KEY_CHECKS = 1;
