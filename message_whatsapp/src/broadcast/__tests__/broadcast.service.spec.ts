/**
 * P4.3 — Tests unitaires BroadcastService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { BroadcastService, BROADCAST_QUEUE } from '../broadcast.service';
import { WhatsappBroadcast, BroadcastStatus } from '../entities/broadcast.entity';
import {
  WhatsappBroadcastRecipient,
  RecipientStatus,
} from '../entities/broadcast-recipient.entity';

const makeBroadcast = (overrides: Partial<WhatsappBroadcast> = {}): Partial<WhatsappBroadcast> => ({
  id: 'bc-1',
  tenant_id: 't-1',
  name: 'Campagne Test',
  template_id: 'tpl-1',
  channel_id: 'ch-1',
  status: BroadcastStatus.DRAFT,
  total_count: 0,
  sent_count: 0,
  failed_count: 0,
  ...overrides,
});

describe('BroadcastService (P4.3)', () => {
  let service: BroadcastService;

  const broadcastRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(async (e) => ({ id: 'bc-1', ...e })),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
    increment: jest.fn().mockResolvedValue(undefined),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const recipientRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(async (e) => Array.isArray(e) ? e : ({ id: 'r-1', ...e })),
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findByIds: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const queueMock = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcastService,
        { provide: getRepositoryToken(WhatsappBroadcast), useValue: broadcastRepo },
        { provide: getRepositoryToken(WhatsappBroadcastRecipient), useValue: recipientRepo },
        { provide: getQueueToken(BROADCAST_QUEUE), useValue: queueMock },
      ],
    }).compile();

    service = module.get(BroadcastService);
  });

  it('create crée un broadcast en DRAFT', async () => {
    const dto = {
      tenant_id: 't-1',
      name: 'Promo Été',
      template_id: 'tpl-1',
      channel_id: 'ch-1',
    };
    await service.create(dto);
    expect(broadcastRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: BroadcastStatus.DRAFT }),
    );
  });

  it('create programme si scheduled_at fourni', async () => {
    const dto = {
      tenant_id: 't-1',
      name: 'Promo Planifiée',
      template_id: 'tpl-1',
      channel_id: 'ch-1',
      scheduled_at: '2026-12-01T10:00:00Z',
    };
    await service.create(dto);
    expect(broadcastRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: BroadcastStatus.SCHEDULED }),
    );
  });

  it('findOne lève NotFoundException si introuvable', async () => {
    broadcastRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('unknown', 't-1')).rejects.toThrow(NotFoundException);
  });

  it('addRecipients déduplique les numéros et signale les déjà présents en BDD', async () => {
    broadcastRepo.findOne.mockResolvedValue(makeBroadcast());
    // Un destinataire déjà enregistré en BDD
    recipientRepo.find.mockResolvedValue([
      { id: 'r-0', phone: '+33612345678', status: RecipientStatus.PENDING },
    ]);

    const dto = {
      recipients: [
        { phone: '+33612345678' }, // déjà en BDD → comptabilisé comme doublon
        { phone: '+33687654321' }, // nouveau
      ],
    };

    const result = await service.addRecipients('bc-1', 't-1', dto);
    expect(result.added).toBe(1);    // seul le nouveau est inséré
    expect(result.duplicates).toBe(1); // l'un était déjà en BDD
  });

  it('addRecipients rejette si statut ≠ DRAFT', async () => {
    broadcastRepo.findOne.mockResolvedValue(makeBroadcast({ status: BroadcastStatus.RUNNING }));
    await expect(
      service.addRecipients('bc-1', 't-1', { recipients: [{ phone: '+33611111111' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('launch passe le broadcast en RUNNING et enqueue des jobs', async () => {
    broadcastRepo.findOne.mockResolvedValue(makeBroadcast());
    recipientRepo.find.mockResolvedValue([
      { id: 'r-1', phone: '+33611111111', status: RecipientStatus.PENDING },
    ]);

    await service.launch('bc-1', 't-1');

    expect(broadcastRepo.update).toHaveBeenCalledWith('bc-1', expect.objectContaining({
      status: BroadcastStatus.RUNNING,
    }));
    expect(queueMock.add).toHaveBeenCalled();
  });

  it('pause lève BadRequestException si statut ≠ RUNNING', async () => {
    broadcastRepo.findOne.mockResolvedValue(makeBroadcast({ status: BroadcastStatus.DRAFT }));
    await expect(service.pause('bc-1', 't-1')).rejects.toThrow(BadRequestException);
  });

  it('cancel met en CANCELLED', async () => {
    broadcastRepo.findOne.mockResolvedValue(makeBroadcast({ status: BroadcastStatus.RUNNING }));
    await service.cancel('bc-1', 't-1');
    expect(broadcastRepo.update).toHaveBeenCalledWith('bc-1', { status: BroadcastStatus.CANCELLED });
  });
});
