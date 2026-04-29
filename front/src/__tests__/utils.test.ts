import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveMediaUrl, createMessage, getStatusBadge } from '@/lib/utils';

describe('utils', () => {
  describe('resolveMediaUrl', () => {
    const ORIGINAL_API = process.env.NEXT_PUBLIC_API_URL;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    });

    afterEach(() => {
      process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API;
    });

    it('renvoie null pour null', () => {
      expect(resolveMediaUrl(null)).toBeNull();
    });

    it('renvoie null pour undefined', () => {
      expect(resolveMediaUrl(undefined)).toBeNull();
    });

    it('renvoie null pour une string vide', () => {
      expect(resolveMediaUrl('')).toBeNull();
    });

    it('préfixe les chemins relatifs avec NEXT_PUBLIC_API_URL', () => {
      expect(resolveMediaUrl('/messages/media/abc.jpg')).toBe(
        'https://api.example.com/messages/media/abc.jpg',
      );
    });

    it('retire les slashes finaux du base URL', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com//';
      expect(resolveMediaUrl('/foo')).toBe('https://api.example.com/foo');
    });

    it('utilise une base vide si NEXT_PUBLIC_API_URL non défini', () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      expect(resolveMediaUrl('/messages/media/x.jpg')).toBe('/messages/media/x.jpg');
    });

    it('renvoie l\'URL absolue telle quelle', () => {
      expect(resolveMediaUrl('https://cdn.whapi.cloud/file.jpg')).toBe(
        'https://cdn.whapi.cloud/file.jpg',
      );
    });

    it('renvoie une URL http:// telle quelle', () => {
      expect(resolveMediaUrl('http://cdn.example.com/file.png')).toBe(
        'http://cdn.example.com/file.png',
      );
    });
  });

  describe('createMessage', () => {
    it('crée un Message à partir des données minimales', () => {
      const result = createMessage({
        from: '+33612345678',
        chat_id: 'chat-1',
      });
      expect(result.from).toBe('+33612345678');
      expect(result.chat_id).toBe('chat-1');
      expect(result.text).toBe('');
      expect(result.status).toBe('sent');
      expect(result.direction).toBe('IN');
      expect(result.from_me).toBe(false);
      expect(result.from_name).toBe('Client');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.id).toMatch(/^msg_\d+/);
    });

    it('utilise l\'id fourni converti en string', () => {
      const result = createMessage({
        id: 42,
        from: 'me',
        chat_id: 'c',
      });
      expect(result.id).toBe('42');
    });

    it('utilise le texte fourni', () => {
      const result = createMessage({
        from: 'me',
        chat_id: 'c',
        text: 'hello',
      });
      expect(result.text).toBe('hello');
    });

    it('respecte from_me=true et utilise from_name "Agent" par défaut', () => {
      const result = createMessage({
        from: 'me',
        chat_id: 'c',
        from_me: true,
      });
      expect(result.from_me).toBe(true);
      expect(result.from_name).toBe('Agent');
    });

    it('respecte le from_name fourni', () => {
      const result = createMessage({
        from: 'me',
        chat_id: 'c',
        from_name: 'Custom Name',
      });
      expect(result.from_name).toBe('Custom Name');
    });

    it('utilise le timestamp fourni', () => {
      const ts = new Date(2026, 1, 18).toISOString();
      const result = createMessage({
        from: 'me',
        chat_id: 'c',
        timestamp: ts,
      });
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBe(new Date(ts).getTime());
    });

    it('utilise le status fourni', () => {
      const result = createMessage({
        from: 'me',
        chat_id: 'c',
        status: 'read',
      });
      expect(result.status).toBe('read');
    });

    it('utilise la direction fournie', () => {
      const result = createMessage({
        from: 'me',
        chat_id: 'c',
        direction: 'OUT',
      });
      expect(result.direction).toBe('OUT');
    });
  });

  describe('getStatusBadge', () => {
    it('retourne le style "nouveau"', () => {
      expect(getStatusBadge('nouveau')).toBe('bg-blue-100 text-blue-800');
    });

    it('retourne le style "en_cours"', () => {
      expect(getStatusBadge('en_cours')).toBe('bg-yellow-100 text-yellow-800');
    });

    it('retourne le style "actif" (alias jaune)', () => {
      expect(getStatusBadge('actif')).toBe('bg-yellow-100 text-yellow-800');
    });

    it('retourne le style "attente"', () => {
      expect(getStatusBadge('attente')).toBe('bg-gray-100 text-gray-800');
    });

    it('retourne le style "en attente"', () => {
      expect(getStatusBadge('en attente')).toBe('bg-gray-100 text-gray-800');
    });

    it('retourne le style "converti"', () => {
      expect(getStatusBadge('converti')).toBe('bg-green-100 text-green-800');
    });

    it('retourne le style nouveau par défaut pour un statut inconnu', () => {
      expect(getStatusBadge('unknown_status')).toBe('bg-blue-100 text-blue-800');
    });
  });
});
