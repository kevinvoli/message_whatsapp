import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateFollowUpModal from './CreateFollowUpModal';
import * as followUpApi from '@/lib/followUpApi';

vi.mock('@/lib/followUpApi', () => ({
  createFollowUp: vi.fn(),
}));

const onClose = vi.fn();
const onDone  = vi.fn();

function renderModal(props: Partial<Parameters<typeof CreateFollowUpModal>[0]> = {}) {
  return render(
    <CreateFollowUpModal onClose={onClose} onDone={onDone} {...props} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateFollowUpModal', () => {
  it('affiche le titre et les champs du formulaire', () => {
    renderModal();
    expect(screen.getByText('Nouvelle relance')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument(); // notes textarea
  });

  it('pré-sélectionne le defaultType si fourni', () => {
    renderModal({ defaultType: 'relance_fidelisation' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('relance_fidelisation');
  });

  it('affiche une erreur si la date est absente au submit', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Planifier'));
    expect(await screen.findByText(/Veuillez choisir une date/i)).toBeInTheDocument();
    expect(followUpApi.createFollowUp).not.toHaveBeenCalled();
  });

  it('appelle createFollowUp puis onDone/onClose en cas de succès', async () => {
    vi.mocked(followUpApi.createFollowUp).mockResolvedValueOnce({
      id: 'fu-1', type: 'rappel', status: 'planifiee', scheduled_at: '2026-05-01T09:00:00Z',
    } as any);

    const { container } = renderModal({ contactId: 'contact-1' });

    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-05-01T09:00' } });
    fireEvent.click(screen.getByText('Planifier'));

    await waitFor(() => {
      expect(followUpApi.createFollowUp).toHaveBeenCalledWith(
        expect.objectContaining({ contact_id: 'contact-1', type: 'rappel' }),
      );
      expect(onDone).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("affiche un message d'erreur si l'API échoue", async () => {
    vi.mocked(followUpApi.createFollowUp).mockRejectedValueOnce(new Error('API error'));

    const { container } = renderModal();
    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-05-01T09:00' } });
    fireEvent.click(screen.getByText('Planifier'));

    expect(await screen.findByText(/Erreur lors de la création/i)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('appelle onClose au clic sur Annuler', () => {
    renderModal();
    fireEvent.click(screen.getByText('Annuler'));
    expect(onClose).toHaveBeenCalled();
  });
});
