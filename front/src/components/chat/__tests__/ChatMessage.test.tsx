import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Message } from '@/types/chat';

vi.mock('@/store/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => selector({ setReplyTo: vi.fn() })),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="location-map" />,
}));

vi.mock('../LocationMapThumb', () => ({
  default: () => <div data-testid="location-map-thumb" />,
}));

vi.mock('../../helper/mediaBubble', () => ({
  MediaBubble: ({ media }: { media: { url: string } }) => <div data-testid="media-bubble">{media.url}</div>,
}));

vi.mock('@/lib/dateUtils', () => ({
  formatTime: vi.fn(() => '14:30'),
}));

vi.mock('@/lib/utils', () => ({
  resolveMediaUrl: vi.fn((url: string) => url ?? null),
}));

import ChatMessage from '../ChatMessage';

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    chat_id: '33612345678@s.whatsapp.net',
    from_me: false,
    from_name: 'Jean',
    text: 'Bonjour!',
    timestamp: '2026-01-01T14:30:00Z',
    status: 'delivered',
    medias: [],
    type: 'text',
    ...overrides,
  } as unknown as Message;
}

describe('ChatMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('affiche le texte du message client', () => {
    render(<ChatMessage msg={makeMsg()} index={0} />);
    expect(screen.getByText('Bonjour!')).toBeInTheDocument();
  });

  it('affiche le timestamp formaté', () => {
    render(<ChatMessage msg={makeMsg()} index={0} />);
    expect(screen.getByText('14:30')).toBeInTheDocument();
  });

  it('message from_me=true — pas d\'icône avatar', () => {
    const { container } = render(<ChatMessage msg={makeMsg({ from_me: true })} index={0} />);
    expect(container.querySelector('.bg-green-100')).not.toBeInTheDocument();
  });

  it('message from_me=false — affiche l\'avatar', () => {
    const { container } = render(<ChatMessage msg={makeMsg({ from_me: false })} index={0} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('statut "sending" affiche l\'icône horloge', () => {
    const { container } = render(<ChatMessage msg={makeMsg({ from_me: true, status: 'sending' })} index={0} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('n\'affiche pas de texte si text est vide', () => {
    const { queryByText } = render(<ChatMessage msg={makeMsg({ text: '' })} index={0} />);
    expect(queryByText('Bonjour!')).not.toBeInTheDocument();
  });

  it('affiche MediaBubble si le message a des médias', () => {
    const msg = makeMsg({ medias: [{ id: 'm1', type: 'image', url: 'http://test.com/img.jpg' }] as never });
    render(<ChatMessage msg={msg} index={0} />);
    expect(screen.getByTestId('media-bubble')).toBeInTheDocument();
  });

  it('avatar Messenger pour @messenger', () => {
    const { container } = render(<ChatMessage msg={makeMsg({ chat_id: '123@messenger', from_me: false })} index={0} />);
    const avatar = container.querySelector('.bg-blue-100');
    expect(avatar).toBeInTheDocument();
  });

  it('avatar Telegram pour @telegram', () => {
    const { container } = render(<ChatMessage msg={makeMsg({ chat_id: '123@telegram', from_me: false })} index={0} />);
    const avatar = container.querySelector('.bg-sky-100');
    expect(avatar).toBeInTheDocument();
  });

  it('n\'affiche pas le texte si le message contient une localisation', () => {
    const msg = makeMsg({
      text: '[Localisation]',
      medias: [{ id: 'm1', type: 'location', lat: 48.8, lng: 2.3 }] as never,
    });
    render(<ChatMessage msg={msg} index={0} />);
    expect(screen.queryByText('[Localisation]')).not.toBeInTheDocument();
  });

  it('message avec replyTo affiche le message cité', () => {
    const msg = makeMsg({ replyTo: { id: 'orig', text: 'Message original', from_me: true } as never });
    render(<ChatMessage msg={msg} index={0} />);
    expect(screen.getByText('Message original')).toBeInTheDocument();
  });
});
