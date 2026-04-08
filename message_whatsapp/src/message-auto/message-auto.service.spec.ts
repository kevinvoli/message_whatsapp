import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessageAutoService } from './message-auto.service';
import { MessageAuto, AutoMessageTriggerType } from './entities/message-auto.entity';
import { AutoMessageKeyword } from './entities/auto-message-keyword.entity';
import { createMocker } from 'src/test-utils/nest-mocker';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<MessageAuto> = {}): MessageAuto {
  return {
    id: Math.random().toString(36).slice(2),
    body: 'Bonjour #name#',
    position: 1,
    actif: true,
    trigger_type: AutoMessageTriggerType.NO_RESPONSE,
    scope_type: null,
    scope_id: null,
    scope_label: null,
    client_type_target: null,
    keywords: [],
    delai: null,
    canal: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MessageAuto;
}

describe('MessageAutoService', () => {
  let service: MessageAutoService;
  let autoMessageRepo: { find: jest.Mock; findOne: jest.Mock; [key: string]: unknown };
  let keywordRepo: { find: jest.Mock; findOne: jest.Mock; [key: string]: unknown };

  beforeEach(async () => {
    autoMessageRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() };
    keywordRepo     = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageAutoService,
        { provide: getRepositoryToken(MessageAuto),        useValue: autoMessageRepo },
        { provide: getRepositoryToken(AutoMessageKeyword), useValue: keywordRepo },
      ],
    })
      .useMocker(createMocker)
      .compile();

    service = module.get(MessageAutoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getTemplateForTrigger ───────────────────────────────────────────────────

  describe('getTemplateForTrigger()', () => {
    const TRIGGER = AutoMessageTriggerType.NO_RESPONSE;
    const STEP    = 1;
    const POSTE_ID   = 'poste-abc';
    const CHANNEL_ID = 'chan-xyz';

    it('retourne null si aucun template actif', async () => {
      autoMessageRepo.find.mockResolvedValue([]);

      const result = await service.getTemplateForTrigger(TRIGGER, STEP);

      expect(result).toBeNull();
    });

    it('retourne un template global quand aucun scope spécifié', async () => {
      const global = makeTemplate();
      autoMessageRepo.find.mockResolvedValue([global]);

      const result = await service.getTemplateForTrigger(TRIGGER, STEP);

      expect(result).toBe(global);
    });

    // ─── Priorité poste > canal > global ────────────────────────────────────

    it('retourne le template scopé poste (priorité 1)', async () => {
      const globalTpl  = makeTemplate({ scope_type: null });
      const canalTpl   = makeTemplate({ scope_type: 'canal', scope_id: CHANNEL_ID });
      const posteTpl   = makeTemplate({ scope_type: 'poste', scope_id: POSTE_ID });
      autoMessageRepo.find.mockResolvedValue([globalTpl, canalTpl, posteTpl]);

      const result = await service.getTemplateForTrigger(TRIGGER, STEP, {
        posteId: POSTE_ID, channelId: CHANNEL_ID,
      });

      expect(result).toBe(posteTpl);
    });

    it('retourne le template scopé canal quand aucun poste ne correspond', async () => {
      const globalTpl = makeTemplate({ scope_type: null });
      const canalTpl  = makeTemplate({ scope_type: 'canal', scope_id: CHANNEL_ID });
      const posteAutre = makeTemplate({ scope_type: 'poste', scope_id: 'autre-poste' });
      autoMessageRepo.find.mockResolvedValue([globalTpl, canalTpl, posteAutre]);

      const result = await service.getTemplateForTrigger(TRIGGER, STEP, {
        posteId: POSTE_ID, channelId: CHANNEL_ID,
      });

      // posteAutre.scope_id !== POSTE_ID → pool poste vide → tombe sur canal
      expect(result).toBe(canalTpl);
    });

    it('retourne le template global quand aucun scope ne correspond', async () => {
      const globalTpl  = makeTemplate({ scope_type: null });
      const autrePoste = makeTemplate({ scope_type: 'poste', scope_id: 'autre' });
      const autreCanal = makeTemplate({ scope_type: 'canal', scope_id: 'autre' });
      autoMessageRepo.find.mockResolvedValue([globalTpl, autrePoste, autreCanal]);

      const result = await service.getTemplateForTrigger(TRIGGER, STEP, {
        posteId: POSTE_ID, channelId: CHANNEL_ID,
      });

      expect(result).toBe(globalTpl);
    });

    it('retourne null si aucun pool ne contient de template', async () => {
      // Template scopé à un autre poste, aucun global
      const autrePoste = makeTemplate({ scope_type: 'poste', scope_id: 'autre' });
      autoMessageRepo.find.mockResolvedValue([autrePoste]);

      const result = await service.getTemplateForTrigger(TRIGGER, STEP, {
        posteId: POSTE_ID,
      });

      expect(result).toBeNull();
    });

    // ─── Filtre client_type_target (trigger G) ───────────────────────────────

    it('filtre par client_type_target=new pour les nouveaux contacts', async () => {
      const forNew       = makeTemplate({ client_type_target: 'new', trigger_type: AutoMessageTriggerType.CLIENT_TYPE });
      const forReturning = makeTemplate({ client_type_target: 'returning', trigger_type: AutoMessageTriggerType.CLIENT_TYPE });
      const forAll       = makeTemplate({ client_type_target: 'all', trigger_type: AutoMessageTriggerType.CLIENT_TYPE });
      autoMessageRepo.find.mockResolvedValue([forNew, forReturning, forAll]);

      const result = await service.getTemplateForTrigger(
        AutoMessageTriggerType.CLIENT_TYPE, STEP, { clientTypeTarget: 'new' },
      );

      expect([forNew, forAll]).toContain(result);
      expect(result).not.toBe(forReturning);
    });

    it('filtre par client_type_target=returning pour les clients fidèles', async () => {
      const forNew       = makeTemplate({ client_type_target: 'new',       trigger_type: AutoMessageTriggerType.CLIENT_TYPE });
      const forReturning = makeTemplate({ client_type_target: 'returning', trigger_type: AutoMessageTriggerType.CLIENT_TYPE });
      autoMessageRepo.find.mockResolvedValue([forNew, forReturning]);

      const result = await service.getTemplateForTrigger(
        AutoMessageTriggerType.CLIENT_TYPE, STEP, { clientTypeTarget: 'returning' },
      );

      expect(result).toBe(forReturning);
    });

    it('tombe sur les templates "all" quand le type demandé n\'a aucun template', async () => {
      const forAll = makeTemplate({ client_type_target: 'all', trigger_type: AutoMessageTriggerType.CLIENT_TYPE });
      autoMessageRepo.find.mockResolvedValue([forAll]);

      const result = await service.getTemplateForTrigger(
        AutoMessageTriggerType.CLIENT_TYPE, STEP, { clientTypeTarget: 'new' },
      );

      expect(result).toBe(forAll);
    });

    // ─── Tirage aléatoire dans le pool ──────────────────────────────────────

    it('retourne un template du bon pool par tirage aléatoire (pas toujours le même)', async () => {
      const tpl1 = makeTemplate({ id: 'tpl1' });
      const tpl2 = makeTemplate({ id: 'tpl2' });
      const tpl3 = makeTemplate({ id: 'tpl3' });
      autoMessageRepo.find.mockResolvedValue([tpl1, tpl2, tpl3]);

      const seen = new Set<string>();
      // 50 tirages — avec 3 templates la probabilité de ne jamais avoir les 3 est (2/3)^50 ≈ 0
      for (let i = 0; i < 50; i++) {
        const r = await service.getTemplateForTrigger(TRIGGER, STEP);
        if (r) seen.add(r.id);
      }

      expect(seen.size).toBeGreaterThan(1);
    });

    // ─── Appel au repository avec les bons paramètres ───────────────────────

    it('interroge le repo avec trigger_type, position et actif=true', async () => {
      autoMessageRepo.find.mockResolvedValue([]);

      await service.getTemplateForTrigger(AutoMessageTriggerType.INACTIVITY, 2);

      expect(autoMessageRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trigger_type: AutoMessageTriggerType.INACTIVITY,
            position:     2,
            actif:        true,
          }),
        }),
      );
    });
  });
});
