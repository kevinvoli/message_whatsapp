import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProviderBadge, getProviderFromChatId, getAvatarColors } from '../ProviderBadge';

describe('getProviderFromChatId', () => {
  it('retourne "whatsapp" pour null', () => expect(getProviderFromChatId(null)).toBe('whatsapp'));
  it('retourne "whatsapp" pour undefined', () => expect(getProviderFromChatId(undefined)).toBe('whatsapp'));
  it('retourne "whatsapp" pour un id normal', () => expect(getProviderFromChatId('33612345678')).toBe('whatsapp'));
  it('retourne "messenger" pour @messenger', () => expect(getProviderFromChatId('123@messenger')).toBe('messenger'));
  it('retourne "instagram" pour @instagram', () => expect(getProviderFromChatId('456@instagram')).toBe('instagram'));
  it('retourne "telegram" pour @telegram', () => expect(getProviderFromChatId('789@telegram')).toBe('telegram'));
});

describe('getAvatarColors', () => {
  it('retourne les couleurs whatsapp par défaut', () => {
    const { bg, text } = getAvatarColors(null);
    expect(bg).toBe('bg-emerald-100');
    expect(text).toBe('text-emerald-700');
  });

  it('retourne les couleurs messenger pour @messenger', () => {
    const { bg } = getAvatarColors('x@messenger');
    expect(bg).toBe('bg-blue-100');
  });
});

describe('ProviderBadge', () => {
  it('affiche le label WhatsApp par défaut', () => {
    render(<ProviderBadge chatId="33612345678" />);
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
  });

  it('affiche le label Messenger', () => {
    render(<ProviderBadge chatId="123@messenger" />);
    expect(screen.getByText('Messenger')).toBeInTheDocument();
  });

  it('affiche le label Instagram', () => {
    render(<ProviderBadge chatId="456@instagram" />);
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('affiche le label Telegram', () => {
    render(<ProviderBadge chatId="789@telegram" />);
    expect(screen.getByText('Telegram')).toBeInTheDocument();
  });

  it('n\'affiche pas le label si showLabel=false', () => {
    render(<ProviderBadge chatId="33612345678" showLabel={false} />);
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });

  it('applique la className personnalisée', () => {
    const { container } = render(<ProviderBadge chatId="33612345678" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('a un attribut title avec le nom du provider', () => {
    const { container } = render(<ProviderBadge chatId="33612345678" />);
    expect(container.firstChild).toHaveAttribute('title', 'WhatsApp');
  });
});
