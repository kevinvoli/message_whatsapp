import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConversationOptionsMenu } from '../conversationOptionMenu';
import type { Conversation } from '@/types/chat';

vi.mock('../TransferModal', () => ({
  TransferModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="transfer-modal"><button onClick={onClose}>Fermer transfer</button></div>
  ),
}));

vi.mock('../LabelMenu', () => ({
  LabelMenu: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="label-menu"><button onClick={onClose}>Fermer labels</button></div>
  ),
}));

vi.mock('../MergeModal', () => ({
  MergeModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="merge-modal"><button onClick={onClose}>Fermer merge</button></div>
  ),
}));

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-uuid-1',
    chat_id: 'chat-1',
    clientName: 'Client',
    status: 'actif',
    ...overrides,
  } as unknown as Conversation;
}

const defaultProps = {
  conversation: makeConv(),
  onStatusChange: vi.fn(),
};

describe('ConversationOptionsMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('affiche le bouton options', () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    expect(screen.getByLabelText('Options de conversation')).toBeInTheDocument();
  });

  it('ouvre le menu au clic sur le bouton', () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    expect(screen.getByText('Changer le statut')).toBeInTheDocument();
  });

  it('affiche les 3 options de statut', () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    expect(screen.getByText('Marquer comme actif')).toBeInTheDocument();
    expect(screen.getByText('Mettre en attente')).toBeInTheDocument();
    expect(screen.getByText('Marquer comme converti')).toBeInTheDocument();
  });

  it('désactive le statut courant', () => {
    render(<ConversationOptionsMenu {...defaultProps} conversation={makeConv({ status: 'actif' })} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    const actifBtn = screen.getByText('Marquer comme actif').closest('button');
    expect(actifBtn).toBeDisabled();
  });

  it('appelle onStatusChange directement pour "attente"', () => {
    const onStatusChange = vi.fn();
    render(<ConversationOptionsMenu {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    fireEvent.click(screen.getByText('Mettre en attente'));
    expect(onStatusChange).toHaveBeenCalledWith('conv-uuid-1', 'attente');
  });

  it('affiche une confirmation avant de changer à "converti"', () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    fireEvent.click(screen.getByText('Marquer comme converti'));
    expect(defaultProps.onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirmer/i)).toBeInTheDocument();
  });

  it('confirme le changement vers "converti"', () => {
    const onStatusChange = vi.fn();
    render(<ConversationOptionsMenu {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    fireEvent.click(screen.getByText('Marquer comme converti'));
    fireEvent.click(screen.getByText(/Confirmer/i));
    expect(onStatusChange).toHaveBeenCalledWith('conv-uuid-1', 'converti');
  });

  it('annule la confirmation', () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    fireEvent.click(screen.getByText('Marquer comme converti'));
    fireEvent.click(screen.getByText(/Annuler/i));
    expect(defaultProps.onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Confirmer/i)).not.toBeInTheDocument();
  });

  it('ferme le menu au clic sur l\'overlay', () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    expect(screen.getByText('Changer le statut')).toBeInTheDocument();
    const overlay = document.querySelector('.fixed.inset-0');
    if (overlay) fireEvent.click(overlay);
    expect(screen.queryByText('Changer le statut')).not.toBeInTheDocument();
  });

  it('affiche la bannière dossier bloqué sur événement custom', async () => {
    render(<ConversationOptionsMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Options de conversation'));
    window.dispatchEvent(new CustomEvent('dossier:close-blocked', { detail: { chatId: 'chat-1' } }));
    await waitFor(() => {
      expect(screen.getByText(/Dossier client incomplet/)).toBeInTheDocument();
    });
  });
});
