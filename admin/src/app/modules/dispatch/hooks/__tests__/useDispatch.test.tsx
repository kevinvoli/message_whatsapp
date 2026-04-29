import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDispatch } from '@/app/modules/dispatch/hooks/useDispatch';

vi.mock('@/app/modules/dispatch/api/dispatch.api', () => ({
  getDispatchSettings: vi.fn(),
  getDispatchSettingsAudit: vi.fn(),
  getDispatchSnapshot: vi.fn(),
  redispatchAllWaiting: vi.fn(),
  resetStuckConversations: vi.fn(),
  updateDispatchSettings: vi.fn(),
}));

import {
  getDispatchSettings,
  getDispatchSettingsAudit,
  getDispatchSnapshot,
  redispatchAllWaiting,
  resetStuckConversations,
  updateDispatchSettings,
} from '@/app/modules/dispatch/api/dispatch.api';

const SNAPSHOT_FAKE = { totalAgents: 1 } as never;
const SETTINGS_FAKE = { dispatchEnabled: true } as never;
const AUDIT_FAKE = [{ id: 'a1' }] as never;

describe('useDispatch', () => {
  beforeEach(() => {
    vi.mocked(getDispatchSnapshot).mockResolvedValue(SNAPSHOT_FAKE);
    vi.mocked(getDispatchSettings).mockResolvedValue(SETTINGS_FAKE);
    vi.mocked(getDispatchSettingsAudit).mockResolvedValue(AUDIT_FAKE);
    vi.mocked(updateDispatchSettings).mockResolvedValue({ dispatchEnabled: false } as never);
    vi.mocked(redispatchAllWaiting).mockResolvedValue({ dispatched: 7 } as never);
    vi.mocked(resetStuckConversations).mockResolvedValue({ reset: 3 } as never);
  });

  it('charge snapshot, settings et audit au montage', async () => {
    const { result } = renderHook(() => useDispatch());

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(SNAPSHOT_FAKE);
      expect(result.current.settings).toEqual(SETTINGS_FAKE);
      expect(result.current.audit).toEqual(AUDIT_FAKE);
      expect(result.current.loading).toBe(false);
    });
  });

  it('saveSettings — appelle updateDispatchSettings et met à jour settings', async () => {
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.saveSettings({ dispatchEnabled: false });
    });

    expect(updateDispatchSettings).toHaveBeenCalledWith({ dispatchEnabled: false });
    expect(result.current.settings).toEqual({ dispatchEnabled: false });
    expect(result.current.saving).toBe(false);
  });

  it('triggerRedispatch — appelle redispatchAllWaiting et renvoie le résultat', async () => {
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    let payload: { dispatched: number } | undefined;
    await act(async () => {
      payload = await result.current.triggerRedispatch();
    });

    expect(redispatchAllWaiting).toHaveBeenCalled();
    expect(payload).toEqual({ dispatched: 7 });
    expect(result.current.redispatching).toBe(false);
  });

  it('triggerResetStuck — appelle resetStuckConversations', async () => {
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    let payload: { reset: number } | undefined;
    await act(async () => {
      payload = await result.current.triggerResetStuck();
    });

    expect(resetStuckConversations).toHaveBeenCalled();
    expect(payload).toEqual({ reset: 3 });
    expect(result.current.resettingStuck).toBe(false);
  });

  it('loadAudit — applique les filtres avec offset par défaut 0', async () => {
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.audit.length).toBeGreaterThan(0));

    vi.mocked(getDispatchSettingsAudit).mockClear();
    await act(async () => {
      await result.current.loadAudit({ resetOnly: true, q: 'foo', from: '2026-01-01', to: '2026-01-31' });
    });

    expect(getDispatchSettingsAudit).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      resetOnly: true,
      q: 'foo',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('loadAudit — utilise offset custom', async () => {
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.audit.length).toBeGreaterThan(0));

    vi.mocked(getDispatchSettingsAudit).mockClear();
    await act(async () => {
      await result.current.loadAudit({ offset: 100 });
    });
    expect(getDispatchSettingsAudit).toHaveBeenCalledWith(expect.objectContaining({ offset: 100 }));
  });

  it('refresh — recharge tous les flux', async () => {
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    vi.mocked(getDispatchSnapshot).mockClear();
    vi.mocked(getDispatchSettings).mockClear();
    vi.mocked(getDispatchSettingsAudit).mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(getDispatchSnapshot).toHaveBeenCalled();
    expect(getDispatchSettings).toHaveBeenCalled();
    expect(getDispatchSettingsAudit).toHaveBeenCalled();
  });

  it('saving reste false en cas d\'erreur de saveSettings', async () => {
    vi.mocked(updateDispatchSettings).mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => useDispatch());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await expect(result.current.saveSettings({})).rejects.toThrow('fail');
    });
    expect(result.current.saving).toBe(false);
  });
});
