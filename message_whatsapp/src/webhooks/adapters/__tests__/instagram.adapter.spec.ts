import { InstagramAdapter } from '../instagram.adapter';
import {
  InstagramAttachment,
  InstagramWebhookPayload,
} from 'src/whapi/interface/instagram-webhook.interface';
import { AdapterContext } from '../provider-adapter.interface';

const CTX: AdapterContext = {
  provider: 'instagram',
  tenantId: 'tenant-1',
  channelId: 'ig-channel-1',
};

const IG_ACCOUNT_ID = 'ig-account-123';
const CLIENT_IGSID = 'igsid-client-456';

function makePayload(
  overrides: Partial<{
    senderId: string;
    recipientId: string;
    mid: string;
    timestamp: number;
    text: string;
    attachments: InstagramAttachment[];
    reply_to: { mid: string };
    is_deleted: boolean;
    is_unsupported: boolean;
    reactions: { reaction: string; emoji: string; action: 'react' | 'unreact' };
    read: { watermark: number };
  }> = {},
): InstagramWebhookPayload {
  const {
    senderId = CLIENT_IGSID,
    recipientId = IG_ACCOUNT_ID,
    mid = 'mid-001',
    timestamp = 1700000000000,
    text,
    attachments,
    reply_to,
    is_deleted,
    is_unsupported,
    reactions,
    read,
  } = overrides;

  const messaging: InstagramWebhookPayload['entry'][0]['messaging'][0] = {
    sender: { id: senderId },
    recipient: { id: recipientId },
    timestamp,
    ...(read
      ? { read }
      : {
          message: {
            mid,
            ...(text !== undefined ? { text } : {}),
            ...(attachments ? { attachments } : {}),
            ...(reply_to ? { reply_to } : {}),
            ...(is_deleted !== undefined ? { is_deleted } : {}),
            ...(is_unsupported !== undefined ? { is_unsupported } : {}),
            ...(reactions ? { reactions } : {}),
          },
        }),
  };

  return {
    object: 'instagram',
    entry: [{ id: IG_ACCOUNT_ID, time: timestamp, messaging: [messaging] }],
  };
}

