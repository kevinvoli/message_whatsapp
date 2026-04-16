import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CrmService } from '../crm.service';
import { ContactFieldDefinition, FieldType } from '../entities/contact-field-definition.entity';
import { ContactFieldValue } from '../entities/contact-field-value.entity';

const mockDefRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

const mockValRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('CrmService', () => {
  let service: CrmService;
  let defRepo: ReturnType<typeof mockDefRepo>;
  let valRepo: ReturnType<typeof mockValRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmService,
        { provide: getRepositoryToken(ContactFieldDefinition), useFactory: mockDefRepo },
        { provide: getRepositoryToken(ContactFieldValue), useFactory: mockValRepo },
      ],
    }).compile();

    service = module.get(CrmService);
    defRepo = module.get(getRepositoryToken(ContactFieldDefinition));
    valRepo = module.get(getRepositoryToken(ContactFieldValue));
  });

  describe('createDefinition', () => {
    it('crée une définition avec succès', async () => {
      defRepo.findOne.mockResolvedValue(null);
      const dto = { tenant_id: 't1', name: 'Client', field_key: 'client', field_type: FieldType.TEXT };
      const entity = { id: 'def-1', ...dto };
      defRepo.create.mockReturnValue(entity);
      defRepo.save.mockResolvedValue(entity);

      const result = await service.createDefinition(dto as any);
      expect(result).toEqual(entity);
      expect(defRepo.save).toHaveBeenCalledWith(entity);
    });

    it('lève ConflictException si field_key existe déjà', async () => {
      defRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createDefinition({ tenant_id: 't1', name: 'X', field_key: 'x' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllDefinitions', () => {
    it('retourne toutes les définitions du tenant', async () => {
      const defs = [{ id: 'd1', position: 0 }, { id: 'd2', position: 1 }];
      defRepo.find.mockResolvedValue(defs);
      const result = await service.findAllDefinitions('t1');
      expect(result).toHaveLength(2);
      expect(defRepo.find).toHaveBeenCalledWith({
        where: { tenant_id: 't1' },
        order: { position: 'ASC', createdAt: 'ASC' },
      });
    });
  });

  describe('updateDefinition', () => {
    it('met à jour une définition existante', async () => {
      const def = { id: 'd1', tenant_id: 't1', name: 'Ancien', position: 0 };
      defRepo.findOne.mockResolvedValue(def);
      defRepo.save.mockResolvedValue({ ...def, name: 'Nouveau' });

      const result = await service.updateDefinition('d1', 't1', { name: 'Nouveau' });
      expect(result.name).toBe('Nouveau');
    });

    it('lève NotFoundException si définition absente', async () => {
      defRepo.findOne.mockResolvedValue(null);
      await expect(service.updateDefinition('x', 't1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeDefinition', () => {
    it('supprime une définition existante', async () => {
      defRepo.findOne.mockResolvedValue({ id: 'd1' });
      defRepo.delete.mockResolvedValue({});
      await service.removeDefinition('d1', 't1');
      expect(defRepo.delete).toHaveBeenCalledWith('d1');
    });

    it('lève NotFoundException si absent', async () => {
      defRepo.findOne.mockResolvedValue(null);
      await expect(service.removeDefinition('x', 't1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getContactFields', () => {
    it('retourne les définitions avec leurs valeurs (ou null)', async () => {
      const defs = [
        { id: 'def-1', field_type: FieldType.TEXT, position: 0 },
        { id: 'def-2', field_type: FieldType.NUMBER, position: 1 },
      ];
      const values = [{ field_id: 'def-1', value_text: 'abc' }];
      defRepo.find.mockResolvedValue(defs);
      valRepo.find.mockResolvedValue(values);

      const result = await service.getContactFields('contact-1', 't1');
      expect(result).toHaveLength(2);
      expect(result[0].value?.value_text).toBe('abc');
      expect(result[1].value).toBeNull();
    });
  });

  describe('setContactFields', () => {
    it('écrit les valeurs polymorphiques par FieldType', async () => {
      const defs = [
        { id: 'def-1', field_key: 'nom', field_type: FieldType.TEXT, position: 0 },
        { id: 'def-2', field_key: 'age', field_type: FieldType.NUMBER, position: 1 },
        { id: 'def-3', field_key: 'vip', field_type: FieldType.BOOLEAN, position: 2 },
      ];
      defRepo.find.mockResolvedValue(defs);
      valRepo.findOne.mockResolvedValue(null);
      valRepo.create.mockImplementation((v) => ({ ...v }));
      valRepo.save.mockResolvedValue({});

      await service.setContactFields('c1', 't1', {
        values: [
          { field_key: 'nom', value: 'Alice' },
          { field_key: 'age', value: 30 },
          { field_key: 'vip', value: true },
        ],
      });

      expect(valRepo.save).toHaveBeenCalledTimes(3);
    });

    it('ignore les field_key inconnus', async () => {
      defRepo.find.mockResolvedValue([{ id: 'd1', field_key: 'known', field_type: FieldType.TEXT, position: 0 }]);
      valRepo.findOne.mockResolvedValue(null);
      valRepo.create.mockImplementation((v) => ({ ...v }));
      valRepo.save.mockResolvedValue({});

      await service.setContactFields('c1', 't1', {
        values: [{ field_key: 'unknown', value: 'x' }],
      });

      expect(valRepo.save).not.toHaveBeenCalled();
    });
  });
});
