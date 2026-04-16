import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SlaService } from '../sla.service';
import { SlaRule, SlaMetric, SlaSeverity } from '../entities/sla-rule.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

describe('SlaService', () => {
  let service: SlaService;
  let ruleRepo: ReturnType<typeof mockRepo>;
  let chatRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaService,
        { provide: getRepositoryToken(SlaRule), useFactory: mockRepo },
        { provide: getRepositoryToken(WhatsappChat), useFactory: mockRepo },
        { provide: getRepositoryToken(WhatsappMessage), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(SlaService);
    ruleRepo = module.get(getRepositoryToken(SlaRule));
    chatRepo = module.get(getRepositoryToken(WhatsappChat));
  });

  describe('createRule', () => {
    it('crée une règle SLA avec succès', async () => {
      ruleRepo.findOne.mockResolvedValue(null);
      const dto = { tenant_id: 't1', name: 'SLA réponse', metric: SlaMetric.FIRST_RESPONSE, threshold_seconds: 3600 };
      const rule = { id: 'r1', ...dto };
      ruleRepo.create.mockReturnValue(rule);
      ruleRepo.save.mockResolvedValue(rule);

      const result = await service.createRule(dto);
      expect(result.metric).toBe(SlaMetric.FIRST_RESPONSE);
    });

    it('lève ConflictException si métrique déjà définie', async () => {
      ruleRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createRule({ tenant_id: 't1', name: 'X', metric: SlaMetric.FIRST_RESPONSE, threshold_seconds: 1800 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateRule', () => {
    it('met à jour une règle existante', async () => {
      const rule = { id: 'r1', tenant_id: 't1', threshold_seconds: 3600 };
      ruleRepo.findOne.mockResolvedValue(rule);
      ruleRepo.save.mockResolvedValue({ ...rule, threshold_seconds: 1800 });

      const result = await service.updateRule('r1', 't1', { threshold_seconds: 1800 });
      expect(result.threshold_seconds).toBe(1800);
    });

    it('lève NotFoundException si règle absente', async () => {
      ruleRepo.findOne.mockResolvedValue(null);
      await expect(service.updateRule('x', 't1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluateChat', () => {
    it('retourne tableau vide si pas de règles actives', async () => {
      ruleRepo.find.mockResolvedValue([]);
      const result = await service.evaluateChat('chat-1', 't1');
      expect(result).toHaveLength(0);
    });

    it('détecte une violation FIRST_RESPONSE', async () => {
      const now = Date.now();
      const rule: Partial<SlaRule> = {
        id: 'r1',
        metric: SlaMetric.FIRST_RESPONSE,
        threshold_seconds: 60, // 1 minute
        is_active: true,
        severity: SlaSeverity.BREACH,
        notify_admin: true,
      };
      ruleRepo.find.mockResolvedValue([rule]);
      chatRepo.findOne.mockResolvedValue({
        id: 'chat-1',
        createdAt: new Date(now - 120_000), // il y a 2 minutes
        last_client_message_at: new Date(now - 120_000),
        last_poste_message_at: null, // pas encore répondu
      });

      const result = await service.evaluateChat('chat-1', 't1');
      expect(result).toHaveLength(1);
      expect(result[0].breached).toBe(true);
      expect(result[0].currentValueSeconds).toBeGreaterThan(60);
    });

    it('ne signale pas de violation si sous le seuil', async () => {
      const now = Date.now();
      const rule: Partial<SlaRule> = {
        id: 'r1',
        metric: SlaMetric.FIRST_RESPONSE,
        threshold_seconds: 3600, // 1 heure
        is_active: true,
      };
      ruleRepo.find.mockResolvedValue([rule]);
      chatRepo.findOne.mockResolvedValue({
        id: 'chat-1',
        createdAt: new Date(now - 60_000), // il y a 1 minute
        last_client_message_at: new Date(now - 60_000),
        last_poste_message_at: null,
      });

      const result = await service.evaluateChat('chat-1', 't1');
      expect(result[0].breached).toBe(false);
    });
  });
});
