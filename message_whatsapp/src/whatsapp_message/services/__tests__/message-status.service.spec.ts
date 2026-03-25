import { MessageStatusService } from '../message-status.service';
import { InMemoryMessageRepository } from 'src/test-utils/repositories/in-memory-message.repository';
import {
  MessageDirection,
  WhatsappMessage,
  WhatsappMessageStatus,
} from '../../entities/whatsapp_message.entity';

function makeMessage(overrides: Partial<WhatsappMessage> = {}): Partial<WhatsappMessage> {
  return {
    id: 'msg-1',
    external_id: 'ext-abc',
    provider_message_id: 'prov-abc',
    chat_id: '33612345678@c.us',
    direction: MessageDirection.OUT,
    from_me: true,
    status: WhatsappMessageStatus.SENT,
    timestamp: new Date(),
    ...overrides,
  };
}

describe('MessageStatusService', () => {
  let service: MessageStatusService;
  let repo: InMemoryMessageRepository;

  beforeEach(() => {
    repo = new InMemoryMessageRepository();
    service = new MessageStatusService(repo);
  });

  describe('updateByStatus', () => {
    it('met à jour le statut quand le message est trouvé par external_id', async () => {
      repo.seed(makeMessage());

      const result = await service.updateByStatus({
        id: 'ext-abc',
        recipient_id: '33612345678@c.us',
        status: 'DELIVERED',
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(WhatsappMessageStatus.DELIVERED);
    });

    it('met à jour le statut quand le message est trouvé par provider_message_id', async () => {
      repo.seed(makeMessage());

      const result = await service.updateByStatus({
        id: 'prov-abc',
        recipient_id: '33612345678@c.us',
        status: 'READ',
      });

      expect(result?.status).toBe(WhatsappMessageStatus.READ);
    });

    it('retourne null quand le message est introuvable', async () => {
      const result = await service.updateByStatus({
        id: 'unknown-id',
        recipient_id: '33612345678@c.us',
        status: 'DELIVERED',
      });

      expect(result).toBeNull();
    });

    it("enregistre le code et le titre d'erreur", async () => {
      repo.seed(makeMessage());

      const result = await service.updateByStatus({
        id: 'ext-abc',
        recipient_id: '33612345678@c.us',
        status: 'FAILED',
        errorCode: 131026,
        errorTitle: 'Message Undeliverable',
      });

      expect(result?.status).toBe(WhatsappMessageStatus.FAILED);
      expect(result?.error_code).toBe(131026);
      expect(result?.error_title).toBe('Message Undeliverable');
    });

    it('trouve le message sans recipient_id (recherche globale)', async () => {
      repo.seed(makeMessage());

      const result = await service.updateByStatus({
        id: 'ext-abc',
        recipient_id: '',
        status: 'DELIVERED',
      });

      expect(result?.status).toBe(WhatsappMessageStatus.DELIVERED);
    });
  });

  describe('updateStatusFromUnified', () => {
    it('délègue correctement à updateByStatus', async () => {
      repo.seed(makeMessage());

      const result = await service.updateStatusFromUnified({
        providerMessageId: 'prov-abc',
        recipientId: '33612345678@c.us',
        status: 'READ',
      });

      expect(result?.status).toBe(WhatsappMessageStatus.READ);
    });
  });

  describe('markIncomingMessagesAsRead', () => {
    it('marque tous les messages entrants non-lus comme READ', async () => {
      const chatId = '33612345678@c.us';
      repo.seed(makeMessage({
        id: 'in-1',
        chat_id: chatId,
        direction: MessageDirection.IN,
        from_me: false,
        status: WhatsappMessageStatus.DELIVERED,
      }));
      repo.seed(makeMessage({
        id: 'in-2',
        chat_id: chatId,
        direction: MessageDirection.IN,
        from_me: false,
        status: WhatsappMessageStatus.SENT,
      }));
      repo.seed(makeMessage({
        id: 'out-1',
        chat_id: chatId,
        direction: MessageDirection.OUT,
        from_me: true,
        status: WhatsappMessageStatus.DELIVERED,
      }));

      await service.markIncomingMessagesAsRead(chatId);

      const all = repo.all();
      expect(all.find(m => m.id === 'in-1')?.status).toBe(WhatsappMessageStatus.READ);
      expect(all.find(m => m.id === 'in-2')?.status).toBe(WhatsappMessageStatus.READ);
      // Les messages sortants ne sont pas touchés
      expect(all.find(m => m.id === 'out-1')?.status).toBe(WhatsappMessageStatus.DELIVERED);
    });

    it("ne touche pas les messages d'une autre conversation", async () => {
      repo.seed(makeMessage({
        id: 'other-1',
        chat_id: 'other@c.us',
        direction: MessageDirection.IN,
        from_me: false,
        status: WhatsappMessageStatus.DELIVERED,
      }));

      await service.markIncomingMessagesAsRead('33612345678@c.us');

      expect(repo.all().find(m => m.id === 'other-1')?.status).toBe(
        WhatsappMessageStatus.DELIVERED,
      );
    });
  });
});
