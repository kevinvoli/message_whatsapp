'use client';

/**
 * TICKET-09-C — Hook de données pour le domaine settings.
 *
 * Centralise : chargement de la configuration système, des webhooks,
 * et mise à jour en bulk.
 */
import { useState, useEffect, useCallback } from 'react';
import { SystemConfigEntry, WebhookEntry } from '@/app/lib/definitions';
import {
  getSystemConfigs,
  getWebhookUrls,
  bulkUpdateSystemConfig,
} from '@/app/modules/settings/api/settings.api';

export interface UseSettingsReturn {
  configs: SystemConfigEntry[];
  webhooks: WebhookEntry[];
  loading: boolean;
  saving: boolean;
  refresh: () => Promise<void>;
  bulkUpdate: (updates: Array<{ key: string; value: string }>) => Promise<void>;
  setConfigs: React.Dispatch<React.SetStateAction<SystemConfigEntry[]>>;
}

export function useSettings(): UseSettingsReturn {
  const [configs, setConfigs] = useState<SystemConfigEntry[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [configsData, webhooksData] = await Promise.all([
        getSystemConfigs(),
        getWebhookUrls(),
      ]);
      setConfigs(configsData);
      setWebhooks(webhooksData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bulkUpdate = useCallback(async (updates: Array<{ key: string; value: string }>) => {
    setSaving(true);
    try {
      await bulkUpdateSystemConfig(updates);
      // Re-charger les configs après la mise à jour (l'API retourne { updated: number })
      const fresh = await getSystemConfigs();
      setConfigs(fresh);
    } finally {
      setSaving(false);
    }
  }, []);

  return { configs, webhooks, loading, saving, refresh, bulkUpdate, setConfigs };
}
