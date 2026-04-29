import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Conversation } from '@/types/chat';

vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn(() => ({
    updateConversation: vi.fn(),
    changeConversationStatus: vi.fn(),
  })),
}));

vi.mock('@/store/contactStore', () => ({
  useContactStore: vi.fn(() => ({ selectContactByChatId: vi.fn() })),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-component" />,
}));

vi.mock('../conversation/conversationOptionMenu', () => ({
  ConversationOptionsMenu: () => <div data-testid="options-menu" />,
}));

vi.mock('../ui/ProviderBadge', () => ({
  ProviderBadge: ({ chatId }: { chatId: string }) => <span data-testid="provider-badge">{chatId}</span>,
  getProviderFromChatId: vi.fn(() => 'whatsapp'),
}));

vi.mock('@/lib/utils', () => ({
  getStatusBadge: vi.fn(() => 'bg-green-100 text-green-700'),
}));

global.fetch = vi.fn();

import ChatHeader from '../ChatHeader';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    chat_id: '33612345678@s.whatsapp.net',
    clientName: 'Jean Dupont',
    clientPhone: '0612345678',
    status: 'actif',
    unreadCount: 0,
    window_slot: null,
    is_locked: false,
    first_response_deadline_at: null,
    readonly: false,
    validation_state: [],
    ...overrides,
  } as unknown as Conversation;
}

const defaultProps = {
  currentConv: makeConv(),
  totalMessages: 42,
};

describe('ChatHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: 'Résumé test',
        sentiment: 'positive',
        keyPoints: ['Point 1'],
        suggestedActions: ['Action 1'],
      }),
    } as Response);
  });

  it('affiche le nom du client', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
  });

  it('affiche le numéro de téléphone', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByText('0612345678')).toBeInTheDocument();
  });

  it('affiche le compteur de messages', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByText('42 messages')).toBeInTheDocument();
  });

  it('affiche le menu options', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByTestId('options-menu')).toBeInTheDocument();
  });

  it('affiche le bouton Rapport', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByTitle('Rapport GICOP')).toBeInTheDocument();
  });

  it('affiche le bouton Catalogue', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByTitle('Catalogue multimédia')).toBeInTheDocument();
  });

  it('affiche le bouton Résumé IA', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByTitle('Résumé IA de la conversation')).toBeInTheDocument();
  });

  it('appelle onToggleReport au clic sur Rapport', () => {
    const onToggleReport = vi.fn();
    render(<ChatHeader {...defaultProps} onToggleReport={onToggleReport} />);
    fireEvent.click(screen.getByTitle('Rapport GICOP'));
    expect(onToggleReport).toHaveBeenCalledOnce();
  });

  it('affiche le badge "Lecture seule" si readonly=true', () => {
    render(<ChatHeader {...defaultProps} currentConv={makeConv({ readonly: true })} />);
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
  });

  it('n\'affiche pas "Lecture seule" si readonly=false', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.queryByText('Lecture seule')).not.toBeInTheDocument();
  });

  it('ouvre le modal résumé IA au clic sur Résumé IA', async () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Résumé IA de la conversation'));
    expect(await screen.findByText('Résumé IA')).toBeInTheDocument();
  });

  it('ferme le modal résumé au clic sur le bouton X', async () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Résumé IA de la conversation'));
    await screen.findByText('Résumé IA');
    fireEvent.click(screen.getByRole('button', { name: '' }));
  });

  it('affiche le résumé IA après chargement', async () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Résumé IA de la conversation'));
    expect(await screen.findByText('Résumé test')).toBeInTheDocument();
    expect(screen.getByText('Point 1')).toBeInTheDocument();
    expect(screen.getByText('Action 1')).toBeInTheDocument();
  });

  it('affiche le sentiment Positif', async () => {
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Résumé IA de la conversation'));
    expect(await screen.findByText('Positif')).toBeInTheDocument();
  });

  it('affiche "Impossible de générer" si fetch échoue', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
    render(<ChatHeader {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Résumé IA de la conversation'));
    expect(await screen.findByText('Impossible de générer le résumé.')).toBeInTheDocument();
  });

  it('affiche la barre de validation si validation_state présent', () => {
    const conv = makeConv({
      validation_state: [
        { type: 'result_set', label: 'Rapport', validated: true, required: true, validatedAt: null },
        { type: 'call_confirmed', label: 'Appel', validated: false, required: false, validatedAt: null },
      ],
    } as never);
    render(<ChatHeader {...defaultProps} currentConv={conv} />);
    expect(screen.getByText('Validation :')).toBeInTheDocument();
    expect(screen.getByText('Rapport')).toBeInTheDocument();
    expect(screen.getByText('Appel')).toBeInTheDocument();
  });

  it('n\'affiche pas la barre de validation si validation_state vide', () => {
    render(<ChatHeader {...defaultProps} />);
    expect(screen.queryByText('Validation :')).not.toBeInTheDocument();
  });

  it('appelle onOpenContact via selectContactByChatId au clic sur le nom', () => {
    const onOpenContact = vi.fn();
    render(<ChatHeader {...defaultProps} onOpenContact={onOpenContact} />);
    fireEvent.click(screen.getByText('Jean Dupont'));
    expect(onOpenContact).toHaveBeenCalledOnce();
  });

  it('affiche le catalogue au clic sur Catalogue', () => {
    render(<ChatHeader {...defaultProps} onCatalogSend={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Catalogue multimédia'));
    expect(screen.getByTestId('dynamic-component')).toBeInTheDocument();
  });

  it('le bouton Rapport a le style actif si showReportPanel=true', () => {
    render(<ChatHeader {...defaultProps} showReportPanel onToggleReport={vi.fn()} />);
    const btn = screen.getByTitle('Rapport GICOP');
    expect(btn).toHaveClass('bg-blue-600');
  });

  it('affiche le SLA countdown si first_response_deadline_at présent', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const conv = makeConv({ first_response_deadline_at: future });
    render(<ChatHeader {...defaultProps} currentConv={conv} />);
    expect(screen.getByText(/m \d{2}s/)).toBeInTheDocument();
  });

  it('affiche "SLA depasse" si deadline passée', async () => {
    vi.useFakeTimers();
    const past = new Date(Date.now() - 1000).toISOString();
    const conv = makeConv({ first_response_deadline_at: past });
    render(<ChatHeader {...defaultProps} currentConv={conv} />);
    await waitFor(() => {
      expect(screen.getByText('SLA depasse')).toBeInTheDocument();
    });
    vi.useRealTimers();
  });
});
