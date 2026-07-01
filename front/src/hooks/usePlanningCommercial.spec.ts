import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { usePlanningJour, usePlanningMois } from '@/hooks/usePlanningCommercial';
import { getPlanningToday, getPlanningMonth } from '@/lib/api';
import type { CommercialPlanningEntry } from '@/lib/definitions';

vi.mock('@/lib/api');

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

const mockEntry: CommercialPlanningEntry = {
  id: 'entry-1',
  date: '2026-07-01',
  type: 'exceptional',
  timeSlot: 'full',
  reason: null,
  linkedCommercialId: null,
};

describe('usePlanningJour', () => {
  it("retourne 'loading' pendant le fetch", () => {
    vi.mocked(getPlanningToday).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlanningJour());
    expect(result.current.planning).toBe('loading');
  });

  it('retourne null si API retourne null', async () => {
    vi.mocked(getPlanningToday).mockResolvedValue(null);
    const { result } = renderHook(() => usePlanningJour());
    await waitFor(() => expect(result.current.planning).toBeNull());
  });

  it("retourne null si API rejette", async () => {
    vi.mocked(getPlanningToday).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => usePlanningJour());
    await waitFor(() => expect(result.current.planning).toBeNull());
  });

  it("retourne l'entrée si API réussit", async () => {
    vi.mocked(getPlanningToday).mockResolvedValue(mockEntry);
    const { result } = renderHook(() => usePlanningJour());
    await waitFor(() => expect(result.current.planning).toEqual(mockEntry));
  });
});

describe('usePlanningMois', () => {
  it('démarre avec loading=true et entrées vides', () => {
    vi.mocked(getPlanningMonth).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlanningMois(2026, 7));
    expect(result.current.loading).toBe(true);
    expect(result.current.entries).toEqual([]);
  });

  it('met à jour entries après fetch réussi', async () => {
    vi.mocked(getPlanningMonth).mockResolvedValue([mockEntry]);
    const { result } = renderHook(() => usePlanningMois(2026, 7));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.entries).toEqual([mockEntry]);
    });
  });

  it('ignore la réponse si le composant est démonté avant la résolution', async () => {
    let resolve!: (v: CommercialPlanningEntry[]) => void;
    vi.mocked(getPlanningMonth).mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result, unmount } = renderHook(() => usePlanningMois(2026, 7));
    unmount();
    resolve([mockEntry]);

    expect(result.current.entries).toEqual([]);
  });
});
