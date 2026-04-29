import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import ConversationFilters from '../ConversationFilters';
import type { Conversation } from '@/types/chat';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    chat_id: 'c1',
    clientName: 'Client',
    status: 'actif',
    last_poste_message_at: '2026-01-01',
    unreadCount: 0,
    poste_id: 'p1',
    poste: { name: 'Poste A' },
    window_slot: null,
    is_locked: false,
    ...overrides,
  } as Conversation;
}

const defaultProps = {
  conversations: [],
  totalUnread: 0,
  filterStatus: 'all',
  setFilterStatus: vi.fn(),
};

describe('ConversationFilters', () => {
  it('affiche les boutons Tous, Non lus, Nouveaux', () => {
    render(<ConversationFilters {...defaultProps} />);
    expect(screen.getByText(/Tous/)).toBeInTheDocument();
    expect(screen.getByText(/Non lus/)).toBeInTheDocument();
    expect(screen.getByText(/Nouveaux/)).toBeInTheDocument();
  });

  it('n\'affiche pas le bouton En attente si aucune conversation en attente', () => {
    render(<ConversationFilters {...defaultProps} />);
    expect(screen.queryByText(/En attente/)).not.toBeInTheDocument();
  });

  it('affiche le bouton En attente si des conversations sont en attente', () => {
    const convs = [makeConv({ status: 'attente' })];
    render(<ConversationFilters {...defaultProps} conversations={convs} />);
    expect(screen.getByText(/En attente/)).toBeInTheDocument();
  });

  it('appelle setFilterStatus avec "all" au clic sur Tous', () => {
    const setFilterStatus = vi.fn();
    render(<ConversationFilters {...defaultProps} setFilterStatus={setFilterStatus} />);
    fireEvent.click(screen.getByText(/Tous/));
    expect(setFilterStatus).toHaveBeenCalledWith('all');
  });

  it('appelle setFilterStatus avec "unread" au clic sur Non lus', () => {
    const setFilterStatus = vi.fn();
    render(<ConversationFilters {...defaultProps} setFilterStatus={setFilterStatus} />);
    fireEvent.click(screen.getByText(/Non lus/));
    expect(setFilterStatus).toHaveBeenCalledWith('unread');
  });

  it('appelle setFilterStatus avec "nouveau" au clic sur Nouveaux', () => {
    const setFilterStatus = vi.fn();
    render(<ConversationFilters {...defaultProps} setFilterStatus={setFilterStatus} />);
    fireEvent.click(screen.getByText(/Nouveaux/));
    expect(setFilterStatus).toHaveBeenCalledWith('nouveau');
  });

  it('affiche le compte correct de conversations', () => {
    const convs = [makeConv(), makeConv({ chat_id: 'c2' })];
    render(<ConversationFilters {...defaultProps} conversations={convs} totalUnread={3} />);
    expect(screen.getByText('Tous (2)')).toBeInTheDocument();
    expect(screen.getByText('Non lus (3)')).toBeInTheDocument();
  });

  it('affiche "Charge par poste" si plusieurs postes distincts', () => {
    const convs = [
      makeConv({ chat_id: 'c1', poste_id: 'p1', poste: { name: 'Poste A' } }),
      makeConv({ chat_id: 'c2', poste_id: 'p2', poste: { name: 'Poste B' } }),
    ];
    render(<ConversationFilters {...defaultProps} conversations={convs} />);
    expect(screen.getByText('Charge par poste')).toBeInTheDocument();
  });

  it('affiche le détail par poste au clic sur "Charge par poste"', () => {
    const convs = [
      makeConv({ chat_id: 'c1', poste_id: 'p1', poste: { name: 'Poste A' }, status: 'actif' }),
      makeConv({ chat_id: 'c2', poste_id: 'p2', poste: { name: 'Poste B' } }),
    ];
    render(<ConversationFilters {...defaultProps} conversations={convs} />);
    fireEvent.click(screen.getByText('Charge par poste'));
    expect(screen.getByText('Poste A')).toBeInTheDocument();
    expect(screen.getByText('Poste B')).toBeInTheDocument();
  });
});
