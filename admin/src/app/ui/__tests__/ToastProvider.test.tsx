import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ToastProvider, useToast } from '../ToastProvider';

function ToastTrigger({ type = 'success', message = 'Test toast', duration }: {
  type?: 'success' | 'error' | 'info';
  message?: string;
  duration?: number;
}) {
  const { addToast } = useToast();
  return (
    <button onClick={() => addToast({ type, message, durationMs: duration })}>
      Ajouter toast
    </button>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('useToast throw si utilisé hors ToastProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ToastTrigger />)).toThrow('useToast must be used within ToastProvider');
    consoleSpy.mockRestore();
  });

  it('affiche un toast success après addToast', () => {
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    fireEvent.click(screen.getByText('Ajouter toast'));
    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });

  it('affiche un toast error avec les bonnes classes', () => {
    render(<ToastProvider><ToastTrigger type="error" message="Erreur!" /></ToastProvider>);
    fireEvent.click(screen.getByText('Ajouter toast'));
    const toast = screen.getByText('Erreur!').closest('div[class*="border"]');
    expect(toast).toHaveClass('border-red-200');
  });

  it('affiche un toast info avec les bonnes classes', () => {
    render(<ToastProvider><ToastTrigger type="info" message="Info!" /></ToastProvider>);
    fireEvent.click(screen.getByText('Ajouter toast'));
    const toast = screen.getByText('Info!').closest('div[class*="border"]');
    expect(toast).toHaveClass('border-blue-200');
  });

  it('supprime le toast après expiration du timer', async () => {
    render(<ToastProvider><ToastTrigger duration={1000} /></ToastProvider>);
    fireEvent.click(screen.getByText('Ajouter toast'));
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('supprime le toast manuellement au clic sur Fermer', () => {
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    fireEvent.click(screen.getByText('Ajouter toast'));
    fireEvent.click(screen.getByText('Fermer'));
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('empile plusieurs toasts', () => {
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    fireEvent.click(screen.getByText('Ajouter toast'));
    fireEvent.click(screen.getByText('Ajouter toast'));
    expect(screen.getAllByText('Test toast')).toHaveLength(2);
  });
});
