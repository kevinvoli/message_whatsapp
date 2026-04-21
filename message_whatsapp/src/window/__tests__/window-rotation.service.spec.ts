/**
 * Tests unitaires — WindowRotationService
 * Couvre : checkAndTriggerRotation, onConversationValidated, handleConversationStatusChanged.
 */

import { WindowRotationService, WINDOW_ROTATED_EVENT, WINDOW_CRITERION_VALIDATED_EVENT } from '../services/window-rotation.service';
import { WhatsappChat, WindowStatus, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return Object.assign(new WhatsappChat(), {
    id: `uuid-${Math.random().toString(36).slice(2)}`,
    chat_id: `chat-${Math.random().toString(36).slice(2)}`,
    poste_id: 'poste-abc',
    window_slot: 1,
    window_status: WindowStatus.ACTIVE,
    status: WhatsappChatStatus.ACTIF,
    is_locked: false,
    deletedAt: null,
    last_activity_at: new Date(),
    ...overrides,
  });
}

// ─── Mock builders ────────────────────────────────────────────────────────────

function makeChatRepo(chats: WhatsappChat[] = []) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
    getMany: jest.fn().mockResolvedValue(chats),
    getCount: jest.fn().mockResolvedValue(chats.length),
  };

  return {
    find: jest.fn().mockResolvedValue(chats),
    findOne: jest.fn().mockResolvedValue(chats[0] ?? null),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(chats.length),
    query: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    _qb: qb,
  } as any;
}

function makeCapacityService(quotaActive = 10, quotaTotal = 50, windowModeEnabled = true) {
  return {
    getQuotas: jest.fn().mockResolvedValue({ quotaActive, quotaTotal }),
    isWindowModeEnabled: jest.fn().mockResolvedValue(windowModeEnabled),
    onConversationQualifiedLegacy: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeValidationEngine() {
  return {
    initConversationValidation: jest.fn().mockResolvedValue(undefined),
    onConversationResultSet: jest.fn().mockResolvedValue(true),
    getBlockProgress: jest.fn().mockResolvedValue({ validated: 0, total: 10 }),
  } as any;
}

function makeEventEmitter() {
  return {
    emit: jest.fn(),
  } as unknown as EventEmitter2;
}

function buildService(chatRepo: any, opts: { quotaActive?: number; quotaTotal?: number } = {}) {
  const emitter = makeEventEmitter();
  const service = new WindowRotationService(
    chatRepo,
    makeCapacityService(opts.quotaActive ?? 10, opts.quotaTotal ?? 50),
    makeValidationEngine(),
    emitter,
  );
  return { service, emitter };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WindowRotationService', () => {

  describe('checkAndTriggerRotation', () => {
    it('ne déclenche pas la rotation si un seul actif non validé', async () => {
      const chats = [makeChat({ window_status: WindowStatus.ACTIVE })];
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo);
      await service.checkAndTriggerRotation('poste-abc');
      // performRotation ne doit pas être appelé → aucun update de released
      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const releaseCalls = updateCalls.filter((c) => c[1]?.window_status === WindowStatus.RELEASED);
      expect(releaseCalls).toHaveLength(0);
    });

    it('ne déclenche pas si group < 3 et < quotaActive', async () => {
      const chats = [
        makeChat({ window_status: WindowStatus.VALIDATED }),
        makeChat({ window_status: WindowStatus.VALIDATED }),
      ];
      const repo = makeChatRepo(chats);
      const { service } = buildService(repo, { quotaActive: 10 });
      // 2 validées < 3 seuil → pas de rotation
      await service.checkAndTriggerRotation('poste-abc');
      const updateCalls = (repo.update as jest.Mock).mock.calls;
      const releaseCalls = updateCalls.filter((c) => c[1]?.window_status === WindowStatus.RELEASED);
      expect(releaseCalls).toHaveLength(0);
    });
  });

  describe('onConversationValidated', () => {
    it('passe window_status à VALIDATED', async () => {
      const chat = makeChat({ window_status: WindowStatus.ACTIVE });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      await service.onConversationValidated(chat.chat_id, 'poste-abc');
      expect(repo.update).toHaveBeenCalledWith(
        { id: chat.id },
        { window_status: WindowStatus.VALIDATED },
      );
    });

    it('ne fait rien si la conversation n\'est pas ACTIVE', async () => {
      const chat = makeChat({ window_status: WindowStatus.LOCKED });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      await service.onConversationValidated(chat.chat_id, 'poste-abc');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('ne fait rien si la conversation n\'est pas dans le bon poste', async () => {
      const repo = makeChatRepo([]);
      repo.findOne.mockResolvedValue(null);
      const { service } = buildService(repo);
      await service.onConversationValidated('chat-xyz', 'poste-abc');
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('handleConversationStatusChanged', () => {
    it('ignore les changements de statut non-fermé', async () => {
      const repo = makeChatRepo([]);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: 'chat-1', newStatus: 'actif' });
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('libère le slot quand la conversation est fermée', async () => {
      const chat = makeChat({ window_slot: 3, window_status: WindowStatus.ACTIVE });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });
      expect(repo.update).toHaveBeenCalledWith(
        { id: chat.id },
        { window_slot: null, window_status: WindowStatus.RELEASED, is_locked: false },
      );
    });

    it('ignore si la conversation n\'a pas de slot', async () => {
      const chat = makeChat({ window_slot: null, window_status: null });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service } = buildService(repo);
      await service.handleConversationStatusChanged({ chatId: chat.chat_id, newStatus: 'fermé' });
      // update ne doit pas être appelé (pas de slot à libérer)
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('handleConversationResultSet', () => {
    it('émet WINDOW_CRITERION_VALIDATED_EVENT avec chatId et posteId', async () => {
      const chat = makeChat({ window_status: WindowStatus.ACTIVE });
      const repo = makeChatRepo([chat]);
      repo.findOne.mockResolvedValue(chat);
      const { service, emitter } = buildService(repo);
      await service.handleConversationResultSet({ chatId: chat.chat_id, posteId: 'poste-abc' });
      expect(emitter.emit).toHaveBeenCalledWith(
        WINDOW_CRITERION_VALIDATED_EVENT,
        expect.objectContaining({ posteId: 'poste-abc', chatId: chat.chat_id }),
      );
    });

    it('ne fait rien si posteId absent', async () => {
      const repo = makeChatRepo([]);
      const { service, emitter } = buildService(repo);
      await service.handleConversationResultSet({ chatId: 'chat-1', posteId: null });
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });
});
