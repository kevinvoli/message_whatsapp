/**
 * P3.3 — Tests unitaires LabelService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LabelService } from '../label.service';
import { Label } from '../entities/label.entity';
import { ChatLabelAssignment } from '../entities/chat-label-assignment.entity';

const makeLabelRepo = () => ({
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn(async (e) => ({ id: 'label-1', ...e })),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  softDelete: jest.fn().mockResolvedValue(undefined),
});

const makeAssignRepo = () => ({
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn(async (e) => Array.isArray(e) ? e.map((x, i) => ({ id: `a-${i}`, ...x })) : ({ id: 'a-1', ...e })),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  count: jest.fn().mockResolvedValue(0),
});

describe('LabelService (P3.3)', () => {
  let service: LabelService;
  let labelRepo: ReturnType<typeof makeLabelRepo>;
  let assignRepo: ReturnType<typeof makeAssignRepo>;

  beforeEach(async () => {
    labelRepo = makeLabelRepo();
    assignRepo = makeAssignRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelService,
        { provide: getRepositoryToken(Label), useValue: labelRepo },
        { provide: getRepositoryToken(ChatLabelAssignment), useValue: assignRepo },
      ],
    }).compile();

    service = module.get(LabelService);
    jest.clearAllMocks();
  });

  it('createLabel crée un nouveau label', async () => {
    labelRepo.findOne.mockResolvedValue(null);
    const result = await service.createLabel({ tenant_id: 't-1', name: 'VIP', color: '#FF0000' });
    expect(labelRepo.save).toHaveBeenCalled();
    expect(result.name).toBe('VIP');
  });

  it('createLabel lève ConflictException si nom déjà pris', async () => {
    labelRepo.findOne.mockResolvedValue({ id: 'l-1', name: 'VIP' } as Label);
    await expect(
      service.createLabel({ tenant_id: 't-1', name: 'VIP' }),
    ).rejects.toThrow(ConflictException);
  });

  it('findOneLabel lève NotFoundException si introuvable', async () => {
    labelRepo.findOne.mockResolvedValue(null);
    await expect(service.findOneLabel('unknown', 't-1')).rejects.toThrow(NotFoundException);
  });

  it('assignLabel est idempotent', async () => {
    labelRepo.findOne.mockResolvedValue({ id: 'l-1' } as Label);
    assignRepo.findOne.mockResolvedValue({ id: 'a-1' } as ChatLabelAssignment);
    const result = await service.assignLabel('chat-1', 'l-1', 't-1');
    expect(assignRepo.save).not.toHaveBeenCalled();
    expect(result.id).toBe('a-1');
  });

  it('assignLabel crée une assignation si elle n\'existe pas', async () => {
    labelRepo.findOne.mockResolvedValue({ id: 'l-1' } as Label);
    assignRepo.findOne.mockResolvedValue(null);
    assignRepo.save.mockResolvedValue({ id: 'a-new', chat_id: 'chat-1', label_id: 'l-1' });
    const result = await service.assignLabel('chat-1', 'l-1', 't-1');
    expect(assignRepo.save).toHaveBeenCalled();
  });

  it('setLabelsForChat supprime les anciennes et recrée les nouvelles', async () => {
    labelRepo.findOne.mockResolvedValue({ id: 'l-1' } as Label);
    assignRepo.find.mockResolvedValue([]);
    await service.setLabelsForChat('chat-1', ['l-1'], 't-1');
    expect(assignRepo.delete).toHaveBeenCalledWith({ chat_id: 'chat-1' });
    expect(assignRepo.save).toHaveBeenCalled();
  });

  it('setLabelsForChat avec liste vide supprime tout', async () => {
    assignRepo.find.mockResolvedValue([]);
    const result = await service.setLabelsForChat('chat-1', [], 't-1');
    expect(assignRepo.delete).toHaveBeenCalledWith({ chat_id: 'chat-1' });
    expect(result).toEqual([]);
  });
});
