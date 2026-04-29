import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockGetToday = vi.fn();
const mockLogEvent = vi.fn();

vi.mock('@/lib/workAttendanceApi', () => ({
  getToday: mockGetToday,
  logEvent: mockLogEvent,
  EVENT_LABELS: {
    arrivee: 'Arrivée',
    depart_pause: 'Départ pause',
    retour_pause: 'Retour de pause',
    depart_maison: 'Départ maison',
  },
  STATUS_LABELS: {
    not_clocked_in: 'Non pointé',
    working: 'En service',
    on_break: 'En pause',
    done: 'Journée terminée',
  },
  AttendanceStatus: {},
  AttendanceEventType: {},
}));

import AttendancePanel from '../AttendancePanel';

const baseSummary = {
  workDate: '2026-04-29',
  status: 'not_clocked_in',
  minutesWorked: 0,
  minutesOnBreak: 0,
  events: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToday.mockResolvedValue(baseSummary);
  mockLogEvent.mockResolvedValue({});
});

describe('AttendancePanel', () => {
  it('affiche le titre Pointage', async () => {
    render(<AttendancePanel />);
    expect(await screen.findByText('Pointage')).toBeInTheDocument();
  });

  it('affiche le statut "Non pointé" par défaut', async () => {
    render(<AttendancePanel />);
    expect(await screen.findByText('Non pointé')).toBeInTheDocument();
  });

  it('affiche le bouton Arrivée quand non pointé', async () => {
    render(<AttendancePanel />);
    expect(await screen.findByText('Arrivée')).toBeInTheDocument();
  });

  it('affiche "En service" quand status=working', async () => {
    mockGetToday.mockResolvedValue({ ...baseSummary, status: 'working', minutesWorked: 90 });
    render(<AttendancePanel />);
    expect(await screen.findByText('En service')).toBeInTheDocument();
  });

  it('affiche le temps travaillé', async () => {
    mockGetToday.mockResolvedValue({ ...baseSummary, status: 'working', minutesWorked: 90 });
    render(<AttendancePanel />);
    expect(await screen.findByText(/1h30 travaillé/)).toBeInTheDocument();
  });

  it('affiche les boutons Départ pause et Départ maison quand working', async () => {
    mockGetToday.mockResolvedValue({ ...baseSummary, status: 'working' });
    render(<AttendancePanel />);
    expect(await screen.findByText('Départ pause')).toBeInTheDocument();
    expect(await screen.findByText('Départ maison')).toBeInTheDocument();
  });

  it('affiche le bouton Retour de pause quand on_break', async () => {
    mockGetToday.mockResolvedValue({ ...baseSummary, status: 'on_break' });
    render(<AttendancePanel />);
    expect(await screen.findByText('Retour de pause')).toBeInTheDocument();
  });

  it('n\'affiche aucun bouton d\'action quand done', async () => {
    mockGetToday.mockResolvedValue({ ...baseSummary, status: 'done' });
    render(<AttendancePanel />);
    expect(await screen.findByText('Journée terminée')).toBeInTheDocument();
    expect(await screen.findByText('Bonne journée !')).toBeInTheDocument();
    expect(screen.queryByText('Arrivée')).not.toBeInTheDocument();
  });

  it('appelle logEvent et recharge au clic sur Arrivée', async () => {
    render(<AttendancePanel />);
    const btn = await screen.findByText('Arrivée');
    fireEvent.click(btn);
    await waitFor(() => expect(mockLogEvent).toHaveBeenCalledWith('arrivee'));
    await waitFor(() => expect(mockGetToday).toHaveBeenCalledTimes(2));
  });

  it('affiche les événements du jour', async () => {
    mockGetToday.mockResolvedValue({
      ...baseSummary,
      status: 'working',
      events: [
        { id: 'e1', eventType: 'arrivee', eventAt: '2026-04-29T08:00:00Z', note: null },
      ],
    });
    render(<AttendancePanel />);
    expect(await screen.findByText('Événements du jour')).toBeInTheDocument();
    expect(screen.getByText('Arrivée')).toBeInTheDocument();
  });

  it('recharge au clic sur le bouton rafraîchir', async () => {
    render(<AttendancePanel />);
    await screen.findByText('Pointage');
    const refreshBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(refreshBtn);
    await waitFor(() => expect(mockGetToday).toHaveBeenCalledTimes(2));
  });

  it('affiche la pause dans le temps travaillé', async () => {
    mockGetToday.mockResolvedValue({ ...baseSummary, status: 'working', minutesWorked: 120, minutesOnBreak: 30 });
    render(<AttendancePanel />);
    expect(await screen.findByText(/30min de pause/)).toBeInTheDocument();
  });
});
