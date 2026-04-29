import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockGetRanking = vi.fn();
const mockGetMyProgress = vi.fn();

vi.mock('@/lib/targetsApi', () => ({
  getRanking: mockGetRanking,
  getMyProgress: mockGetMyProgress,
}));

vi.mock('@/contexts/AuthProvider', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1', name: 'Jean' } })),
}));

const mockTargetProgress = null;
const mockSetTargetProgress = vi.fn();

vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ targetProgress: mockTargetProgress, setTargetProgress: mockSetTargetProgress }),
  ),
}));

import DashboardPanel from '../DashboardPanel';

const mockRanking = [
  { commercial_id: 'user-1', name: 'Jean', orders: 15, conversations: 30, calls: 10, follow_ups: 5, reports_submitted: 12 },
  { commercial_id: 'user-2', name: 'Marie', orders: 10, conversations: 20, calls: 8, follow_ups: 3, reports_submitted: 8 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRanking.mockResolvedValue(mockRanking);
  mockGetMyProgress.mockResolvedValue([]);
});

describe('DashboardPanel', () => {
  it('affiche le titre "Tableau de bord"', async () => {
    render(<DashboardPanel />);
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument();
  });

  it('charge et affiche le classement du mois', async () => {
    render(<DashboardPanel />);
    expect(await screen.findByText('Jean')).toBeInTheDocument();
    expect(screen.getByText('Marie')).toBeInTheDocument();
  });

  it('affiche l\'erreur si le chargement échoue', async () => {
    mockGetRanking.mockRejectedValue(new Error('network error'));
    render(<DashboardPanel />);
    expect(await screen.findByText(/Impossible de charger/)).toBeInTheDocument();
  });

  it('affiche le bouton rafraîchir', async () => {
    render(<DashboardPanel />);
    expect(await screen.findByTitle('Rafraîchir')).toBeInTheDocument();
  });

  it('recharge au clic sur rafraîchir', async () => {
    render(<DashboardPanel />);
    await screen.findByText('Tableau de bord');
    fireEvent.click(screen.getByTitle('Rafraîchir'));
    await waitFor(() => expect(mockGetRanking).toHaveBeenCalledTimes(4));
  });

  it('appelle getMyProgress si targetProgress est null', async () => {
    render(<DashboardPanel />);
    await screen.findByText('Tableau de bord');
    expect(mockGetMyProgress).toHaveBeenCalledOnce();
  });

  it('affiche le section classement aujourd\'hui', async () => {
    render(<DashboardPanel />);
    expect(await screen.findByText(/aujourd'hui/i)).toBeInTheDocument();
  });
});
