/**
 * P3.2 — Tests unitaires ConversationTransferService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationTransferService } from '../conversation-transfer.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';

const makeChat = (overrides: Partial<WhatsappChat> = {}): Partial<WhatsappChat> => ({
  id: 'chat-uuid-1',
  chat_id: 'chat-1',
  poste_id: 'poste-a',
  status: WhatsappChatStatus.ACTIF,
  ...overrides,
});

const makePoste = (overrides: Partial<WhatsappPoste> = {}): Partial<WhatsappPoste> => ({
  id: 'poste-b',
  name: 'Service B',
  is_active: true,
  ...overrides,
});

describe('ConversationTransferService (P3.2)', () => {
  let service: ConversationTransferService;

  const chatRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const posteRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const publisherMock = {
    emitConversationReassigned: jest.fn().mockResolvedValue(undefined),
    emitConversationAssigned: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationTransferService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepo },
        { provide: getRepositoryToken(WhatsappPoste), useValue: posteRepo },
        { provide: ConversationPublisher, useValue: publisherMock },
      ],
    }).compile();

    service = module.get(ConversationTransferService);
  });

  it('transfère vers un poste actif valide', async () => {
    const updatedChat = makeChat({ poste_id: 'poste-b' });
    chatRepo.findOne
      .mockResolvedValueOnce(makeChat())   // lookup source
      .mockResolvedValueOnce(updatedChat);  // reload après update
    posteRepo.findOne.mockResolvedValue(makePoste());

    const result = await service.transfer('chat-1', 'poste-b');
    expect(chatRepo.update).toHaveBeenCalledWith(
      'chat-uuid-1',
      expect.objectContaining({ poste_id: 'poste-b' }),
    );
    expect(publisherMock.emitConversationReassigned).toHaveBeenCalled();
  });

  it('lève BadRequestException si conversation fermée', async () => {
    chatRepo.findOne.mockResolvedValue(makeChat({ status: WhatsappChatStatus.FERME }));
    await expect(service.transfer('chat-1', 'poste-b')).rejects.toThrow(BadRequestException);
  });

  it('lève BadRequestException si même poste', async () => {
    chatRepo.findOne.mockResolvedValue(makeChat({ poste_id: 'poste-b' }));
    await expect(service.transfer('chat-1', 'poste-b')).rejects.toThrow(BadRequestException);
  });

  it('lève NotFoundException si conversation introuvable', async () => {
    chatRepo.findOne.mockResolvedValue(null);
    await expect(service.transfer('unknown', 'poste-b')).rejects.toThrow(NotFoundException);
  });

  it('lève NotFoundException si poste destination introuvable', async () => {
    chatRepo.findOne.mockResolvedValue(makeChat());
    posteRepo.findOne.mockResolvedValue(null);
    await expect(service.transfer('chat-1', 'poste-unknown')).rejects.toThrow(NotFoundException);
  });

  it('liste les postes disponibles en excluant le poste actuel', async () => {
    await service.listPossibleTargets('t-1', 'poste-a');
    expect(posteRepo.createQueryBuilder().andWhere).toHaveBeenCalledWith(
      'p.id != :excludePosteId',
      { excludePosteId: 'poste-a' },
    );
  });
});
