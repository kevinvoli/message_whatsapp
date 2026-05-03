SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Table: validation_criterion_config
-- 5 enregistrement(s)

INSERT INTO `validation_criterion_config` (`id`, `criterion_type`, `label`, `is_required`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
  ('vc000001-0001-4000-8000-000000000001', 'rapport_soumis', 'Rapport soumis', 1, 1, 1, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('vc000001-0002-4000-8000-000000000002', 'appel_effectue', 'Appel effectue (>=90s)', 1, 1, 2, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('vc000001-0003-4000-8000-000000000003', 'message_envoye', 'Message envoye', 1, 1, 3, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('vc000001-0004-4000-8000-000000000004', 'commande_saisie', 'Commande saisie', 0, 1, 4, '2026-01-01 08:00:00', '2026-01-01 08:00:00'),
  ('vc000001-0005-4000-8000-000000000005', 'rdv_confirme', 'RDV confirme', 0, 1, 5, '2026-01-01 08:00:00', '2026-01-01 08:00:00');

SET FOREIGN_KEY_CHECKS = 1;
