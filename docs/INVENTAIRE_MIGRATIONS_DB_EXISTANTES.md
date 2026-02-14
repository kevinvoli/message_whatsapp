# Inventaire migrations DB existantes

Date: 2026-02-14  
Scope: Phase S P1 (inventaire migrations)

## Migrations TypeORM (TS)
- `message_whatsapp/src/database/migrations/20260213_add_dispatch_settings.ts`
- `message_whatsapp/src/database/migrations/20260213_add_dispatch_settings_audit.ts`
- `message_whatsapp/src/database/migrations/20260213_add_pending_message_payload.ts`
- `message_whatsapp/src/database/migrations/20260213_add_poste_queue_enabled.ts`
- `message_whatsapp/src/database/migrations/20260213_remove_pending_messages.ts`
- `message_whatsapp/src/database/migrations/20260214_add_multitenant_columns.ts`
- `message_whatsapp/src/database/migrations/20260214_backfill_tenant_id.ts`
- `message_whatsapp/src/database/migrations/20260214_create_channels_mapping.ts`
- `message_whatsapp/src/database/migrations/20260214_create_webhook_event_log.ts`
- `message_whatsapp/src/database/migrations/20260214_drop_global_uniques.ts`
- `message_whatsapp/src/database/migrations/20260214_sql_gates_validation.ts`

## SQL scripts (hors TypeORM)
- `message_whatsapp/src/database/migrations/20260213_add_poste_queue_enabled.sql`
- `message_whatsapp/src/database/migrations/20260213_add_webhook_event_log.sql`
- `message_whatsapp/src/database/migrations/20260213_fix_whatsapp_chat_readonly.sql`

## Notes
- Les scripts `.sql` ne sont pas inclus dans `migration:run` (TypeORM).
- Les migrations 20260214 couvrent la multi‑tenance et la validation SQL gates.
