'use client';

/**
 * TICKET-09-C — Hook de données pour le domaine channels.
 *
 * Centralise : chargement des canaux, chargement des postes,
 * opérations CRUD sur les canaux.
 * La logique de formulaire (états des inputs) reste dans ChannelsView.
 */
import { useState, useEffect, useCallback } from 'react';
import { Channel, Poste } from '@/app/lib/definitions';
import { getChannels, assignChannelToPoste, refreshChannelToken } from '@/app/modules/channels/api/channels.api';
import { getPostes } from '@/app/modules/channels/api/channels.api';

export interface UseChannelsReturn {
  channels: Channel[];
  postes: Poste[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshToken: (channelId: string) => Promise<Channel>;
  assignPoste: (channelId: string, posteId: string | null) => Promise<Channel>;
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
}

export function useChannels(): UseChannelsReturn {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [channelsData, postesData] = await Promise.all([
        getChannels(),
        getPostes(),
      ]);
      setChannels(channelsData);
      setPostes(postesData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshToken = useCallback(
    (channelId: string) => refreshChannelToken(channelId),
    [],
  );

  const assignPoste = useCallback(
    (channelId: string, posteId: string | null) =>
      assignChannelToPoste(channelId, posteId),
    [],
  );

  return { channels, postes, loading, refresh, refreshToken, assignPoste, setChannels };
}
