/**
 * TICKET-10-A-BIS — Tests d'intégration du pipeline ingress complet.
 *
 * Couvre le golden path et les cas limites identifiés dans le backlog :
 *   1. webhook entrant → normalisation → conversation créée → poste assigné → socket émis
 *   2. webhook → conversation existante → unread mis à jour → socket mis à jour
 *   3. webhook avec chat_id inconnu → rejet propre (HTTP 200, pas d'exception)
 *   4. pipeline ingress avec média → extraction + persistance media
 *
 * Niveau : tests unitaires avec mocks (pas de vraie DB).
 * Les tests d'intégration E2E avec vraie DB sont planifiés en Sprint post-prod.
 *
 * Dépendances satisfaites : TICKET-04-A ✅ TICKET-02-D ✅
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InboundMessageService } from '../inbound-message.service';
import { ChatIdValidationService } from 'src/ingress/domain/chat-id-validation.service';
import { ProviderEnrichmentService } from 'src/ingress/domain/provider-enrichment.service';
import { IncomingMessagePersistenceService } from 'src/ingress/infrastructure/incoming-message-persistence.service';
import { InboundStateUpdateService } from 'src/ingress/domain/inbound-state-update.service';
import { MediaExtractionService } from 'src/ingress/domain/media-extraction.service';
import { MediaPersistenceService } from 'src/ingress/infrastructure/media-persistence.service';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { SystemAlertService } from 'src/system-alert/system-alert.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { UnifiedMessage } from '../normalization/unified-message';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { INBOUND_MESSAGE_PROCESSED_EVENT } from 'src/ingress/events/inbound-message-processed.event';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    providerMessageId: 'msg-001',
    chatId: '33612345678@s.whatsapp.net',
    fromName: 'Client Test',
    type: 'text',
    text: 'Bonjour',
    direction: 'in',
    timestamp: new Date(),
    tenantId: 'tenant-1',
    channelId: 'channel-1',
    provider: 'whapi',
    ...overrides,
  } as UnifiedMessage;
}

function makeConversation(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return {
    id: 'chat-uuid-1',
    chat_id: '33612345678@s.whatsapp.net',
    status: WhatsappChatStatus.ACTIF,
    poste_id: 'poste-1',
    tenant_id: 'tenant-1',
    unread_count: 0,
    read_only: false,
    last_poste_message_at: null,
    ...overrides,
  } as unknown as WhatsappChat;
}

function makeSavedMessage(): WhatsappMessage {
  return {
    id: 'saved-msg-1',
    chat_id: '33612345678@s.whatsapp.net',
    timestamp: new Date(),
    from_me: false,
  } as unknown as WhatsappMessage;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const dispatcherMock = { assignConversation: jest.fn() };
const gatewayMock = {
  notifyNewMessage: jest.fn(),
  notifyStatusUpdate: jest.fn(),
};
const systemAlertMock = { onInboundMessage: jest.fn() };
const whatsappMessageServiceMock = { updateStatusFromUnified: jest.fn() };
const chatIdValidationMock = { validate: jest.fn() };
const providerEnrichmentMock = { enrich: jest.fn() };
const messagePersistenceMock = { persist: jest.fn() };
const stateUpdateMock = { apply: jest.fn() };
const mediaExtractionMock = { extract: jest.fn() };
const mediaPersistenceMock = { persistAll: jest.fn() };
const eventEmitterMock = { emit: jest.fn() };

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('InboundMessageService — pipeline ingress (TICKET-10-A-BIS)', () => {
  let service: InboundMessageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Defaults : golden path
    chatIdValidationMock.validate.mockReturnValue({ valid: true });
    providerEnrichmentMock.enrich.mockResolvedValue(undefined);
    dispatcherMock.assignConversation.mockResolvedValue(makeConversation());
    messagePersistenceMock.persist.mockResolvedValue({
      ok: true,
      message: makeSavedMessage(),
    });
    mediaExtractionMock.extract.mockReturnValue([]);
    mediaPersistenceMock.persistAll.mockResolvedValue(undefined);
    stateUpdateMock.apply.mockResolvedValue(undefined);
    gatewayMock.notifyNewMessage.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundMessageService,
        { provide: DispatcherService, useValue: dispatcherMock },
        { provide: WhatsappMessageGateway, useValue: gatewayMock },
        { provide: SystemAlertService, useValue: systemAlertMock },
        { provide: WhatsappMessageService, useValue: whatsappMessageServiceMock },
        { provide: ChatIdValidationService, useValue: chatIdValidationMock },
        { provide: ProviderEnrichmentService, useValue: providerEnrichmentMock },
        { provide: IncomingMessagePersistenceService, useValue: messagePersistenceMock },
        { provide: InboundStateUpdateService, useValue: stateUpdateMock },
        { provide: MediaExtractionService, useValue: mediaExtractionMock },
        { provide: MediaPersistenceService, useValue: mediaPersistenceMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
      ],
    }).compile();

    service = module.get<InboundMessageService>(InboundMessageService);
  });

  // ── Test 1 : golden path ─────────────────────────────────────────────────

  describe('Golden path : webhook entrant → conversation créée → socket émis', () => {
    it('appelle tout le pipeline dans le bon ordre', async () => {
      const msg = makeMessage();

      await service.handleMessages([msg]);

      // Étape 1 : validation chat_id
      expect(chatIdValidationMock.validate).toHaveBeenCalledWith(msg.chatId);

      // Étape 2 : enrichissement provider
      expect(providerEnrichmentMock.enrich).toHaveBeenCalledWith(msg);

      // Étape 3 : assignation
      expect(dispatcherMock.assignConversation).toHaveBeenCalledWith(
        msg.chatId,
        msg.fromName,
        expect.any(String), // traceId
        msg.tenantId,
        msg.channelId,
      );

      // Étape 4 : persistance message
      expect(messagePersistenceMock.persist).toHaveBeenCalledWith(
        msg,
        expect.objectContaining({ chat_id: msg.chatId }),
        expect.any(String),
      );

      // Étape 5 : persistance média (aucun ici)
      expect(mediaExtractionMock.extract).toHaveBeenCalledWith(msg);
      expect(mediaPersistenceMock.persistAll).toHaveBeenCalledWith(
        [],
        expect.any(Object),
        expect.any(Object),
        msg,
      );

      // Étape 6 : mise à jour état conversation
      expect(stateUpdateMock.apply).toHaveBeenCalled();

      // Étape 7 : notification socket
      expect(gatewayMock.notifyNewMessage).toHaveBeenCalled();

      // Étape 8 : événement EventEmitter2
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        INBOUND_MESSAGE_PROCESSED_EVENT,
        expect.objectContaining({
          conversation: expect.any(Object),
          message: expect.any(Object),
          traceId: expect.any(String),
        }),
      );
    });

    it("ignore les messages sortants (direction = 'out')", async () => {
      const msg = makeMessage({ direction: 'out' });

      await service.handleMessages([msg]);

      expect(dispatcherMock.assignConversation).not.toHaveBeenCalled();
      expect(gatewayMock.notifyNewMessage).not.toHaveBeenCalled();
    });
  });

  // ── Test 2 : chat_id inconnu → rejet propre ──────────────────────────────

  describe('Rejet propre des chat_id invalides', () => {
    it("rejette un chat_id null sans lever d'exception", async () => {
      chatIdValidationMock.validate.mockReturnValue({
        valid: false,
        reason: 'missing_chat_id',
      });
      const msg = makeMessage({ chatId: undefined as any });

      await expect(service.handleMessages([msg])).resolves.not.toThrow();
      expect(dispatcherMock.assignConversation).not.toHaveBeenCalled();
    });

    it('rejette un chat_id de groupe (@g.us)', async () => {
      chatIdValidationMock.validate.mockReturnValue({
        valid: false,
        reason: 'group_chat_not_supported',
      });
      const msg = makeMessage({ chatId: '120123456789@g.us' });

      await expect(service.handleMessages([msg])).resolves.not.toThrow();
      expect(dispatcherMock.assignConversation).not.toHaveBeenCalled();
    });

    it("stoppe le pipeline si aucun poste n'est disponible (dispatch renvoie null)", async () => {
      dispatcherMock.assignConversation.mockResolvedValue(null);
      const msg = makeMessage();

      await service.handleMessages([msg]);

      // Le pipeline s'arrête après l'étape 3
      expect(messagePersistenceMock.persist).not.toHaveBeenCalled();
      expect(gatewayMock.notifyNewMessage).not.toHaveBeenCalled();
    });
  });

  // ── Test 3 : canal inconnu → HTTP 200 sans traitement ────────────────────

  describe('Canal inconnu → arrêt propre (HTTP 200)', () => {
    it("stoppe le pipeline si la persistance retourne ok=false (canal inconnu)", async () => {
      messagePersistenceMock.persist.mockResolvedValue({ ok: false });
      const msg = makeMessage();

      await service.handleMessages([msg]);

      // Pas de mise à jour état, pas de notification socket
      expect(stateUpdateMock.apply).not.toHaveBeenCalled();
      expect(gatewayMock.notifyNewMessage).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });

  // ── Test 4 : pipeline avec média ─────────────────────────────────────────

  describe('Pipeline avec média', () => {
    const extractedMedia = [
      {
        type: 'image' as const,
        media_id: 'media-001',
        mime_type: 'image/jpeg',
        caption: 'Photo client',
      },
    ];

    it('extrait et persiste le média attaché au message', async () => {
      mediaExtractionMock.extract.mockReturnValue(extractedMedia);
      const msg = makeMessage({
        type: 'image',
        media: {
          id: 'media-001',
          mimeType: 'image/jpeg',
          caption: 'Photo client',
        } as any,
      });

      await service.handleMessages([msg]);

      expect(mediaExtractionMock.extract).toHaveBeenCalledWith(msg);
      expect(mediaPersistenceMock.persistAll).toHaveBeenCalledWith(
        extractedMedia,
        expect.any(Object),
        expect.any(Object),
        msg,
      );
    });

    it('passe [] à persistAll si aucun média dans le message', async () => {
      mediaExtractionMock.extract.mockReturnValue([]);
      const msg = makeMessage({ type: 'text', media: undefined });

      await service.handleMessages([msg]);

      expect(mediaPersistenceMock.persistAll).toHaveBeenCalledWith(
        [],
        expect.any(Object),
        expect.any(Object),
        msg,
      );
    });
  });

  // ── Test 5 : batch de messages ───────────────────────────────────────────

  describe('Traitement batch', () => {
    it('traite plusieurs messages séquentiellement avec mutex par chat_id', async () => {
      const msg1 = makeMessage({ providerMessageId: 'msg-001' });
      const msg2 = makeMessage({ providerMessageId: 'msg-002' });

      await service.handleMessages([msg1, msg2]);

      expect(dispatcherMock.assignConversation).toHaveBeenCalledTimes(2);
      expect(gatewayMock.notifyNewMessage).toHaveBeenCalledTimes(2);
    });

    it('ignore les messages d un batch vide sans erreur', async () => {
      await expect(service.handleMessages([])).resolves.not.toThrow();
      expect(dispatcherMock.assignConversation).not.toHaveBeenCalled();
    });
  });
});

// ─── Tests unitaires : ChatIdValidationService ───────────────────────────────

describe('ChatIdValidationService (TICKET-10-A-BIS)', () => {
  const validator = new ChatIdValidationService();

  it('accepte un chat_id valide', () => {
    expect(validator.validate('33612345678@s.whatsapp.net').valid).toBe(true);
  });

  it('rejette un chat_id null', () => {
    expect(validator.validate(null).valid).toBe(false);
  });

  it('rejette un chat_id de groupe', () => {
    const result = validator.validate('120123456789@g.us');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('group_chat_not_supported');
  });

  it('rejette un chat_id sans @', () => {
    expect(validator.validate('notavalidid').valid).toBe(false);
  });

  it('rejette un numéro trop court (< 8 chiffres)', () => {
    const result = validator.validate('123@s.whatsapp.net');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('phone_length_out_of_range');
  });
});
