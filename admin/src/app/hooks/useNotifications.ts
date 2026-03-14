import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AdminNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
  getNotificationStreamUrl,
} from '@/app/lib/api';

export type NotificationType = AdminNotification['type'];
export type { AdminNotification as Notification };

export function useNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Chargement initial depuis l'API ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getNotifications(50, 0);
      setNotifications(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Connexion SSE — reçoit les nouvelles notifs en temps réel ────────────
  useEffect(() => {
    void load();

    const url = getNotificationStreamUrl();
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      try {
        const notification = JSON.parse(String(event.data)) as AdminNotification;
        setNotifications((prev) => [notification, ...prev].slice(0, 100));
        setTotal((prev) => prev + 1);
      } catch {
        // ping ou données invalides — on ignore
      }
    };

    es.onerror = () => {
      // EventSource se reconnecte automatiquement — on ne ferme pas
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [load]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    await markNotificationRead(id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    setTotal(0);
    await clearAllNotifications();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    total,
    loading,
    unreadCount,
    reload: load,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
}
