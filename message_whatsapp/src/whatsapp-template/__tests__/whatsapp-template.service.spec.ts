/**
 * P4.2 — Tests unitaires WhatsappTemplateService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappTemplateService } from '../whatsapp-template.service';
import {
  WhatsappTemplate,
  TemplateStatus,
  TemplateCategory,
} from '../entities/whatsapp-template.entity';

const makeRepo = () => ({
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn(async (e) => ({ id: 'tpl-1', ...e })),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
});

describe('WhatsappTemplateService (P4.2)', () => {
  let service: WhatsappTemplateService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappTemplateService,
        { provide: getRepositoryToken(WhatsappTemplate), useValue: repo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(WhatsappTemplateService);
    jest.clearAllMocks();
  });

  it('create crée un template en statut PENDING', async () => {
    const dto = {
      tenant_id: 't-1',
      name: 'bienvenue',
      body_text: 'Bonjour {{1}}',
      category: TemplateCategory.UTILITY,
    };
    const result = await service.create(dto);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: TemplateStatus.PENDING }),
    );
  });

  it('findOne lève NotFoundException si introuvable', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne('unknown', 't-1')).rejects.toThrow(NotFoundException);
  });

  it('updateStatus met à jour le statut APPROVED', async () => {
    const entity = { id: 'tpl-1', meta_template_id: 'meta-123', name: 'bienvenue' } as WhatsappTemplate;
    repo.findOne.mockResolvedValue(entity);
    await service.updateStatus('meta-123', 'APPROVED', null);
    expect(repo.update).toHaveBeenCalledWith('tpl-1', {
      status: TemplateStatus.APPROVED,
      rejected_reason: null,
    });
  });

  it('updateStatus ignore les templates introuvables sans exception', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.updateStatus('unknown-meta', 'APPROVED', null)).resolves.not.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('updateStatus REJECTED enregistre le motif', async () => {
    const entity = { id: 'tpl-1', meta_template_id: 'meta-456', name: 'promo' } as WhatsappTemplate;
    repo.findOne.mockResolvedValue(entity);
    await service.updateStatus('meta-456', 'REJECTED', 'Contenu non conforme');
    expect(repo.update).toHaveBeenCalledWith('tpl-1', {
      status: TemplateStatus.REJECTED,
      rejected_reason: 'Contenu non conforme',
    });
  });

  it('disable marque le template DISABLED', async () => {
    const entity = { id: 'tpl-1', tenant_id: 't-1' } as WhatsappTemplate;
    repo.findOne.mockResolvedValue(entity);
    await service.disable('tpl-1', 't-1');
    expect(repo.update).toHaveBeenCalledWith('tpl-1', { status: TemplateStatus.DISABLED });
  });

  it('onTemplateStatusEvent appelle updateStatus', async () => {
    const entity = { id: 'tpl-1', meta_template_id: 'meta-789', name: 'test' } as WhatsappTemplate;
    repo.findOne.mockResolvedValue(entity);
    await service.onTemplateStatusEvent({
      metaTemplateId: 'meta-789',
      newStatus: 'APPROVED',
      reason: null,
    });
    expect(repo.update).toHaveBeenCalled();
  });
});
