import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { CommunicationInstagramService } from './communication_instagram.service';
import { AppLogger } from 'src/logging/app-logger.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

const BASE_DATA = {
  recipientIgsid: 'igsid-123',
  accessToken: 'token-abc',
  mediaBuffer: Buffer.from('fake-image-data'),
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  mediaType: 'image' as const,
};

describe('CommunicationInstagramService', () => {
  let service: CommunicationInstagramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationInstagramService,
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<CommunicationInstagramService>(
      CommunicationInstagramService,
    );

    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // BUG-1 — Caption silencieusement ignorée
  // ---------------------------------------------------------------------------

  describe('sendMediaMessage() — BUG-1 caption', () => {
    beforeEach(() => {
      mockedAxios.post
        // Step 1 : attachment upload
        .mockResolvedValueOnce({ data: { attachment_id: 'att-456' } })
        // Step 2 : send message
        .mockResolvedValueOnce({ data: { message_id: 'mid-789' } });
    });

    it('inclut text=caption dans le payload step 2 quand caption est fournie', async () => {
      await service.sendMediaMessage({ ...BASE_DATA, caption: 'Ma légende' });

      const [, sendPayload] = mockedAxios.post.mock.calls[1];
      const message = (sendPayload as Record<string, unknown>)
        .message as Record<string, unknown>;

      expect(message.text).toBe('Ma légende');
    });

    it("n'inclut pas de champ text quand caption est absente", async () => {
      await service.sendMediaMessage({ ...BASE_DATA });

      const [, sendPayload] = mockedAxios.post.mock.calls[1];
      const message = (sendPayload as Record<string, unknown>)
        .message as Record<string, unknown>;

      expect(message).not.toHaveProperty('text');
    });

    it("n'inclut pas de champ text quand caption est une chaîne vide", async () => {
      await service.sendMediaMessage({ ...BASE_DATA, caption: '' });

      const [, sendPayload] = mockedAxios.post.mock.calls[1];
      const message = (sendPayload as Record<string, unknown>)
        .message as Record<string, unknown>;

      expect(message).not.toHaveProperty('text');
    });

    it('retourne providerMessageId et attachmentId', async () => {
      const result = await service.sendMediaMessage({
        ...BASE_DATA,
        caption: 'Test',
      });

      expect(result).toEqual({
        providerMessageId: 'mid-789',
        attachmentId: 'att-456',
      });
    });

    it('utilise attachment_id de l\'upload dans le payload step 2', async () => {
      await service.sendMediaMessage({ ...BASE_DATA });

      const [, sendPayload] = mockedAxios.post.mock.calls[1];
      const message = (sendPayload as Record<string, unknown>)
        .message as Record<string, unknown>;
      const attachment = message.attachment as Record<string, unknown>;
      const payload = attachment.payload as Record<string, unknown>;

      expect(payload.attachment_id).toBe('att-456');
    });
  });

  // ---------------------------------------------------------------------------
  // BUG-2 — Type 'document' non géré → exception explicite
  // ---------------------------------------------------------------------------

  describe('sendMediaMessage() — BUG-2 type document', () => {
    it('lève BadRequestException pour mediaType document', async () => {
      await expect(
        service.sendMediaMessage({
          ...BASE_DATA,
          mediaType: 'document',
          mimeType: 'application/pdf',
          fileName: 'contrat.pdf',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("message d'erreur mentionne 'documents'", async () => {
      await expect(
        service.sendMediaMessage({
          ...BASE_DATA,
          mediaType: 'document',
          mimeType: 'application/pdf',
          fileName: 'contrat.pdf',
        }),
      ).rejects.toThrow(/documents/i);
    });

    it("n'appelle pas axios.post pour un document", async () => {
      await expect(
        service.sendMediaMessage({
          ...BASE_DATA,
          mediaType: 'document',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Régression — audio doit toujours lever une exception (comportement existant)
  // ---------------------------------------------------------------------------

  describe('sendMediaMessage() — régression audio', () => {
    it('lève BadRequestException pour mediaType audio', async () => {
      await expect(
        service.sendMediaMessage({
          ...BASE_DATA,
          mediaType: 'audio',
          mimeType: 'audio/ogg',
          fileName: 'note.ogg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("n'appelle pas axios.post pour un audio", async () => {
      await expect(
        service.sendMediaMessage({
          ...BASE_DATA,
          mediaType: 'audio',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // sendMediaMessage() — comportement nominal image/video
  // ---------------------------------------------------------------------------

  describe('sendMediaMessage() — types supportés', () => {
    beforeEach(() => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: { attachment_id: 'att-img' } })
        .mockResolvedValueOnce({ data: { message_id: 'mid-img' } });
    });

    it('envoie un type "image" correctement', async () => {
      const result = await service.sendMediaMessage({ ...BASE_DATA });

      const [, uploadPayload] = mockedAxios.post.mock.calls[0];
      const msgStr = (uploadPayload as FormData).get?.('message') as string;
      if (msgStr) {
        expect(JSON.parse(msgStr).attachment.type).toBe('image');
      }
      expect(result.providerMessageId).toBe('mid-img');
    });

    it('envoie un type "video" correctement', async () => {
      mockedAxios.post
        .mockReset()
        .mockResolvedValueOnce({ data: { attachment_id: 'att-vid' } })
        .mockResolvedValueOnce({ data: { message_id: 'mid-vid' } });

      const result = await service.sendMediaMessage({
        ...BASE_DATA,
        mediaType: 'video',
        mimeType: 'video/mp4',
        fileName: 'clip.mp4',
      });

      expect(result.providerMessageId).toBe('mid-vid');
    });
  });
});
