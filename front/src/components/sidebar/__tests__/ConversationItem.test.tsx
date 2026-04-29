import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ConversationItem from '../ConversationItem';
import type { Conversation } from '@/types/chat';

vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn(),
}));

vi.mock('@/lib/dateUtils', () => ({
  formatConversationTime: vi.fn(() => '14:30'),
}));

import { useChatStore } from '@/store/chatStore';

const mockDefaultStore = () => {
  vi.mocked(useChatStore).mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ affinityChats: new Set(), obligationStatus: null, blockProgress: { submitted: 0, total: 0 } }),
  );
};

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    chat_id: '33612345678@s.whatsapp.net',
    clientName: 'Jean Dupont',
    clientPhone: '0612345678',
    status: 'actif',
    unreadCount: 0,
    last_poste_message_at: null,
    last_client_message_at: null,
    window_slot: null,
    window_status: null,
    is_locked: false,
    priority: null,
    lastMessage: null,
    report_submission_status: null,
    tags: [],
    poste_id: 'p1',
    poste: null,
    ...overrides,
  } as unknown as Conversation;
}

const defaultProps = {
  conversation: makeConv(),
  isSelected: false,
  onClick: vi.fn(),
};

describe('ConversationItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultStore();
  });

  it('affiche le nom du client', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
  });

  it('affiche le numéro de téléphone', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText('0612345678')).toBeInTheDocument();
  });

  it('affiche "Aucun message" si pas de lastMessage', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText('Aucun message pour le moment')).toBeInTheDocument();
  });

  it('affiche le texte du dernier message', () => {
    const conv = makeConv({ lastMessage: { text: 'Bonjour!', timestamp: '2026-01-01T14:30:00Z' } as never });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('Bonjour!')).toBeInTheDocument();
  });

  it('affiche le badge non-lu si unreadCount > 0', () => {
    const conv = makeConv({ unreadCount: 5 });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('n\'affiche pas le badge non-lu si unreadCount = 0', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('appelle onClick au clic', () => {
    const onClick = vi.fn();
    render(<ConversationItem {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByText('Jean Dupont'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('n\'appelle pas onClick si conversation verrouillée', () => {
    const onClick = vi.fn();
    const conv = makeConv({ is_locked: true });
    render(<ConversationItem {...defaultProps} conversation={conv} onClick={onClick} />);
    fireEvent.click(screen.getByText('Jean Dupont'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('affiche badge "Verrouillée" si is_locked=true', () => {
    const conv = makeConv({ is_locked: true });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('Verrouillée')).toBeInTheDocument();
  });

  it('affiche badge "Fidèle" si contact en affinité', () => {
    vi.mocked(useChatStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ affinityChats: new Set(['33612345678@s.whatsapp.net']), obligationStatus: null, blockProgress: { submitted: 0, total: 0 } }),
    );
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText('Fidèle')).toBeInTheDocument();
  });

  it('affiche badge "Rapport GICOP" si report_submission_status=sent', () => {
    const conv = makeConv({ report_submission_status: 'sent' });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('Rapport GICOP')).toBeInTheDocument();
  });

  it('affiche badge "Rapport KO" si report_submission_status=failed', () => {
    const conv = makeConv({ report_submission_status: 'failed' });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('Rapport KO')).toBeInTheDocument();
  });

  it('affiche le slot de fenêtre si window_slot non null', () => {
    const conv = makeConv({ window_slot: 3 });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('affiche l\'indicateur de frappe si isTyping=true', () => {
    render(<ConversationItem {...defaultProps} isTyping />);
    expect(screen.getByText('écriture')).toBeInTheDocument();
  });

  it('en mode bulk, affiche une checkbox', () => {
    render(<ConversationItem {...defaultProps} bulkMode onToggleCheck={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('la checkbox est cochée si isChecked=true', () => {
    render(<ConversationItem {...defaultProps} bulkMode isChecked onToggleCheck={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('affiche les tags si présents', () => {
    const conv = makeConv({ tags: ['VIP', 'Urgent'] });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('affiche le badge provider WhatsApp', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
  });

  it('affiche le badge provider Messenger pour @messenger', () => {
    const conv = makeConv({ chat_id: '123@messenger' });
    render(<ConversationItem {...defaultProps} conversation={conv} />);
    expect(screen.getByText('Messenger')).toBeInTheDocument();
  });
});
