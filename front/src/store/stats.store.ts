// commercial/src/stores/stats.store.ts

import { Stats, StatsState } from '@/types/chat';
import { create } from 'zustand';


export const useStatsStore = create<StatsState>((set) => ({
    stats: null,
    loading: false,
    error: null,

    setStats: (stats: Stats) => {
        set({ stats, loading: false, error: null });
    },

    updateStats: (updates: Partial<Stats>) => {
        set((state) => ({
            stats: state.stats ? { ...state.stats, ...updates } : null,
        }));
    },
}));