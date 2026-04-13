'use client';

/**
 * TICKET-09-C — Re-export du hook notifications existant.
 * Le hook métier est déjà défini dans `hooks/useNotifications.ts`.
 */
export { useNotifications } from '@/app/hooks/useNotifications';
export type { Notification, NotificationType } from '@/app/hooks/useNotifications';
