import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useIdleTimer } from '@/hooks/useIdleTimer';

const mockReplace = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'location', {
    value: { replace: mockReplace },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  cleanup();
});

describe('useIdleTimer', () => {
  it("ne déclenche rien quand idleMinutes <= 0", () => {
    const { result } = renderHook(() => useIdleTimer(0, 30));
    vi.advanceTimersByTime(60_000);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current.showWarning).toBe(false);
  });

  it('showWarning passe à true dans la fenêtre de warningSeconds', () => {
    const { result } = renderHook(() => useIdleTimer(1, 30));
    // Après 31s d'inactivité (1min - 30s = 30s écoulés = 60-30=30s restants → warning)
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current.showWarning).toBe(true);
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(30);
  });

  it('resetActivity remet showWarning à false', () => {
    const { result } = renderHook(() => useIdleTimer(1, 30));
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current.showWarning).toBe(true);
    act(() => { result.current.resetActivity(); });
    expect(result.current.showWarning).toBe(false);
  });

  it('redirige vers /login?reason=idle quand le temps expire', () => {
    renderHook(() => useIdleTimer(1, 5));
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(mockReplace).toHaveBeenCalledWith('/login?reason=idle');
  });

  it("le cleanup au unmount annule l'intervalle", () => {
    const { unmount } = renderHook(() => useIdleTimer(1, 30));
    unmount();
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
