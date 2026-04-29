import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import BlockProgressBar from '../BlockProgressBar';

vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn(),
}));

import { useChatStore } from '@/store/chatStore';

const mockStore = (blockProgress: { submitted: number; total: number } | null, windowRotating = false) => {
  vi.mocked(useChatStore).mockImplementation((selector: (s: unknown) => unknown) => {
    const state = { blockProgress, windowRotating };
    return selector(state);
  });
};

describe('BlockProgressBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ne rend rien si blockProgress est null', () => {
    mockStore(null);
    const { container } = render(<BlockProgressBar />);
    expect(container.firstChild).toBeNull();
  });

  it('ne rend rien si total est 0', () => {
    mockStore({ submitted: 0, total: 0 });
    const { container } = render(<BlockProgressBar />);
    expect(container.firstChild).toBeNull();
  });

  it('affiche la barre de rotation si windowRotating=true', () => {
    mockStore({ submitted: 2, total: 5 }, true);
    render(<BlockProgressBar />);
    expect(screen.getByText('Rotation du bloc en cours…')).toBeInTheDocument();
  });

  it('affiche le compteur submitted/total', () => {
    mockStore({ submitted: 3, total: 10 });
    render(<BlockProgressBar />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText('Bloc en cours')).toBeInTheDocument();
  });

  it('affiche "Toutes validées" quand submitted >= total', () => {
    mockStore({ submitted: 5, total: 5 });
    render(<BlockProgressBar />);
    expect(screen.getByText(/Toutes validées/)).toBeInTheDocument();
    expect(screen.getByText('5 / 5')).toBeInTheDocument();
  });

  it('barre de progression à 50% quand submitted=5 total=10', () => {
    mockStore({ submitted: 5, total: 10 });
    render(<BlockProgressBar />);
    const bar = document.querySelector('[style*="width: 50%"]');
    expect(bar).toBeInTheDocument();
  });
});
