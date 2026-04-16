import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RbacService } from '../rbac.service';
import { Role, Permission } from '../entities/role.entity';
import { CommercialRole } from '../entities/commercial-role.entity';
import { REDIS_CLIENT } from 'src/redis/redis.module';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

describe('RbacService', () => {
  let service: RbacService;
  let roleRepo: ReturnType<typeof mockRepo>;
  let comRoleRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(Role), useFactory: mockRepo },
        { provide: getRepositoryToken(CommercialRole), useFactory: mockRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(RbacService);
    roleRepo = module.get(getRepositoryToken(Role));
    comRoleRepo = module.get(getRepositoryToken(CommercialRole));
  });

  describe('createRole', () => {
    it('crée un rôle avec succès', async () => {
      roleRepo.findOne.mockResolvedValue(null);
      const dto = { tenant_id: 't1', name: 'Agent', permissions: [Permission.CHAT_VIEW] };
      const role = { id: 'r1', ...dto };
      roleRepo.create.mockReturnValue(role);
      roleRepo.save.mockResolvedValue(role);

      const result = await service.createRole(dto);
      expect(result.name).toBe('Agent');
    });

    it('lève ConflictException si nom déjà pris', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createRole({ tenant_id: 't1', name: 'Agent', permissions: [] }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateRole', () => {
    it('refuse la modification d\'un rôle système', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'r1', is_system: true });
      await expect(service.updateRole('r1', 't1', { name: 'New' })).rejects.toThrow(ForbiddenException);
    });

    it('met à jour un rôle normal', async () => {
      const role = { id: 'r1', tenant_id: 't1', is_system: false, permissions: [] };
      roleRepo.findOne.mockResolvedValue(role);
      roleRepo.save.mockResolvedValue({ ...role, name: 'Superviseur' });
      mockRedis.keys.mockResolvedValue([]);

      const result = await service.updateRole('r1', 't1', { name: 'Superviseur' });
      expect(result.name).toBe('Superviseur');
    });
  });

  describe('removeRole', () => {
    it('refuse la suppression d\'un rôle système', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'r1', is_system: true });
      await expect(service.removeRole('r1', 't1')).rejects.toThrow(ForbiddenException);
    });

    it('supprime un rôle normal', async () => {
      roleRepo.findOne.mockResolvedValue({ id: 'r1', is_system: false });
      roleRepo.delete.mockResolvedValue({});
      mockRedis.keys.mockResolvedValue([]);
      await expect(service.removeRole('r1', 't1')).resolves.toBeUndefined();
    });
  });

  describe('getPermissions', () => {
    it('retourne le cache Redis si disponible', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify([Permission.CHAT_VIEW, Permission.CHAT_REPLY]));
      const result = await service.getPermissions('c1', 't1');
      expect(result).toContain(Permission.CHAT_VIEW);
      expect(comRoleRepo.findOne).not.toHaveBeenCalled();
    });

    it('interroge la DB si cache manquant et met en cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      comRoleRepo.findOne.mockResolvedValue({
        role: { permissions: [Permission.ANALYTICS_VIEW] },
      });

      const result = await service.getPermissions('c1', 't1');
      expect(result).toContain(Permission.ANALYTICS_VIEW);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('retourne [] si commercial sans rôle', async () => {
      mockRedis.get.mockResolvedValue(null);
      comRoleRepo.findOne.mockResolvedValue(null);
      const result = await service.getPermissions('c1', 't1');
      expect(result).toHaveLength(0);
    });
  });

  describe('hasPermission', () => {
    it('retourne true si permission présente', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify([Permission.CHAT_VIEW]));
      expect(await service.hasPermission('c1', 't1', Permission.CHAT_VIEW)).toBe(true);
    });

    it('retourne false si permission absente', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify([Permission.CHAT_VIEW]));
      expect(await service.hasPermission('c1', 't1', Permission.ADMIN_PANEL)).toBe(false);
    });
  });
});
