'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Channel, Poste } from '@/app/lib/definitions';
import {
  getChannels,
  getPostes,
  assignChannelToPoste,
  refreshChannelToken,
} from '@/app/modules/channels/api/channels.api';

export const channelsQueryKeys = {
  all: ['channels'] as const,
  list: () => [...channelsQueryKeys.all, 'list'] as const,
  postes: () => ['postes', 'list'] as const,
};

export interface UseChannelsQueryReturn {
  channels: Channel[];
  postes: Poste[];
  loading: boolean;
  isError: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  refreshToken: (channelId: string) => Promise<Channel>;
  assignPoste: (channelId: string, posteId: string | null) => Promise<Channel>;
}

export function useChannelsQuery(): UseChannelsQueryReturn {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery<Channel[], Error>({
    queryKey: channelsQueryKeys.list(),
    queryFn: getChannels,
  });

  const postesQuery = useQuery<Poste[], Error>({
    queryKey: channelsQueryKeys.postes(),
    queryFn: getPostes,
  });

  const refreshTokenMutation = useMutation<Channel, Error, string>({
    mutationFn: (channelId: string) => refreshChannelToken(channelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelsQueryKeys.list() });
    },
  });

  const assignPosteMutation = useMutation<Channel, Error, { channelId: string; posteId: string | null }>({
    mutationFn: ({ channelId, posteId }) => assignChannelToPoste(channelId, posteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelsQueryKeys.list() });
    },
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: channelsQueryKeys.list() }),
      queryClient.invalidateQueries({ queryKey: channelsQueryKeys.postes() }),
    ]);
  }, [queryClient]);

  const refreshToken = useCallback(
    (channelId: string) => refreshTokenMutation.mutateAsync(channelId),
    [refreshTokenMutation],
  );

  const assignPoste = useCallback(
    (channelId: string, posteId: string | null) =>
      assignPosteMutation.mutateAsync({ channelId, posteId }),
    [assignPosteMutation],
  );

  return {
    channels: channelsQuery.data ?? [],
    postes: postesQuery.data ?? [],
    loading: channelsQuery.isLoading || postesQuery.isLoading,
    isError: channelsQuery.isError || postesQuery.isError,
    error: channelsQuery.error ?? postesQuery.error ?? null,
    refresh,
    refreshToken,
    assignPoste,
  };
}
