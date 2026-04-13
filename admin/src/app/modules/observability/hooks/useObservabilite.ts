'use client';

/**
 * TICKET-09-C — Hook de données pour le domaine observabilité.
 *
 * Centralise : chargement des métriques webhook + santé système.
 */
import { useState, useEffect, useCallback } from 'react';
import { WebhookMetricsSnapshot } from '@/app/lib/definitions';
import { getWebhookMetrics } from '@/app/modules/observability/api/observability.api';
import { useSystemHealth } from '@/app/hooks/useSystemHealth';

export interface UseObservabiliteReturn {
  metrics: WebhookMetricsSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  systemHealth: ReturnType<typeof useSystemHealth>['status'];
  refreshHealth: ReturnType<typeof useSystemHealth>['refresh'];
}

export function useObservabilite(): UseObservabiliteReturn {
  const [metrics, setMetrics] = useState<WebhookMetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const { status: systemHealth, refresh: refreshHealth } = useSystemHealth();

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getWebhookMetrics();
      setMetrics(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { metrics, loading, refresh, systemHealth, refreshHealth };
}
