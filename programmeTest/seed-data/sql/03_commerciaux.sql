SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Table: whatsapp_commercial
-- 5 enregistrement(s)

INSERT INTO `whatsapp_commercial` (`id`, `email`, `phone`, `name`, `password`, `salt`, `poste_id`, `passwordResetToken`, `passwordResetExpires`, `isConnected`, `commercial_type`, `lastConnectionAt`, `created_at`, `updated_at`, `deleted_at`) VALUES
  ('c0000001-0001-4000-8000-000000000001', 'aminata.coulibaly@gicop.ci', '+2250701234501', 'Aminata Coulibaly', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZOqHkLmWxYtR9vBcD7eF3aG1hI6jK0eSu', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZO', 'a1b2c3d4-0001-4000-8000-000000000001', NULL, NULL, 1, 'vendeuse_confirmee', '2026-05-03 08:00:00', '2026-01-15 09:00:00', '2026-05-03 08:00:00', NULL),
  ('c0000001-0002-4000-8000-000000000002', 'fatou.diallo@gicop.ci', '+2250701234502', 'Fatou Diallo', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZOqHkLmWxYtR9vBcD7eF3aG1hI6jK0eSu', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZO', 'a1b2c3d4-0002-4000-8000-000000000002', NULL, NULL, 1, 'vendeuse_confirmee', '2026-05-03 08:05:00', '2026-01-15 09:00:00', '2026-05-03 08:05:00', NULL),
  ('c0000001-0003-4000-8000-000000000003', 'mariame.traore@gicop.ci', '+2250701234503', 'Mariame Traore', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZOqHkLmWxYtR9vBcD7eF3aG1hI6jK0eSu', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZO', 'a1b2c3d4-0003-4000-8000-000000000003', NULL, NULL, 0, 'vendeuse_confirmee', '2026-05-02 17:30:00', '2026-01-15 09:00:00', '2026-05-02 17:30:00', NULL),
  ('c0000001-0004-4000-8000-000000000004', 'binta.kone@gicop.ci', '+2250701234504', 'Binta Kone', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZOqHkLmWxYtR9vBcD7eF3aG1hI6jK0eSu', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZO', 'a1b2c3d4-0004-4000-8000-000000000004', NULL, NULL, 1, 'vendeuse_confirmee', '2026-05-03 07:55:00', '2026-01-15 09:00:00', '2026-05-03 07:55:00', NULL),
  ('c0000001-0005-4000-8000-000000000005', 'adama.sangare@gicop.ci', '+2250701234505', 'Adama Sangare', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZOqHkLmWxYtR9vBcD7eF3aG1hI6jK0eSu', '$2b$10$K8mF4z0RJz1v5L8Q2N3PZO', 'a1b2c3d4-0005-4000-8000-000000000005', NULL, NULL, 1, 'superviseur', '2026-05-03 08:10:00', '2026-01-15 09:00:00', '2026-05-03 08:10:00', NULL);

SET FOREIGN_KEY_CHECKS = 1;
