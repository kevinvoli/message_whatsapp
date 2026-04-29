import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChannels } from '@/app/modules/channels/hooks/useChannels';

vi.mock('@/app/modules/channels/api/channels.api', () => ({
  getChannels: vi.fn(),
  getPostes: vi.fn(),
  assignChannelToPoste: vi.fn(),
  refreshChannelToken: vi.fn(),
}));

import {
  getChannels,
  getPostes,
  assignChannelToPoste,
  refreshChannelToken,
} from '@/app/modules/channels/api/channels.api';

const CHANNELS_FAKE = [{ id: 'c1', name: 'channel-1' }] as never;
const POSTES_FAKE = [{ id: 'p1', name: 'poste-1' }] as never;

describe('useChannels', () => {
  beforeEach(() => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS_FAKE);
    vi.mocked(getPostes).mockResolvedValue(POSTES_FAKE);
    vi.mocked(refreshChannelToken).mockResolvedValue({ id: 'c1', tokenRefreshed: true } as never);
    vi.mocked(assignChannelToPoste).mockResolvedValue({ id: 'c1', posteId: 'p1' } as never);
  });

  it('charge channels et postes au montage', async () => {
    const { result } = renderHook(() => useChannels());

    await waitFor(() => {
      expect(result.current.channels).toEqual(CHANNELS_FAKE);
      expect(result.current.postes).toEqual(POSTES_FAKE);
      expect(result.current.loading).toBe(false);
    });
  });

  it('refreshToken — appelle l\'API et renvoie le canal', async () => {
    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.channels.length).toBeGreaterThan(0));

    let payload: unknown;
    await act(async () => {
      payload = await result.current.refreshToken('c1');
    });

    expect(refreshChannelToken).toHaveBeenCalledWith('c1');
    expect(payload).toEqual({ id: 'c1', tokenRefreshed: true });
  });

  it('assignPoste — appelle l\'API avec channelId et posteId', async () => {
    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.channels.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.assignPoste('c1', 'p1');
    });

    expect(assignChannelToPoste).toHaveBeenCalledWith('c1', 'p1');
  });

  it('assignPoste accepte posteId null pour désassigner', async () => {
    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.channels.length).toBeGreaterThan(0));

    await act(async () => {
      await result.current.assignPoste('c1', null);
    });
    expect(assignChannelToPoste).toHaveBeenCalledWith('c1', null);
  });

  it('refresh — recharge channels et postes', async () => {
    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.channels.length).toBeGreaterThan(0));

    vi.mocked(getChannels).mockClear();
    vi.mocked(getPostes).mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(getChannels).toHaveBeenCalled();
    expect(getPostes).toHaveBeenCalled();
  });

  it('setChannels — modifie l\'état local', async () => {
    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.channels.length).toBeGreaterThan(0));

    act(() => {
      result.current.setChannels([]);
    });
    expect(result.current.channels).toEqual([]);
  });

  it('expose les valeurs initiales avant le premier chargement', () => {
    let calls = 0;
    vi.mocked(getChannels).mockImplementation(() => {
      calls += 1;
      return new Promise(() => undefined);
    });
    vi.mocked(getPostes).mockImplementation(() => new Promise(() => undefined));

    const { result } = renderHook(() => useChannels());
    expect(result.current.channels).toEqual([]);
    expect(result.current.postes).toEqual([]);
    expect(calls).toBeGreaterThan(0);
  });
});
