import { describe, it, expect } from 'vitest';
import { normalizeWhatsappChat } from '../chat.mapper';

describe('normalizeWhatsappChat', () => {
  it('retourne les valeurs par défaut pour un objet vide', () => {
    const result = normalizeWhatsappChat({});
    expect(result.id).toBe('');
    expect(result.chat_id).toBe('');
    expect(result.name).toBe('Client inconnu');
    expect(result.type).toBe('private');
    expect(result.is_pinned).toBe(false);
    expect(result.is_muted).toBe(false);
    expect(result.is_archived).toBe(false);
    expect(result.unread_count).toBe(0);
    expect(result.unreadCount).toBe(0);
    expect(result.not_spam).toBe(true);
    expect(result.read_only).toBe(false);
    expect(result.status).toBe('attente');
    expect(result.messages).toEqual([]);
  });

  it('utilise les valeurs fournies quand elles sont présentes', () => {
    const result = normalizeWhatsappChat({
      id: 'uuid-1',
      chat_id: '33612345678@s.whatsapp.net',
      name: 'Jean Dupont',
      type: 'group',
      is_pinned: true,
      status: 'actif',
    });
    expect(result.id).toBe('uuid-1');
    expect(result.chat_id).toBe('33612345678@s.whatsapp.net');
    expect(result.name).toBe('Jean Dupont');
    expect(result.type).toBe('group');
    expect(result.is_pinned).toBe(true);
    expect(result.status).toBe('actif');
  });

  it('normalise le status "en attente" vers "attente"', () => {
    const result = normalizeWhatsappChat({ status: 'en attente' });
    expect(result.status).toBe('attente');
  });

  it('utilise unread_count si fourni', () => {
    const result = normalizeWhatsappChat({ unread_count: 5 });
    expect(result.unread_count).toBe(5);
    expect(result.unreadCount).toBe(5);
  });

  it('utilise unreadCount en fallback si unread_count absent', () => {
    const result = normalizeWhatsappChat({ unreadCount: 3 });
    expect(result.unread_count).toBe(3);
    expect(result.unreadCount).toBe(3);
  });

  it('prioritise unread_count sur unreadCount', () => {
    const result = normalizeWhatsappChat({ unread_count: 7, unreadCount: 2 });
    expect(result.unread_count).toBe(7);
    expect(result.unreadCount).toBe(7);
  });

  it('utilise channel_id depuis last_msg_client_channel_id en fallback', () => {
    const result = normalizeWhatsappChat({ last_msg_client_channel_id: 'chan-42' });
    expect(result.channel_id).toBe('chan-42');
  });

  it('utilise client_phone depuis contact_client en fallback', () => {
    const result = normalizeWhatsappChat({ contact_client: '0612345678' });
    expect(result.client_phone).toBe('0612345678');
    expect(result.contact_client).toBe('0612345678');
  });

  it('utilise contact_client depuis client_phone en fallback', () => {
    const result = normalizeWhatsappChat({ client_phone: '0698765432' });
    expect(result.contact_client).toBe('0698765432');
  });

  it('utilise poste_id depuis poste.id en fallback', () => {
    const result = normalizeWhatsappChat({ poste: { id: 'poste-1', name: 'Poste A' } as never });
    expect(result.poste_id).toBe('poste-1');
  });

  it('retourne un tableau vide pour messages si absent', () => {
    const result = normalizeWhatsappChat({});
    expect(result.messages).toEqual([]);
  });

  it('conserve les messages fournis', () => {
    const msgs = [{ id: 'm1', text: 'Bonjour' }];
    const result = normalizeWhatsappChat({ messages: msgs as never });
    expect(result.messages).toEqual(msgs);
  });

  it('mute_until est null par défaut', () => {
    expect(normalizeWhatsappChat({}).mute_until).toBeNull();
  });

  it('assigned_at, last_client_message_at, last_poste_message_at sont null par défaut', () => {
    const r = normalizeWhatsappChat({});
    expect(r.assigned_at).toBeNull();
    expect(r.last_client_message_at).toBeNull();
    expect(r.last_poste_message_at).toBeNull();
  });
});
