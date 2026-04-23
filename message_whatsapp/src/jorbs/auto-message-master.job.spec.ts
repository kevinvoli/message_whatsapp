import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AutoMessageMasterJob } from './auto-message-master.job';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AutoMessageKeyword, KeywordMatchType } from 'src/message-auto/entities/auto-message-keyword.entity';
import { CronConfig } from './entities/cron-config.entity';
import { createMocker } from 'src/test-utils/nest-mocker';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<CronConfig> = {}): CronConfig {
  return {
    id: '1',
    key: 'test-trigger',
    label: 'Test',
    description: null,
    enabled: true,
    scheduleType: 'config' as CronConfig['scheduleType'],
    intervalMinutes: null,
    cronExpression: null,
    ttlDays: null,
    delayMinSeconds: null,
    delayMaxSeconds: null,
    maxSteps: 1,
    noResponseThresholdMinutes: 60,
    queueWaitThresholdMinutes: 30,
    inactivityThresholdMinutes: 120,
    applyToReadOnly: false,
    applyToClosed: false,
    activeHourStart: null,
    activeHourEnd: null,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as CronConfig;
}

function makeKeyword(overrides: Partial<AutoMessageKeyword> = {}): AutoMessageKeyword {
  return {
    id: Math.random().toString(36).slice(2),
    keyword: 'aide',
    matchType: KeywordMatchType.CONTAINS,
    caseSensitive: false,
    actif: true,
    messageAutoId: 'tpl1',
    messageAuto: { id: 'tpl1', position: 1 } as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AutoMessageKeyword;
}

describe('AutoMessageMasterJob', () => {
  let job: AutoMessageMasterJob;
  let chatRepo: { createQueryBuilder: jest.Mock; find: jest.Mock; [k: string]: unknown };
  let keywordRepo: { find: jest.Mock; [k: string]: unknown };
  let businessHoursService: { isCurrentlyOpen: jest.Mock; [k: string]: unknown };
  let messageAutoService: { sendAutoMessageForTrigger: jest.Mock; [k: string]: unknown };
  let scopeConfigService: { isEnabledFor: jest.Mock; [k: string]: unknown };
  const loggerMock = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() };

  beforeEach(async () => {
    chatRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where:             jest.fn().mockReturnThis(),
        andWhere:          jest.fn().mockReturnThis(),
        limit:             jest.fn().mockReturnThis(),
        getMany:           jest.fn().mockResolvedValue([]),
      }),
      find: jest.fn().mockResolvedValue([]),
    };
    keywordRepo          = { find: jest.fn().mockResolvedValue([]) };
    businessHoursService = { isCurrentlyOpen: jest.fn().mockResolvedValue(false) };
    messageAutoService   = { sendAutoMessageForTrigger: jest.fn().mockResolvedValue(undefined) };
    scopeConfigService   = { isEnabledFor: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoMessageMasterJob,
        { provide: getRepositoryToken(WhatsappChat),        useValue: chatRepo },
        { provide: getRepositoryToken(AutoMessageKeyword),  useValue: keywordRepo },
      ],
    })
      .useMocker((token) => {
        if (typeof token === 'function' && token.name === 'BusinessHoursService') return businessHoursService;
        if (typeof token === 'function' && token.name === 'MessageAutoService')    return messageAutoService;
        if (typeof token === 'function' && token.name === 'AutoMessageScopeConfigService') return scopeConfigService;
        if (typeof token === 'function' && token.name === 'AppLogger') return loggerMock;
        return createMocker(token);
      })
      .compile();

    job = module.get(AutoMessageMasterJob);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  // ─── matchesKeyword ──────────────────────────────────────────────────────────

  describe('matchesKeyword()', () => {
    it('matchType=contains : trouve le mot-clé dans le texte', () => {
      const kw = makeKeyword({ keyword: 'aide', matchType: KeywordMatchType.CONTAINS, caseSensitive: false });
      expect((job as any).matchesKeyword("j'ai besoin d'aide svp", kw)).toBe(true);
    });

    it('matchType=contains : retourne false si absent', () => {
      const kw = makeKeyword({ keyword: 'aide', matchType: KeywordMatchType.CONTAINS, caseSensitive: false });
      expect((job as any).matchesKeyword('Bonjour, ça va ?', kw)).toBe(false);
    });

    it('matchType=exact : correspond uniquement si le texte entier est le mot-clé', () => {
      const kw = makeKeyword({ keyword: 'aide', matchType: KeywordMatchType.EXACT, caseSensitive: false });
      expect((job as any).matchesKeyword('aide', kw)).toBe(true);
      expect((job as any).matchesKeyword("j'ai besoin d'aide", kw)).toBe(false);
    });

    it('matchType=starts_with : correspond si le texte commence par le mot-clé', () => {
      const kw = makeKeyword({ keyword: 'urgence', matchType: KeywordMatchType.STARTS_WITH, caseSensitive: false });
      expect((job as any).matchesKeyword('urgence absolue !', kw)).toBe(true);
      expect((job as any).matchesKeyword("c'est une urgence", kw)).toBe(false);
    });

    it('insensible à la casse quand caseSensitive=false', () => {
      const kw = makeKeyword({ keyword: 'Aide', matchType: KeywordMatchType.CONTAINS, caseSensitive: false });
      expect((job as any).matchesKeyword("besoin d'AIDE", kw)).toBe(true);
    });

    it('sensible à la casse quand caseSensitive=true', () => {
      const kw = makeKeyword({ keyword: 'Aide', matchType: KeywordMatchType.CONTAINS, caseSensitive: true });
      expect((job as any).matchesKeyword("besoin d'aide", kw)).toBe(false);
      expect((job as any).matchesKeyword("besoin d'Aide", kw)).toBe(true);
    });

    it('fonctionne avec des mots-clés multi-mots (contains)', () => {
      const kw = makeKeyword({ keyword: 'code promo', matchType: KeywordMatchType.CONTAINS, caseSensitive: false });
      expect((job as any).matchesKeyword("J'ai un code promo à utiliser", kw)).toBe(true);
    });
  });

  // ─── Trigger A — guard conditions ───────────────────────────────────────────

  describe('runTriggerA() — Sans réponse', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerA(undefined);
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerA(makeConfig({ enabled: false }));
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('déclenche une query quand config est activée', async () => {
      await (job as any).runTriggerA(makeConfig({ enabled: true }));
      expect(chatRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  // ─── Trigger C — guard conditions ───────────────────────────────────────────

  describe('runTriggerC() — Hors horaires', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerC(undefined, new Date());
      expect(businessHoursService.isCurrentlyOpen).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerC(makeConfig({ enabled: false }), new Date());
      expect(businessHoursService.isCurrentlyOpen).not.toHaveBeenCalled();
    });

    it('ne fait rien quand les horaires sont ouverts', async () => {
      businessHoursService.isCurrentlyOpen.mockResolvedValue(true);

      await (job as any).runTriggerC(makeConfig({ enabled: true }), new Date());

      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('déclenche une query quand les horaires sont fermés', async () => {
      businessHoursService.isCurrentlyOpen.mockResolvedValue(false);

      await (job as any).runTriggerC(makeConfig({ enabled: true }), new Date());

      expect(chatRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  // ─── Trigger D — guard conditions ───────────────────────────────────────────

  describe('runTriggerD() — Réouverture', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerD(undefined, new Date());
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerD(makeConfig({ enabled: false }), new Date());
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── Trigger E — guard conditions ───────────────────────────────────────────

  describe('runTriggerE() — File d\'attente', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerE(undefined);
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerE(makeConfig({ enabled: false }));
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── Trigger F — guard conditions & flux ────────────────────────────────────

  describe('runTriggerF() — Mot-clé', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerF(undefined, new Date());
      expect(keywordRepo.find).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerF(makeConfig({ enabled: false }), new Date());
      expect(keywordRepo.find).not.toHaveBeenCalled();
    });

    it('ne fait rien quand aucun mot-clé actif n\'existe', async () => {
      keywordRepo.find.mockResolvedValue([]);

      await (job as any).runTriggerF(makeConfig({ enabled: true }), new Date());

      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('interroge les chats quand des mots-clés existent', async () => {
      keywordRepo.find.mockResolvedValue([makeKeyword()]);

      await (job as any).runTriggerF(makeConfig({ enabled: true }), new Date());

      expect(chatRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  // ─── Trigger G — guard conditions ───────────────────────────────────────────

  describe('runTriggerG() — Type de client', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerG(undefined, new Date());
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerG(makeConfig({ enabled: false }), new Date());
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── Trigger H — guard conditions ───────────────────────────────────────────

  describe('runTriggerH() — Inactivité', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerH(undefined);
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerH(makeConfig({ enabled: false }));
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── Trigger I — guard conditions ───────────────────────────────────────────

  describe('runTriggerI() — Assignation', () => {
    it('ne fait rien quand config est undefined', async () => {
      await (job as any).runTriggerI(undefined, new Date());
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('ne fait rien quand config.enabled = false', async () => {
      await (job as any).runTriggerI(makeConfig({ enabled: false }), new Date());
      expect(chatRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── safeRun — isolation des erreurs ────────────────────────────────────────

  describe('safeRun()', () => {
    it('absorbe les erreurs sans les propager', async () => {
      const failing = jest.fn().mockRejectedValue(new Error('Boom'));

      // Ne doit pas throw
      await expect(
        (job as any).safeRun('test-trigger', failing),
      ).resolves.toBeUndefined();
    });

    it('exécute la fonction fournie', async () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      await (job as any).safeRun('test-trigger', fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
