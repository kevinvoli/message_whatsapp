import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from '../analytics.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';

const qbMock = () => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  setParameters: jest.fn().mockReturnThis(),
  getRawOne: jest.fn(),
  getRawMany: jest.fn(),
  getMany: jest.fn(),
});

const repoMock = () => ({
  createQueryBuilder: jest.fn().mockReturnValue(qbMock()),
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let chatQb: ReturnType<typeof qbMock>;
  let msgQb: ReturnType<typeof qbMock>;
  let channelQb: ReturnType<typeof qbMock>;
  let agentQb: ReturnType<typeof qbMock>;

  beforeEach(async () => {
    const chatRepo = repoMock();
    const msgRepo = repoMock();
    const channelRepo = repoMock();
    const agentRepo = repoMock();

    chatQb = chatRepo.createQueryBuilder();
    msgQb = msgRepo.createQueryBuilder();
    channelQb = channelRepo.createQueryBuilder();
    agentQb = agentRepo.createQueryBuilder();

    chatRepo.createQueryBuilder.mockReturnValue(chatQb);
    msgRepo.createQueryBuilder.mockReturnValue(msgQb);
    channelRepo.createQueryBuilder.mockReturnValue(channelQb);
    agentRepo.createQueryBuilder.mockReturnValue(agentQb);

    const callLogRepo = repoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepo },
        { provide: getRepositoryToken(WhatsappMessage), useValue: msgRepo },
        { provide: getRepositoryToken(WhapiChannel), useValue: channelRepo },
        { provide: getRepositoryToken(WhatsappCommercial), useValue: agentRepo },
        { provide: getRepositoryToken(CallLog), useValue: callLogRepo },
        { provide: getRepositoryToken(FollowUp), useValue: repoMock() },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  describe('getSummary', () => {
    it('retourne les KPIs résumé avec valeurs par défaut si données vides', async () => {
      chatQb.getRawOne.mockResolvedValue({ total: '0', open: '0', closed: '0' });
      msgQb.getRawOne.mockResolvedValue({ total: '10', msg_in: '6', msg_out: '4' });

      const result = await service.getSummary('t1', '2026-01-01', '2026-01-31');

      expect(result.totalConversations).toBe(0);
      expect(result.totalMessages).toBe(10);
      expect(result.messagesIn).toBe(6);
      expect(result.messagesOut).toBe(4);
      expect(result.avgFirstResponseTimeSeconds).toBe(0);
      expect(result.avgResolutionTimeSeconds).toBe(0);
    });

    it('calcule correctement les temps moyens', async () => {
      chatQb.getRawOne
        .mockResolvedValueOnce({ total: '5', open: '2', closed: '3' })
        .mockResolvedValueOnce({ avg_seconds: '600' });
      msgQb.getRawOne
        .mockResolvedValueOnce({ total: '50', msg_in: '30', msg_out: '20' })
        .mockResolvedValueOnce({ avg_seconds: '120' });

      const result = await service.getSummary('t1');
      expect(result.totalConversations).toBe(5);
      expect(result.closedConversations).toBe(3);
    });
  });

  describe('getConversationVolume', () => {
    it('retourne le volume par jour', async () => {
      chatQb.getRawMany.mockResolvedValue([
        { date: '2026-01-01', total: '5', opened: '3', closed: '2', avg_res: '300' },
        { date: '2026-01-02', total: '8', opened: '5', closed: '3', avg_res: '500' },
      ]);

      const result = await service.getConversationVolume('t1', '2026-01-01', '2026-01-02');
      expect(result).toHaveLength(2);
      expect(result[0].total).toBe(5);
      expect(result[1].avgResolutionSeconds).toBe(500);
    });
  });

  describe('getAgentPerformance', () => {
    it('retourne tableau vide si aucun message sortant', async () => {
      msgQb.getRawMany.mockResolvedValue([]);
      const result = await service.getAgentPerformance('t1');
      expect(result).toHaveLength(0);
    });

    it('retourne les stats par agent', async () => {
      msgQb.getRawMany
        .mockResolvedValueOnce([{ cid: 'agent-1', sent: '20', chats: '5' }])
        .mockResolvedValueOnce([{ cid: 'agent-1', avg: '90' }]);
      agentQb.getRawMany.mockResolvedValue([{ id: 'agent-1', name: 'Alice', poste_name: 'Support' }]);

      const result = await service.getAgentPerformance('t1');
      expect(result).toHaveLength(1);
      expect(result[0].agentName).toBe('Alice');
      expect(result[0].messagesOut).toBe(20);
      expect(result[0].avgResponseSeconds).toBe(90);
    });
  });

  describe('getChannelBreakdown', () => {
    it('retourne tableau vide si aucun message', async () => {
      msgQb.getRawMany.mockResolvedValue([]);
      const result = await service.getChannelBreakdown('t1');
      expect(result).toHaveLength(0);
    });

    it('retourne la répartition par canal', async () => {
      msgQb.getRawMany.mockResolvedValue([
        { channel_id: 'ch-1', total: '100', msg_in: '60', msg_out: '40', nb_chats: '10' },
      ]);
      channelQb.getMany.mockResolvedValue([
        { channel_id: 'ch-1', label: 'WhatsApp Principal', provider: 'whapi' },
      ]);

      const result = await service.getChannelBreakdown('t1');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('WhatsApp Principal');
      expect(result[0].totalMessages).toBe(100);
    });
  });
});
