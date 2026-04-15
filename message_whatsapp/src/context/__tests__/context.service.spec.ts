import { Test, TestingModule } from '@nestjs/testing';
import { ContextService } from '../services/context.service';
import { ContextResolverService } from '../services/context-resolver.service';
import { Context } from '../entities/context.entity';
import { ContextBinding } from '../entities/context-binding.entity';
import { ChatContext } from '../entities/chat-context.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

const makeCtx = (id: string): Context =>
  ({ id, label: 'test', contextType: 'CHANNEL', isActive: true, bindings: [], chatContexts: [], createdAt: new Date(), updatedAt: new Date() }) as unknown as Context;

const makeChatCtx = (id: string, chatId: string, contextId: string): ChatContext =>
  ({ id, chatId, contextId, unreadCount: 0, readOnly: false }) as ChatContext;

describe('ContextService', () => {
  let service: ContextService;

  const contextRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const bindingRepo = {
    create: jest.fn((data) => data),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const chatContextRepo = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = {};
  const resolver = { invalidate: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextService,
        { provide: getRepositoryToken(Context), useValue: contextRepo },
        { provide: getRepositoryToken(ContextBinding), useValue: bindingRepo },
        { provide: getRepositoryToken(ChatContext), useValue: chatContextRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: ContextResolverService, useValue: resolver },
      ],
    }).compile();

    service = module.get<ContextService>(ContextService);
  });

  // ─── CRUD Context ──────────────────────────────────────────────────────────

  it('CS-01 : findById → retourne le contexte', async () => {
    const ctx = makeCtx('ctx-1');
    contextRepo.findOne.mockResolvedValue(ctx);

    const result = await service.findById('ctx-1');

    expect(result.id).toBe('ctx-1');
  });

  it('CS-02 : findById → NotFoundException si absent', async () => {
    contextRepo.findOne.mockResolvedValue(null);

    await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
  });

  it('CS-03 : createContext → save appelé', async () => {
    const ctx = makeCtx('new-ctx');
    contextRepo.save.mockResolvedValue(ctx);

    const result = await service.createContext({ label: 'New', contextType: 'POOL' });

    expect(contextRepo.save).toHaveBeenCalled();
    expect(result.id).toBe('new-ctx');
  });

  // ─── Binding CRUD ──────────────────────────────────────────────────────────

  it('CS-04 : addBinding → enregistre et invalide le cache', async () => {
    contextRepo.findOne.mockResolvedValue(makeCtx('ctx-1'));
    const binding = { id: 'b-1', contextId: 'ctx-1', bindingType: 'CHANNEL', refValue: 'ch-x' } as ContextBinding;
    bindingRepo.save.mockResolvedValue(binding);

    const result = await service.addBinding('ctx-1', { bindingType: 'CHANNEL', refValue: 'ch-x' });

    expect(result.refValue).toBe('ch-x');
    expect(resolver.invalidate).toHaveBeenCalledWith('ch-x');
  });

  it('CS-05 : addBinding → ConflictException sur doublon ER_DUP_ENTRY', async () => {
    contextRepo.findOne.mockResolvedValue(makeCtx('ctx-1'));
    const dupError = new QueryFailedError('', [], new Error('dup'));
    (dupError as any).code = 'ER_DUP_ENTRY';
    bindingRepo.save.mockRejectedValue(dupError);

    await expect(
      service.addBinding('ctx-1', { bindingType: 'CHANNEL', refValue: 'ch-dup' }),
    ).rejects.toThrow(ConflictException);
  });

  it('CS-06 : removeBinding → invalide le cache', async () => {
    const binding = { id: 'b-del', contextId: 'ctx-1', bindingType: 'CHANNEL', refValue: 'ch-del' } as ContextBinding;
    bindingRepo.findOne.mockResolvedValue(binding);

    await service.removeBinding('b-del');

    expect(bindingRepo.delete).toHaveBeenCalledWith('b-del');
    expect(resolver.invalidate).toHaveBeenCalledWith('ch-del');
  });

  // ─── ChatContext findOrCreate ──────────────────────────────────────────────

  it('CS-07 : findOrCreateChatContext → retourne existant si présent', async () => {
    const cc = makeChatCtx('cc-1', 'chat@c.us', 'ctx-1');
    chatContextRepo.findOne.mockResolvedValue(cc);

    const result = await service.findOrCreateChatContext('chat@c.us', 'ctx-1');

    expect(result.id).toBe('cc-1');
    expect(chatContextRepo.save).not.toHaveBeenCalled();
  });

  it('CS-08 : findOrCreateChatContext → crée si absent', async () => {
    chatContextRepo.findOne.mockResolvedValue(null);
    const cc = makeChatCtx('cc-new', 'new@c.us', 'ctx-1');
    chatContextRepo.save.mockResolvedValue(cc);

    const result = await service.findOrCreateChatContext('new@c.us', 'ctx-1');

    expect(result.id).toBe('cc-new');
    expect(chatContextRepo.save).toHaveBeenCalled();
  });

  it('CS-09 : findOrCreateChatContext → re-fetch sur race condition ER_DUP_ENTRY', async () => {
    // Premier findOne : null (pas encore créé)
    chatContextRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeChatCtx('cc-race', 'race@c.us', 'ctx-1'));

    const dupError = new QueryFailedError('', [], new Error('dup'));
    (dupError as any).code = 'ER_DUP_ENTRY';
    chatContextRepo.save.mockRejectedValue(dupError);

    const result = await service.findOrCreateChatContext('race@c.us', 'ctx-1');

    expect(result.id).toBe('cc-race');
    expect(chatContextRepo.findOne).toHaveBeenCalledTimes(2);
  });

  // ─── updateChatContext ─────────────────────────────────────────────────────

  it('CS-10 : updateChatContext → met à jour et retourne le CC mis à jour', async () => {
    const updated = makeChatCtx('cc-upd', 'upd@c.us', 'ctx-1');
    chatContextRepo.findOne.mockResolvedValue(updated);

    const result = await service.updateChatContext('cc-upd', { unreadCount: 5, readOnly: false });

    expect(chatContextRepo.update).toHaveBeenCalledWith('cc-upd', { unreadCount: 5, readOnly: false });
    expect(result.id).toBe('cc-upd');
  });

  it('CS-11 : updateChatContext → NotFoundException si CC absent après update', async () => {
    chatContextRepo.findOne.mockResolvedValue(null);

    await expect(service.updateChatContext('missing', {})).rejects.toThrow(NotFoundException);
  });
});
