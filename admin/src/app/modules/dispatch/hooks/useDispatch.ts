'use client';

/**
 * TICKET-09-C — Hook de données pour le domaine dispatch.
 *
 * Centralise : chargement des paramètres dispatch, snapshot, audit,
 * et opérations de contrôle (redispatch, reset stuck).
 */
import { useState, useEffect, useCallback } from 'react';
import { DispatchSettings, DispatchSettingsAudit, DispatchSnapshot } from '@/app/lib/definitions';
import {
  getDispatchSettings,
  getDispatchSettingsAudit,
  getDispatchSnapshot,
  redispatchAllWaiting,
  resetStuckConversations,
  updateDispatchSettings,
} from '@/app/modules/dispatch/api/dispatch.api';

export interface AuditFilters {
  resetOnly?: boolean;
  q?: string;
  from?: string;
  to?: string;
  offset?: number;
}

export interface UseDispatchReturn {
  snapshot: DispatchSnapshot | null;
  settings: DispatchSettings | null;
  audit: DispatchSettingsAudit[];
  loading: boolean;
  saving: boolean;
  redispatching: boolean;
  resettingStuck: boolean;
  refresh: () => Promise<void>;
  loadAudit: (filters?: AuditFilters) => Promise<DispatchSettingsAudit[]>;
  saveSettings: (payload: Partial<DispatchSettings>) => Promise<DispatchSettings>;
  triggerRedispatch: () => Promise<{ dispatched: number }>;
  triggerResetStuck: () => Promise<{ reset: number }>;
  setSettings: React.Dispatch<React.SetStateAction<DispatchSettings | null>>;
  setAudit: React.Dispatch<React.SetStateAction<DispatchSettingsAudit[]>>;
}

export function useDispatch(): UseDispatchReturn {
  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [settings, setSettings] = useState<DispatchSettings | null>(null);
  const [audit, setAudit] = useState<DispatchSettingsAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [redispatching, setRedispatching] = useState(false);
  const [resettingStuck, setResettingStuck] = useState(false);

  const loadAudit = useCallback(async (filters?: AuditFilters) => {
    return getDispatchSettingsAudit({
      limit: 50,
      offset: filters?.offset ?? 0,
      resetOnly: filters?.resetOnly,
      q: filters?.q,
      from: filters?.from,
      to: filters?.to,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [snapshotData, settingsData, auditData] = await Promise.all([
        getDispatchSnapshot(),
        getDispatchSettings(),
        loadAudit({ offset: 0 }),
      ]);
      setSnapshot(snapshotData);
      setSettings(settingsData);
      setAudit(auditData);
    } finally {
      setLoading(false);
    }
  }, [loadAudit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSettings = useCallback(async (payload: Partial<DispatchSettings>) => {
    setSaving(true);
    try {
      const updated = await updateDispatchSettings(payload);
      setSettings(updated);
      return updated;
    } finally {
      setSaving(false);
    }
  }, []);

  const triggerRedispatch = useCallback(async () => {
    setRedispatching(true);
    try {
      return await redispatchAllWaiting();
    } finally {
      setRedispatching(false);
    }
  }, []);

  const triggerResetStuck = useCallback(async () => {
    setResettingStuck(true);
    try {
      return await resetStuckConversations();
    } finally {
      setResettingStuck(false);
    }
  }, []);

  return {
    snapshot, settings, audit, loading, saving, redispatching, resettingStuck,
    refresh, loadAudit, saveSettings, triggerRedispatch, triggerResetStuck,
    setSettings, setAudit,
  };
}
