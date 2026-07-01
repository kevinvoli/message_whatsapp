import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useBreakPrompt } from '@/hooks/useBreakPrompt';
import { useSocket } from '@/contexts/SocketProvider';
import { takeBreak } from '@/lib/api';

vi.mock('@/contexts/SocketProvider');
vi.mock('@/lib/api');

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('useBreakPrompt', () => {
  it('prompt est null au montage quand socket est null', () => {
    vi.mocked(useSocket).mockReturnValue({ socket: null, isConnected: false });
    const { result } = renderHook(() => useBreakPrompt());
    expect(result.current.prompt).toBeNull();
  });

  it('handleTakeBreak ne déclenche pas takeBreak si prompt est null', async () => {
    vi.mocked(useSocket).mockReturnValue({ socket: null, isConnected: false });
    vi.mocked(takeBreak).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useBreakPrompt());
    await act(async () => {
      await result.current.handleTakeBreak();
    });
    expect(takeBreak).not.toHaveBeenCalled();
  });

  it('le prompt est vidé quand break:prompt_clear est reçu', () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockSocket = {
      on: vi.fn((event: string, h: (...args: unknown[]) => void) => {
        handlers[event] = [...(handlers[event] ?? []), h];
      }),
      off: vi.fn(),
    };
    vi.mocked(useSocket).mockReturnValue({ socket: mockSocket as never, isConnected: true });

    const { result } = renderHook(() => useBreakPrompt());

    act(() => {
      handlers['break:prompt']?.[0]({
        breakScheduleId: 'sched-1',
        subGroupName: 'Groupe A',
        endTime: '12:00',
        messageText: null,
        audioUrl: null,
        reminderIntervalMinutes: 5,
        expiresAt: new Date().toISOString(),
      });
    });
    expect(result.current.prompt?.breakScheduleId).toBe('sched-1');

    act(() => {
      handlers['break:prompt_clear']?.[0]({ breakScheduleId: 'sched-1', reason: 'expired' });
    });
    expect(result.current.prompt).toBeNull();
  });

  it('handleTakeBreak appelle takeBreak avec le bon ID et vide le prompt', async () => {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockSocket = {
      on: vi.fn((event: string, h: (...args: unknown[]) => void) => {
        handlers[event] = [...(handlers[event] ?? []), h];
      }),
      off: vi.fn(),
    };
    vi.mocked(useSocket).mockReturnValue({ socket: mockSocket as never, isConnected: true });
    vi.mocked(takeBreak).mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useBreakPrompt());

    act(() => {
      handlers['break:prompt']?.[0]({
        breakScheduleId: 'sched-42',
        subGroupName: 'G',
        endTime: '14:00',
        messageText: null,
        audioUrl: null,
        reminderIntervalMinutes: 5,
        expiresAt: new Date().toISOString(),
      });
    });

    await act(async () => {
      await result.current.handleTakeBreak();
    });

    expect(takeBreak).toHaveBeenCalledWith('sched-42');
    expect(result.current.prompt).toBeNull();
  });
});
