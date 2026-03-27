import { NotFoundException } from '@nestjs/common';
import { CannedResponsesService } from '../canned-responses.service';
import { CannedResponse } from '../entities/canned-response.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<CannedResponse> = {}): CannedResponse {
  return {
    id: 'uuid-1',
    tenantId: null,
    shortcut: '/bonjour',
    title: 'Salutation',
    content: 'Bonjour, comment puis-je vous aider ?',
    category: 'Accueil',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as CannedResponse;
}

// ── Mock repository ───────────────────────────────────────────────────────────

function makeRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CannedResponsesService', () => {
  let service: CannedResponsesService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new CannedResponsesService(repo as any);
    jest.clearAllMocks();
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('retourne toutes les réponses sans filtre', async () => {
      const items = [makeEntity()];
      repo.find.mockResolvedValue(items);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({
        where: {},
        order: { category: 'ASC', shortcut: 'ASC' },
      });
      expect(result).toBe(items);
    });

    it('filtre par catégorie', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll(undefined, 'SAV');

      expect(repo.find).toHaveBeenCalledWith({
        where: { category: 'SAV' },
        order: { category: 'ASC', shortcut: 'ASC' },
      });
    });

    it('utilise ILike pour la recherche full-text', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll('bon');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([
            expect.objectContaining({ shortcut: expect.anything() }),
          ]),
        }),
      );
    });
  });

  // ── findByShortcutPrefix ──────────────────────────────────────────────────

  describe('findByShortcutPrefix', () => {
    it('retourne les 20 premières si prefix vide', async () => {
      repo.find.mockResolvedValue([]);

      await service.findByShortcutPrefix('');

      expect(repo.find).toHaveBeenCalledWith({
        order: { shortcut: 'ASC' },
        take: 20,
      });
    });

    it('filtre par préfixe avec ILike et limite à 10', async () => {
      const items = [makeEntity()];
      repo.find.mockResolvedValue(items);

      const result = await service.findByShortcutPrefix('/bon');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shortcut: expect.anything() },
          take: 10,
        }),
      );
      expect(result).toBe(items);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('préfixe le raccourci avec "/" si absent', async () => {
      const entity = makeEntity({ shortcut: '/bonjour' });
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.create({
        shortcut: 'bonjour',
        title: 'Salutation',
        content: 'Bonjour',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ shortcut: '/bonjour' }),
      );
      expect(result).toBe(entity);
    });

    it('conserve "/" si déjà présent dans le raccourci', async () => {
      const entity = makeEntity();
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.create({
        shortcut: '/bonjour',
        title: 'Salutation',
        content: 'Bonjour',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ shortcut: '/bonjour' }),
      );
    });

    it('stocke null pour category si absent', async () => {
      const entity = makeEntity({ category: null });
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.create({ shortcut: '/test', title: 'T', content: 'C' });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: null }),
      );
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('met à jour les champs fournis et sauvegarde', async () => {
      const entity = makeEntity();
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, title: 'Nouveau titre' });

      const result = await service.update('uuid-1', { title: 'Nouveau titre' });

      expect(repo.save).toHaveBeenCalled();
      expect(result.title).toBe('Nouveau titre');
    });

    it('préfixe le raccourci avec "/" lors de la mise à jour', async () => {
      const entity = makeEntity();
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockImplementation(async (e: any) => e);

      await service.update('uuid-1', { shortcut: 'aurevoir' });

      expect(entity.shortcut).toBe('/aurevoir');
    });

    it('lève NotFoundException si la réponse n\'existe pas', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.update('inconnue', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('supprime l\'entité existante', async () => {
      repo.delete.mockResolvedValue({ affected: 1 });

      await expect(service.remove('uuid-1')).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith('uuid-1');
    });

    it('lève NotFoundException si rien n\'a été supprimé', async () => {
      repo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove('fantome')).rejects.toThrow(NotFoundException);
    });
  });
});
