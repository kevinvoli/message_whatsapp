import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import FollowUpPanel from './FollowUpPanel';
import * as followUpApi from '@/lib/followUpApi';

vi.mock('@/lib/followUpApi', () => ({
  getMyFollowUps:   vi.fn(),
  getDueToday:      vi.fn(),
  completeFollowUp: vi.fn(),
  cancelFollowUp:   vi.fn(),
}));

// Mock qui simule une création réussie (appelle onDone puis onClose)
vi.mock('./CreateFollowUpModal', () => ({
  default: ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => (
    <div data-testid="create-modal">
      <button onClick={() => { onDone(); onClose(); }}>Confirmer création</button>
      <button onClick={onClose}>Fermer modal</button>
    </div>
  ),
}));

function makeFollowUp(overrides = {}): import('@/types/chat').FollowUp {
  return {
    id: 'fu-1',
    type: 'rappel',
    status: 'planifiee',
    scheduled_at: new Date(Date.now() + 86400_000).toISOString(),
    notes: null,
    commercial_id: 'commercial-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(followUpApi.getDueToday).mockResolvedValue([]);
  vi.mocked(followUpApi.getMyFollowUps).mockResolvedValue({ data: [], total: 0 });
});

describe('FollowUpPanel', () => {
  it('affiche le titre et le bouton Nouvelle', async () => {
    render(<FollowUpPanel />);
    expect(screen.getByText('Mes relances')).toBeInTheDocument();
    expect(screen.getByTitle('Nouvelle relance')).toBeInTheDocument();
  });

  it('affiche "Aucune relance" quand la liste est vide', async () => {
    render(<FollowUpPanel />);
    expect(await screen.findByText('Aucune relance')).toBeInTheDocument();
  });

  it('affiche les relances chargées', async () => {
    vi.mocked(followUpApi.getMyFollowUps).mockResolvedValue({
      data: [makeFollowUp({ notes: 'Ma note test' })],
      total: 1,
    });

    render(<FollowUpPanel />);
    expect(await screen.findByText('Ma note test')).toBeInTheDocument();
  });

  it('ouvre le modal de création au clic sur Nouvelle', async () => {
    render(<FollowUpPanel />);
    await screen.findByText('Mes relances');
    fireEvent.click(screen.getByTitle('Nouvelle relance'));
    expect(screen.getByTestId('create-modal')).toBeInTheDocument();
  });

  it('recharge la liste après une création réussie dans le modal', async () => {
    render(<FollowUpPanel />);
    await screen.findByText('Mes relances');

    fireEvent.click(screen.getByTitle('Nouvelle relance'));
    fireEvent.click(screen.getByText('Confirmer création'));

    await waitFor(() => {
      expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument();
    });
    // getMyFollowUps : 1 fois au mount + 1 fois après onDone
    expect(followUpApi.getMyFollowUps).toHaveBeenCalledTimes(2);
  });

  it('ferme le modal sans recharger si annulé sans création', async () => {
    render(<FollowUpPanel />);
    await screen.findByText('Mes relances');

    fireEvent.click(screen.getByTitle('Nouvelle relance'));
    fireEvent.click(screen.getByText('Fermer modal'));

    await waitFor(() => {
      expect(screen.queryByTestId('create-modal')).not.toBeInTheDocument();
    });
    // Seulement le chargement initial
    expect(followUpApi.getMyFollowUps).toHaveBeenCalledTimes(1);
  });

  it("affiche la section 'À traiter aujourd'hui' si des relances sont dues", async () => {
    vi.mocked(followUpApi.getDueToday).mockResolvedValue([
      makeFollowUp({ scheduled_at: new Date(Date.now() - 3600_000).toISOString() }),
    ]);

    render(<FollowUpPanel />);
    expect(await screen.findByText(/À traiter aujourd'hui/i)).toBeInTheDocument();
  });

  it('recharge la liste au clic sur Rafraîchir', async () => {
    render(<FollowUpPanel />);
    await screen.findByText('Mes relances');
    fireEvent.click(screen.getByTitle('Rafraîchir'));
    await waitFor(() => {
      expect(followUpApi.getMyFollowUps).toHaveBeenCalledTimes(2);
    });
  });
});
