import { beforeEach, describe, expect, it } from 'vitest';
import { useStatsStore } from '@/store/stats.store';
import type { Stats } from '@/types/chat';

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    messagesTraites: 10,
    tauxReponse: 80,
    tempsReponse: '2m',
    conversationsActives: 5,
    conversionsJour: 2,
    satisfaction: 90,
    objectifJour: 100,
    ca: 5000,
    nouveauxContacts: 3,
    relances: 1,
    rdvPris: 4,
    tauxConversion: 25,
    messagesMoyen: 50,
    horairesPic: '14h-16h',
    sourcesPrincipales: [],
    performanceHebdo: [],
    ...overrides,
  };
}

describe('useStatsStore', () => {
  beforeEach(() => {
    useStatsStore.setState({ stats: null, loading: false, error: null });
  });

  it('possède un état initial null', () => {
    const state = useStatsStore.getState();
    expect(state.stats).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('setStats remplace les stats et reset loading + error', () => {
    useStatsStore.setState({ loading: true, error: 'old error' });
    const stats = makeStats({ messagesTraites: 42 });
    useStatsStore.getState().setStats(stats);
    const state = useStatsStore.getState();
    expect(state.stats?.messagesTraites).toBe(42);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('updateStats fusionne les champs partiels avec les stats existantes', () => {
    useStatsStore.getState().setStats(makeStats({ messagesTraites: 10, ca: 1000 }));
    useStatsStore.getState().updateStats({ ca: 2000 });
    const state = useStatsStore.getState();
    expect(state.stats?.ca).toBe(2000);
    expect(state.stats?.messagesTraites).toBe(10);
  });

  it('updateStats laisse stats à null si les stats sont null', () => {
    useStatsStore.getState().updateStats({ ca: 5000 });
    expect(useStatsStore.getState().stats).toBeNull();
  });
});
