import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CallObligationsView from './CallObligationsView';
import { getSystemConfigs, updateSystemConfig } from '@/app/lib/api/system-config.api';

vi.mock('@/app/lib/api/system-config.api', () => ({
  getSystemConfigs: vi.fn(),
  updateSystemConfig: vi.fn(),
}));

vi.mock('@/app/lib/dateUtils', () => ({
  formatDate: vi.fn().mockReturnValue('28/04/2026'),
}));

const POSTES = [{ id: 'p1', name: 'Poste Test' }];

const makeObligation = () => ({
  batchId: 'b1',
  batchNumber: 3,
  status: 'pending' as const,
  annulee:      { done: 3, required: 5 },
  livree:       { done: 5, required: 5 },
  sansCommande: { done: 1, required: 5 },
  qualityCheckPassed: false,
  readyForRotation:   false,
});

interface FetchOpts {
  obligation?: object | null;
  syncStatus?: object;
  rejections?: object[];
  taskDetail?: object;
}

function makeFetch(opts: FetchOpts = {}) {
  const {
    obligation   = null,
    syncStatus   = { db2: { dbAvailable: true, lastSyncAt: null, processedCount: 0 }, syncLog: {} },
    rejections   = [],
    taskDetail   = { batchId: null, batchNumber: null, tasks: [] },
  } = opts;

  return vi.fn().mockImplementation((url: string) => {
    if (url.endsWith('/tasks')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(taskDetail) });
    }
    if (url.includes('/quality-check/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ qualityCheckPassed: true }) });
    }
    if (url.includes('/call-obligations/poste/')) {
      return Promise.resolve({ ok: obligation !== null, json: () => Promise.resolve(obligation) });
    }
    if (url.includes('/admin/order-sync/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(syncStatus) });
    }
    if (url.includes('/admin/order-sync/failed')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(rejections) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  });
}

describe('CallObligationsView — OBL-025', () => {
  beforeEach(() => {
    vi.mocked(getSystemConfigs).mockResolvedValue([
      { configKey: 'FF_CALL_OBLIGATIONS_ENABLED', configValue: 'false' } as never,
    ]);
    vi.mocked(updateSystemConfig).mockResolvedValue({} as never);
    vi.stubGlobal('fetch', makeFetch());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('affiche le statut Désactivé et la bannière d\'avertissement', async () => {
    render(<CallObligationsView postes={POSTES} />);

    // La bannière amber n'apparaît qu'après que le flag est chargé (enabled !== null)
    await waitFor(() =>
      expect(screen.getByText(/Les obligations d'appels sont désactivées/)).toBeTruthy(),
    );
    // Le bouton toggle indique "Désactivé" (peut apparaître aussi dans la cellule tableau)
    const toggleBtn = screen.getByTitle('Cliquez pour activer');
    expect(toggleBtn.textContent).toContain('Désactivé');
  });

  it('affiche le statut Activé quand le flag est true', async () => {
    vi.mocked(getSystemConfigs).mockResolvedValue([
      { configKey: 'FF_CALL_OBLIGATIONS_ENABLED', configValue: 'true' } as never,
    ]);
    render(<CallObligationsView postes={POSTES} />);

    await waitFor(() => expect(screen.getByText('Activé')).toBeTruthy());
    expect(screen.queryByText(/obligations d'appels sont désactivées/)).toBeNull();
  });

  it('ouvre la modale de confirmation d\'activation quand désactivé', async () => {
    render(<CallObligationsView postes={POSTES} />);

    const btn = screen.getByTitle('Cliquez pour activer');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    expect(screen.getByText('Activer les obligations ?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activer' })).toBeTruthy();
  });

  it('ouvre la modale de confirmation de désactivation quand activé', async () => {
    vi.mocked(getSystemConfigs).mockResolvedValue([
      { configKey: 'FF_CALL_OBLIGATIONS_ENABLED', configValue: 'true' } as never,
    ]);
    render(<CallObligationsView postes={POSTES} />);

    const btn = await screen.findByTitle('Cliquez pour désactiver');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    expect(screen.getByText('Désactiver les obligations ?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeTruthy();
  });

  it('affiche la bannière DB2 indisponible avec le compteur', async () => {
    vi.mocked(getSystemConfigs).mockResolvedValue([
      { configKey: 'FF_CALL_OBLIGATIONS_ENABLED', configValue: 'true' } as never,
    ]);
    vi.stubGlobal('fetch', makeFetch({
      syncStatus: { db2: { dbAvailable: false, lastSyncAt: null, processedCount: 42 }, syncLog: {} },
    }));

    render(<CallObligationsView postes={POSTES} />);

    await waitFor(() => expect(screen.getByText('DB2 indisponible')).toBeTruthy());
    expect(screen.getByText('42 appels traités')).toBeTruthy();
  });

  it('affiche le détail des tâches après clic sur le chevron', async () => {
    const obligation = makeObligation();
    const taskDetail = {
      batchId: 'b1',
      batchNumber: 3,
      tasks: [
        {
          id: 't1',
          category: 'COMMANDE_ANNULEE',
          status: 'DONE',
          clientPhone: '+22500000001',
          callEventId: 'c1',
          durationSeconds: 120,
          completedAt: null,
          createdAt: '2026-04-28T10:00:00Z',
        },
        {
          id: 't2',
          category: 'JAMAIS_COMMANDE',
          status: 'PENDING',
          clientPhone: '+22500000002',
          callEventId: null,
          durationSeconds: null,
          completedAt: null,
          createdAt: '2026-04-28T10:00:00Z',
        },
      ],
    };
    vi.stubGlobal('fetch', makeFetch({ obligation, taskDetail }));

    const { container } = render(<CallObligationsView postes={POSTES} />);

    // Attendre que le batch s'affiche dans le tableau
    await waitFor(() => expect(screen.getByText('#3')).toBeTruthy());

    // Le bouton chevron est le premier bouton dans la première cellule de tbody
    const chevron = container.querySelector('tbody td:first-child button') as HTMLButtonElement;
    expect(chevron).toBeTruthy();
    fireEvent.click(chevron);

    // Les sous-catégories de tâches doivent apparaître
    await waitFor(() => expect(screen.getByText('Annulée')).toBeTruthy());
    // Le span contient "✓ +22500000001" — on cherche par regex
    expect(screen.getByText(/\+22500000001/)).toBeTruthy();
    expect(screen.getByText('2min')).toBeTruthy();
    expect(screen.getByText('Sans cmd')).toBeTruthy();
  });
});