describe('InstagramAdapter', () => {
  const adapter = new InstagramAdapter();

  // -------------------------------------------------------------------------
  // normalizeMessages() — messages entrants
  // -------------------------------------------------------------------------

  describe('normalizeMessages()', () => {
    describe('message texte', () => {
      it('normalise un message texte entrant', () => {
        const payload = makePayload({ text: 'bonjour' });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          provider: 'instagram',
          providerMessageId: 'mid-001',
          tenantId: 'tenant-1',
          channelId: 'ig-channel-1',
          chatId: `${CLIENT_IGSID}@instagram`,
          from: CLIENT_IGSID,
          direction: 'in',
          type: 'text',
          text: 'bonjour',
        });
      });

      it('convertit le timestamp ms en secondes', () => {
        const payload = makePayload({ text: 'hi', timestamp: 1700000000000 });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].timestamp).toBe(1700000000);
      });

      it('construit le chatId avec le suffixe @instagram', () => {
        const payload = makePayload({ text: 'x', senderId: 'igsid-abc' });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].chatId).toBe('igsid-abc@instagram');
      });
    });

    describe('direction outbound', () => {
      it("détecte la direction 'out' quand sender === ig_account_id", () => {
        const payload = makePayload({
          text: 'réponse agent',
          senderId: IG_ACCOUNT_ID,
          recipientId: CLIENT_IGSID,
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].direction).toBe('out');
      });
    });

    describe('attachments image', () => {
      it("normalise un attachment 'image' → type image", () => {
        const payload = makePayload({
          attachments: [
            { type: 'image', payload: { url: 'https://cdn.ig/photo.jpg' } },
          ],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].type).toBe('image');
      });

      it("renseigne media.link avec l'URL du payload", () => {
        const payload = makePayload({
          attachments: [
            { type: 'image', payload: { url: 'https://cdn.ig/photo.jpg' } },
          ],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].media).toMatchObject({
          id: 'mid-001',
          link: 'https://cdn.ig/photo.jpg',
        });
      });

      it('ne renseigne pas media si le payload ne contient pas d URL', () => {
        const payload = makePayload({
          attachments: [{ type: 'image', payload: {} }],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].media).toBeUndefined();
      });
    });

    describe('attachments vidéo', () => {
      it("normalise un attachment 'video' → type video", () => {
        const payload = makePayload({
          attachments: [
            { type: 'video', payload: { url: 'https://cdn.ig/clip.mp4' } },
          ],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].type).toBe('video');
      });

      it("normalise un attachment 'ig_reel' → type video", () => {
        const payload = makePayload({
          attachments: [{ type: 'ig_reel', payload: { url: 'https://cdn.ig/reel.mp4' } }],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].type).toBe('video');
      });

      it("normalise un attachment 'reel' → type video", () => {
        const payload = makePayload({
          attachments: [{ type: 'reel', payload: { url: 'https://cdn.ig/reel2.mp4' } }],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].type).toBe('video');
      });
    });

    describe('attachments audio', () => {
      it("normalise un attachment 'audio' → type audio", () => {
        const payload = makePayload({
          attachments: [
            { type: 'audio', payload: { url: 'https://cdn.ig/voice.ogg' } },
          ],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].type).toBe('audio');
      });
    });

    describe('attachments document', () => {
      it("normalise un attachment 'file' → type document", () => {
        const payload = makePayload({
          attachments: [
            { type: 'file', payload: { url: 'https://cdn.ig/doc.pdf' } },
          ],
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].type).toBe('document');
      });
    });

    describe('attachments non exploitables → type unknown, media undefined', () => {
      it.each([
        ['story_mention'],
        ['share'],
        ['fallback'],
      ] as const)(
        "normalise un attachment '%s' → type unknown sans media",
        (attachmentType) => {
          const payload = makePayload({
            attachments: [
              { type: attachmentType, payload: { url: 'https://cdn.ig/x' } },
            ],
          });
          const result = adapter.normalizeMessages(payload, CTX);

          expect(result[0].type).toBe('unknown');
          expect(result[0].media).toBeUndefined();
        },
      );
    });

    describe('messages filtrés', () => {
      it('filtre les messages supprimés (is_deleted: true)', () => {
        const payload = makePayload({ text: 'supprimé', is_deleted: true });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });

      it('filtre les messages non supportés (is_unsupported: true)', () => {
        const payload = makePayload({ is_unsupported: true });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });

      it('filtre les réactions', () => {
        const payload = makePayload({
          reactions: { reaction: 'love', emoji: '❤️', action: 'react' },
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });

      it('filtre les read receipts (messaging.read présent)', () => {
        const payload = makePayload({ read: { watermark: 1700000000000 } });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });
    });

    describe('reply_to (quoted message)', () => {
      it('renseigne quotedProviderMessageId depuis message.reply_to.mid', () => {
        const payload = makePayload({
          text: 'en réponse',
          reply_to: { mid: 'mid-parent-999' },
        });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].quotedProviderMessageId).toBe('mid-parent-999');
      });

      it('laisse quotedProviderMessageId undefined si pas de reply_to', () => {
        const payload = makePayload({ text: 'sans réponse' });
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result[0].quotedProviderMessageId).toBeUndefined();
      });
    });

    describe('payload vide / dégradé', () => {
      it('retourne [] si entry est vide', () => {
        const payload: InstagramWebhookPayload = {
          object: 'instagram',
          entry: [],
        };
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });

      it('retourne [] si messaging est vide', () => {
        const payload: InstagramWebhookPayload = {
          object: 'instagram',
          entry: [{ id: IG_ACCOUNT_ID, time: 0, messaging: [] }],
        };
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });

      it('retourne [] si messaging ne contient pas de message (champ absent)', () => {
        const payload: InstagramWebhookPayload = {
          object: 'instagram',
          entry: [
            {
              id: IG_ACCOUNT_ID,
              time: 0,
              messaging: [
                {
                  sender: { id: CLIENT_IGSID },
                  recipient: { id: IG_ACCOUNT_ID },
                  timestamp: 1700000000000,
                  // pas de champ 'message'
                } as any,
              ],
            },
          ],
        };
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(0);
      });

      it('gère plusieurs entrées messaging dans la même entry', () => {
        const payload: InstagramWebhookPayload = {
          object: 'instagram',
          entry: [
            {
              id: IG_ACCOUNT_ID,
              time: 0,
              messaging: [
                {
                  sender: { id: CLIENT_IGSID },
                  recipient: { id: IG_ACCOUNT_ID },
                  timestamp: 1700000001000,
                  message: { mid: 'mid-a', text: 'premier' },
                },
                {
                  sender: { id: CLIENT_IGSID },
                  recipient: { id: IG_ACCOUNT_ID },
                  timestamp: 1700000002000,
                  message: { mid: 'mid-b', text: 'deuxième' },
                },
              ],
            },
          ],
        };
        const result = adapter.normalizeMessages(payload, CTX);

        expect(result).toHaveLength(2);
        expect(result[0].providerMessageId).toBe('mid-a');
        expect(result[1].providerMessageId).toBe('mid-b');
      });
    });
  });

  // -------------------------------------------------------------------------
  // normalizeStatuses() — read receipts
  // -------------------------------------------------------------------------

  describe('normalizeStatuses()', () => {
    it('normalise un read receipt (watermark)', () => {
      const payload = makePayload({ read: { watermark: 1700000000000 } });
      const result = adapter.normalizeStatuses(payload, CTX);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        provider: 'instagram',
        providerMessageId: 'read_watermark_1700000000000',
        tenantId: 'tenant-1',
        channelId: 'ig-channel-1',
        recipientId: CLIENT_IGSID,
        status: 'read',
        timestamp: 1700000000,
      });
    });

    it('retourne [] si aucun messaging.read dans le payload', () => {
      const payload = makePayload({ text: 'bonjour' });
      const result = adapter.normalizeStatuses(payload, CTX);

      expect(result).toHaveLength(0);
    });

    it('retourne [] si entry est vide', () => {
      const payload: InstagramWebhookPayload = {
        object: 'instagram',
        entry: [],
      };
      const result = adapter.normalizeStatuses(payload, CTX);

      expect(result).toHaveLength(0);
    });

    it('convertit le messaging.timestamp ms en secondes dans le statut', () => {
      // Le timestamp du statut provient de messaging.timestamp (pas du watermark)
      const payload = makePayload({
        read: { watermark: 1700001234000 },
        timestamp: 1700001234000,
      });
      const result = adapter.normalizeStatuses(payload, CTX);

      expect(result[0].timestamp).toBe(1700001234);
    });
  });
});
