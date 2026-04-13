'use client';

/**
 * TICKET-09-C — Hook de données pour le domaine automations.
 *
 * Centralise : chargement des messages auto, cron configs,
 * business hours, postes et canaux nécessaires à la vue.
 */
import { useState, useEffect, useCallback } from 'react';
import type {
  MessageAuto,
  AutoMessageTriggerType,
  BusinessHoursConfig,
  CronConfig,
  Poste,
  Channel,
} from '@/app/lib/definitions';
import {
  getMessageAuto,
  getMessageAutoByTrigger,
  getBusinessHours,
} from '@/app/modules/automations/api/automations.api';
import { getCronConfigs } from '@/app/modules/automations/api/automations.api';
import { getPostes } from '@/app/lib/api/postes.api';
import { getChannels } from '@/app/lib/api/channels.api';

export interface UseAutomationsReturn {
  messages: MessageAuto[];
  cronConfigs: CronConfig[];
  businessHours: BusinessHoursConfig[];
  postes: Poste[];
  channels: Channel[];
  loading: boolean;
  refresh: () => Promise<void>;
  loadByTrigger: (trigger: AutoMessageTriggerType) => Promise<MessageAuto[]>;
  setMessages: React.Dispatch<React.SetStateAction<MessageAuto[]>>;
  setCronConfigs: React.Dispatch<React.SetStateAction<CronConfig[]>>;
  setBusinessHours: React.Dispatch<React.SetStateAction<BusinessHoursConfig[]>>;
}

export function useAutomations(): UseAutomationsReturn {
  const [messages, setMessages] = useState<MessageAuto[]>([]);
  const [cronConfigs, setCronConfigs] = useState<CronConfig[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [msgs, crons, hours, postesData, channelsData] = await Promise.all([
        getMessageAuto(),
        getCronConfigs(),
        getBusinessHours(),
        getPostes(),
        getChannels(),
      ]);
      setMessages(msgs);
      setCronConfigs(crons);
      setBusinessHours(hours);
      setPostes(postesData);
      setChannels(channelsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadByTrigger = useCallback(
    (trigger: AutoMessageTriggerType) => getMessageAutoByTrigger(trigger),
    [],
  );

  return {
    messages, cronConfigs, businessHours, postes, channels, loading,
    refresh, loadByTrigger,
    setMessages, setCronConfigs, setBusinessHours,
  };
}
