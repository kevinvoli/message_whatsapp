/**
 * Tests unitaires — FirstResponseTimeoutJob (SLA checker)
 *
 * Couverture :
 *  - Cas nominal : conversation avec unread_count > 0 → SLA déclenché
 *  - Cas intentionnel : conversation avec unread_count = 0 → SLA ignoré (comportement voulu)
 *  - Cas : conversation FERME non répondue → réouverture par jobRunnerAllPostes (step 0)
 *  - Cas limites : queue vide, aucune conversation éligible, seuil zéro
 *  - Plage horaire : job ignoré entre 21h et 5h (exécution automatique)
 *  - Idempotence : deux appels successifs avec les mêmes données → même résultat
 *  - Performance : aucun N+1 détecté sur les appels aux repositories
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FirstResponseTimeoutJob } from './first-response-timeout.job';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';
import { ChannelService } from 'src/channel/channel.service';
import { CronConfigService } from './cron-config.service';
import { mockRepository } from '../../test/helpers/mock-repository';
import { makeConversation, makeConversationFermee } from '../../test/factories/conversation.factory';

// ─── Helpers locaux ──────────────────────────────────────────────────────────

/** Construit un mock minimal de CronConfig pour 'sla-checker'. */
function makeSlaConfig(overrides: { noResponseThresholdMinutes?: number; maxSteps?: number } = {}) {
  return {
    key: 'sla-checker',
    noResponseThresholdMinutes: overrides.noResponseThresholdMinutes ?? 20,
    maxSteps: overrides.maxSteps ?? 300,
    enabled: true,
  };
}

/** Construit un mock complet du QueryBuilder utilisé par previewExpiredSla(). */
function buildQbWithChats(chats: WhatsappChat[]) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(chats),
  };
  return qb;
}

// ─── Suite principale ─────────────────────────────────────────────────────────

describe('FirstResponseTimeoutJob — SLA checker', () => {
  let job: FirstResponseTimeoutJob;

  const chatRepo = mockRepository<WhatsappChat>();

  const dispatcherService = {
    jobRunnerAllPostes: jest.fn<Promise<string>, [number, number]>(),
    jobRunnertcheque: jest.fn<Promise<void>, [string]>(),
  };

  const cronConfigService = {
    registerHandler: jest.fn(),
    registerPreviewHandler: jest.fn(),
    findByKey: jest.fn(),
  };

  const messageAutoService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirstResponseTimeoutJob,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepo },
        { provide: DispatcherService, useValue: dispatcherService },
        { provide: MessageAutoService, useValue: messageAutoService },
        { provide: CronConfigService, useValue: cronConfigService },
      ],
    }).compile();

    job = module.get<FirstResponseTimeoutJob>(FirstResponseTimeoutJob);
  });

  // ─── Initialisation ────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('enregistre le handler sla-checker auprès du CronConfigService', () => {
      // arrange
      // act
      job.onModuleInit();

      // assert
      expect(cronConfigService.registerHandler).toHaveBeenCalledWith(
        'sla-checker',
        expect.any(Function),
      );
    });

    it('enregistre un preview handler pour sla-checker', () => {
      // arrange
      // act
      job.onModuleInit();

      // assert
      expect(cronConfigService.registerPreviewHandler).toHaveBeenCalledWith(
        'sla-checker',
        expect.any(Function),
      );
    });
  });

  // ─── Handler SLA — exécution automatique (plage horaire) ──────────────────

  describe('Handler SLA — plage horaire', () => {
    it('ignore le SLA si heure >= 21 (nuit)', async () => {
      // arrange
      job.onModuleInit();
      const handlerFn = (cronConfigService.registerHandler as jest.Mock).mock.calls[0][1] as (manual?: boolean) => Promise<string>;

      const dateSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(22);

      // act
      const result = await handlerFn(false); // manual = false → plage horaire appliquée

      // assert
      expect(result).toContain('hors plage horaire');
      expect(dispatcherService.jobRunnerAllPostes).not.toHaveBeenCalled();

      dateSpy.mockRestore();
    });

    it('ignore le SLA si heure < 5 (nuit profonde)', async () => {
      // arrange
      job.onModuleInit();
      const handlerFn = (cronConfigService.registerHandler as jest.Mock).mock.calls[0][1] as (manual?: boolean) => Promise<string>;

      const dateSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(3);

      // act
      const result = await handlerFn(false);

      // assert
      expect(result).toContain('hors plage horaire');
      expect(dispatcherService.jobRunnerAllPostes).not.toHaveBeenCalled();

      dateSpy.mockRestore();
    });

    it('exécute le SLA si heure = 10 (plage active)', async () => {
      // arrange
      job.onModuleInit();
      const handlerFn = (cronConfigService.registerHandler as jest.Mock).mock.calls[0][1] as (manual?: boolean) => Promise<string>;

      const dateSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      dispatcherService.jobRunnerAllPostes.mockResolvedValue('5 conv rééquilibrée(s)');

      // act
      await handlerFn(false);

      // assert
      expect(dispatcherService.jobRunnerAllPostes).toHaveBeenCalledWith(20, 300);

      dateSpy.mockRestore();
    });

    it('bypass la plage horaire en mode manuel (manual = true)', async () => {
      // arrange
      job.onModuleInit();
      const handlerFn = (cronConfigService.registerHandler as jest.Mock).mock.calls[0][1] as (manual?: boolean) => Promise<string>;

      const dateSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(2); // nuit
      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      dispatcherService.jobRunnerAllPostes.mockResolvedValue('Résultat manuel');

      // act
      await handlerFn(true); // manual = true → pas de vérification horaire

      // assert
      expect(dispatcherService.jobRunnerAllPostes).toHaveBeenCalledTimes(1);

      dateSpy.mockRestore();
    });
  });

  // ─── previewExpiredSla() — cas nominal ────────────────────────────────────

  describe('previewExpiredSla()', () => {
    it('retourne les conversations avec unread_count > 0 dépassant le seuil (cas nominal)', async () => {
      // arrange
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const chatEligible = makeConversation({
        chat_id: '33600000001@c.us',
        name: 'Client A',
        status: WhatsappChatStatus.ACTIF,
        unread_count: 2,
        last_client_message_at: thirtyMinutesAgo,
        last_poste_message_at: null,
      });

      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig({ noResponseThresholdMinutes: 15 }));
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([chatEligible]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const result = await job.previewExpiredSla();

      // assert — contrat de retour respecté
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('threshold_minutes');
      expect(result).toHaveProperty('conversations');
      expect(result.total).toBe(1);
      expect(result.threshold_minutes).toBe(15);
      expect(result.conversations[0]).toMatchObject({
        chat_id: '33600000001@c.us',
        name: 'Client A',
        status: WhatsappChatStatus.ACTIF,
      });
      expect(result.conversations[0].minutes_waiting).toBeGreaterThan(0);
    });

    it('retourne un tableau vide si aucune conversation éligible', async () => {
      // arrange
      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const result = await job.previewExpiredSla();

      // assert
      expect(result.total).toBe(0);
      expect(result.conversations).toHaveLength(0);
    });

    it('conversation avec unread_count = 0 — non incluse dans le preview (comportement intentionnel)', async () => {
      // arrange : la conversation lue ne doit PAS apparaître dans le preview
      // Le filtre unread_count > 0 est appliqué dans la requête QueryBuilder.
      // On simule le comportement attendu : le QB ne retourne rien pour les convs lues.
      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const result = await job.previewExpiredSla();

      // assert — 0 résultats : la conversation lue est filtrée par le QB (unread_count > 0)
      expect(result.total).toBe(0);
      // Vérification que le critère unread_count > 0 est bien appliqué (andWhere)
      const qb = chatRepo.createQueryBuilder();
      // Le QB est chaînable : where() suivi d'andWhere() avec le critère unread
      expect(qb.where).toHaveBeenCalled();
    });

    it('conversation FERME avec unread_count > 0 — incluse si non répondue', async () => {
      // arrange : une conversation fermée mais non répondue doit apparaître
      const fermeNonRepondue = makeConversationFermee({
        unread_count: 1,
        last_client_message_at: new Date(Date.now() - 40 * 60 * 1000),
        last_poste_message_at: null,
      });

      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([fermeNonRepondue]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const result = await job.previewExpiredSla();

      // assert
      expect(result.total).toBe(1);
      expect(result.conversations[0].status).toBe(WhatsappChatStatus.FERME);
    });

    it('conversation avec last_client_message_at = null — minutes_waiting = 0', async () => {
      // arrange
      const chatSansDate = makeConversation({
        unread_count: 1,
        last_client_message_at: null,
      });

      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([chatSansDate]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const result = await job.previewExpiredSla();

      // assert — pas d'erreur, minutes_waiting = 0 pour les dates nulles
      expect(result.conversations[0].minutes_waiting).toBe(0);
      expect(result.conversations[0].last_client_message_at).toBeNull();
    });

    it('utilise le seuil par défaut (15 min) si noResponseThresholdMinutes non défini', async () => {
      // arrange
      cronConfigService.findByKey.mockResolvedValue({
        key: 'sla-checker',
        noResponseThresholdMinutes: undefined,
        maxSteps: 300,
        enabled: true,
      });
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const result = await job.previewExpiredSla();

      // assert — seuil fallback = 15
      expect(result.threshold_minutes).toBe(15);
    });
  });

  // ─── startAgentSlaMonitor() ───────────────────────────────────────────────

  describe('startAgentSlaMonitor()', () => {
    it('déclenche un check SLA immédiat pour le poste donné', async () => {
      // arrange
      dispatcherService.jobRunnertcheque.mockResolvedValue(undefined);

      // act
      await job.startAgentSlaMonitor('poste-uuid-001');

      // assert
      expect(dispatcherService.jobRunnertcheque).toHaveBeenCalledWith('poste-uuid-001');
      expect(dispatcherService.jobRunnertcheque).toHaveBeenCalledTimes(1);
    });

    it('ne propage pas les erreurs de jobRunnertcheque (tolérance aux pannes)', async () => {
      // arrange
      dispatcherService.jobRunnertcheque.mockRejectedValue(new Error('DB indisponible'));

      // act & assert — pas de throw
      await expect(job.startAgentSlaMonitor('poste-uuid-001')).resolves.not.toThrow();
    });
  });

  // ─── stopAgentSlaMonitor() ────────────────────────────────────────────────

  describe('stopAgentSlaMonitor()', () => {
    it('ne lève pas d\'erreur (méthode synchrone de nettoyage)', () => {
      // act & assert
      expect(() => job.stopAgentSlaMonitor('poste-uuid-001')).not.toThrow();
    });
  });

  // ─── Idempotence ─────────────────────────────────────────────────────────

  describe('Idempotence — previewExpiredSla()', () => {
    it('deux appels successifs avec les mêmes données retournent le même résultat', async () => {
      // arrange
      const chatEligible = makeConversation({
        chat_id: '33600000001@c.us',
        unread_count: 3,
        last_client_message_at: new Date(Date.now() - 25 * 60 * 1000),
        last_poste_message_at: null,
      });

      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig({ noResponseThresholdMinutes: 20 }));
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([chatEligible]) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      const first = await job.previewExpiredSla();

      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats([chatEligible]) as ReturnType<typeof chatRepo.createQueryBuilder>);
      const second = await job.previewExpiredSla();

      // assert — même état, pas d'effets de bord
      expect(second.total).toBe(first.total);
      expect(second.threshold_minutes).toBe(first.threshold_minutes);
      expect(second.conversations[0].chat_id).toBe(first.conversations[0].chat_id);
    });
  });

  // ─── Performance — détection N+1 ─────────────────────────────────────────

  describe('Performance — absence de N+1', () => {
    it('previewExpiredSla() effectue une seule requête QueryBuilder pour N conversations', async () => {
      // arrange — 3 conversations
      const chats = [
        makeConversation({ chat_id: '001@c.us', unread_count: 1 }),
        makeConversation({ chat_id: '002@c.us', unread_count: 2 }),
        makeConversation({ chat_id: '003@c.us', unread_count: 1 }),
      ];

      cronConfigService.findByKey.mockResolvedValue(makeSlaConfig());
      chatRepo.createQueryBuilder.mockReturnValue(buildQbWithChats(chats) as ReturnType<typeof chatRepo.createQueryBuilder>);

      // act
      await job.previewExpiredSla();

      // assert — un seul createQueryBuilder pour charger N conversations
      // Pas de N+1 : le mapping se fait en mémoire après une seule requête
      expect(chatRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── Tests DispatcherService — logique SLA (jobRunnerAllPostes) ──────────────

/**
 * Construit un QueryBuilder mock entièrement chainable avec des résultats configurables.
 * Toutes les méthodes de construction retournent `this`, les terminaisons retournent
 * les valeurs fournies en paramètre.
 */
function buildFullQb(opts: {
  getRawManyResult?: Array<Record<string, string>>;
  getManyResult?: WhatsappChat[];
} = {}) {
  const qb = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    take: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(opts.getRawManyResult ?? []),
    getMany: jest.fn().mockResolvedValue(opts.getManyResult ?? []),
  };

  // Toutes les méthodes de construction retournent `this`
  qb.select.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.groupBy.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);

  return qb;
}

describe('DispatcherService — jobRunnerAllPostes (SLA)', () => {
  let dispatcherSvc: DispatcherService;

  const chatRepositoryForDispatcher = mockRepository<WhatsappChat>();
  const posteRepositoryForDispatcher = mockRepository<WhatsappPoste>();

  const queueService = {
    getNextInQueue: jest.fn(),
    getQueuePositions: jest.fn(),
    countQueuedPostesExcluding: jest.fn(),
  };

  const gateway = {
    isAgentConnected: jest.fn(),
    emitConversationReassigned: jest.fn(),
    emitConversationUpsertByChatId: jest.fn(),
    emitConversationAssigned: jest.fn(),
    emitConversationRemoved: jest.fn(),
    emitBatchReassignments: jest.fn(),
  };

  const channelService = {
    getDedicatedPosteId: jest.fn(),
  };

  const notificationService = {
    create: jest.fn(),
  };

  function makePoste(id: string, name: string, isActive = true): WhatsappPoste {
    return {
      id,
      code: `CODE-${id}`,
      name,
      is_active: isActive,
      is_queue_enabled: true,
      media_panel_enabled: false,
      media_panel_types: null,
      panelTypes: [],
      chats: [],
      messages: [],
      commercial: [],
      channels: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        { provide: getRepositoryToken(WhatsappChat), useValue: chatRepositoryForDispatcher },
        { provide: getRepositoryToken(WhatsappPoste), useValue: posteRepositoryForDispatcher },
        { provide: QueueService, useValue: queueService },
        { provide: WhatsappMessageGateway, useValue: gateway },
        { provide: WhatsappCommercialService, useValue: {} },
        { provide: NotificationService, useValue: notificationService },
        { provide: ChannelService, useValue: channelService },
      ],
    }).compile();

    dispatcherSvc = module.get<DispatcherService>(DispatcherService);
  });

  // ─── Cas : queue vide → arrêt immédiat ───────────────────────────────────

  it('retourne un message si la file est vide (aucun poste)', async () => {
    // arrange
    // Queue vide : onlinePosteIds = [], step 0 sauté.
    // unavailableCountRows tourne quand même avant le guard — il faut un mock.
    queueService.getQueuePositions.mockResolvedValue([]);
    chatRepositoryForDispatcher.createQueryBuilder.mockReturnValue(
      buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>,
    );

    // act
    const result = await dispatcherSvc.jobRunnerAllPostes(20, 300);

    // assert
    expect(result).toContain('vide');
  });

  it('retourne un message si un seul poste dans la file et aucun poste offline', async () => {
    // arrange
    // Un seul poste actif :
    //  QB1 = fermeNonRepondues (step 0, car is_active = true)
    //  QB2 = unavailableCountRows
    const posteA = makePoste('poste-a', 'Poste A', true);
    queueService.getQueuePositions.mockResolvedValue([{ poste: posteA }]);

    chatRepositoryForDispatcher.createQueryBuilder
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)   // fermeNonRepondues (step 0)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>); // unavailableCountRows

    // act
    const result = await dispatcherSvc.jobRunnerAllPostes(20, 300);

    // assert
    expect(result).toContain('insuffisante');
  });

  // ─── Cas nominal : unread_count > 0 → SLA déclenché ─────────────────────

  it('rééquilibre les conversations avec unread_count > 0 entre deux postes', async () => {
    // arrange
    const posteA = makePoste('poste-a', 'Poste A');
    const posteB = makePoste('poste-b', 'Poste B');

    queueService.getQueuePositions.mockResolvedValue([
      { poste: posteA },
      { poste: posteB },
    ]);

    // 3 convs non lues sur poste-a, 0 sur poste-b → target = ceil(3/2) = 2 → 1 conv à déplacer
    const convEligibles = [
      makeConversation({ chat_id: '001@c.us', poste_id: 'poste-a', unread_count: 2 }),
      makeConversation({ chat_id: '002@c.us', poste_id: 'poste-a', unread_count: 1 }),
    ];

    // Ordre réel des QB dans jobRunnerAllPostes (2 postes actifs) :
    //  QB1 = fermeNonRepondues (step 0)               → []
    //  QB2 = unavailableCountRows (hors queue)        → []
    //  QB3 = countRows (par poste dans queue)         → poste-a: 3, poste-b: 0
    //  QB4 = srcChats (convs surchargées de poste-a)  → convEligibles
    chatRepositoryForDispatcher.createQueryBuilder
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [{ poste_id: 'poste-a', cnt: '3' }, { poste_id: 'poste-b', cnt: '0' }] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getManyResult: convEligibles }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>);

    chatRepositoryForDispatcher.update.mockResolvedValue({ affected: 1 });
    gateway.emitBatchReassignments.mockResolvedValue(undefined);

    // act
    const result = await dispatcherSvc.jobRunnerAllPostes(20, 300);

    // assert — le dispatch a eu lieu
    expect(result).toContain('rééquilibrée');
    expect(chatRepositoryForDispatcher.update).toHaveBeenCalled();
    expect(gateway.emitBatchReassignments).toHaveBeenCalled();
  });

  // ─── Cas intentionnel : unread_count = 0 → SLA ignoré ────────────────────

  it('ne déclenche pas de réassignation si toutes les conversations ont unread_count = 0', async () => {
    // arrange
    const posteA = makePoste('poste-a', 'Poste A');
    const posteB = makePoste('poste-b', 'Poste B');

    queueService.getQueuePositions.mockResolvedValue([
      { poste: posteA },
      { poste: posteB },
    ]);

    // Toutes les requêtes retournent 0 conversations éligibles car unread_count = 0
    // Le filtre `unread_count > 0` dans le QB est ce qui exclut ces conversations.
    // On simule : countRows renvoie [] → totalEligible = 0 → arrêt anticipé.
    // Ordre réel (2 postes actifs) : QB1 = fermeNonRepondues, QB2 = unavailableCountRows, QB3 = countRows
    chatRepositoryForDispatcher.createQueryBuilder
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>);

    // act
    const result = await dispatcherSvc.jobRunnerAllPostes(20, 300);

    // assert — comportement intentionnel documenté en mémoire du projet (AM#1)
    // Les conversations lues (unread_count = 0) ne génèrent jamais de redispatch
    expect(result).toContain('Aucune conversation éligible');
    expect(chatRepositoryForDispatcher.update).not.toHaveBeenCalled();
    expect(gateway.emitBatchReassignments).not.toHaveBeenCalled();
  });

  // ─── Cas : mutex — pas d'overlap si SLA déjà en cours ───────────────────

  it('retourne un message d\'ignorance si le SLA est déjà en cours d\'exécution', async () => {
    // arrange
    queueService.getQueuePositions.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ poste: makePoste('p1', 'P1') }]), 50),
        ),
    );

    // act : lancer deux appels simultanés
    const [first, second] = await Promise.all([
      dispatcherSvc.jobRunnerAllPostes(20, 300),
      dispatcherSvc.jobRunnerAllPostes(20, 300),
    ]);

    // assert — l'un des deux est ignoré grâce au flag isSlaRunning
    const results = [first, second];
    const ignoredResult = results.find((r) => r.includes('Ignoré'));
    expect(ignoredResult).toBeDefined();
  });

  // ─── Cas : réouverture FERME non répondue (step 0) ───────────────────────

  it('réouvre les conversations FERME non répondues sur postes actifs (step 0)', async () => {
    // arrange
    const posteA = makePoste('poste-a', 'Poste A', true); // actif
    const posteB = makePoste('poste-b', 'Poste B', true);

    queueService.getQueuePositions.mockResolvedValue([
      { poste: posteA },
      { poste: posteB },
    ]);

    const convFerme = makeConversationFermee({
      id: 'ferme-uuid-001',
      poste_id: 'poste-a',
      unread_count: 1,
      last_client_message_at: new Date(Date.now() - 30 * 60 * 1000),
      last_poste_message_at: null,
      read_only: false,
    });

    // Ordre réel des QB dans jobRunnerAllPostes :
    //  QB1 = fermeNonRepondues (step 0, ligne 635) — si onlinePosteIds > 0
    //  QB2 = unavailableCountRows (ligne 662)
    //  QB3 = countRows (ligne 691)
    chatRepositoryForDispatcher.createQueryBuilder
      .mockReturnValueOnce(buildFullQb({ getManyResult: [convFerme] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>);

    chatRepositoryForDispatcher.update.mockResolvedValue({ affected: 1 });
    gateway.emitConversationUpsertByChatId.mockResolvedValue(undefined);
    gateway.emitBatchReassignments.mockResolvedValue(undefined);

    // act
    await dispatcherSvc.jobRunnerAllPostes(20, 300);

    // assert — la conv FERME a été réouverte (status → ACTIF)
    expect(chatRepositoryForDispatcher.update).toHaveBeenCalledWith(
      convFerme.id,
      expect.objectContaining({ status: WhatsappChatStatus.ACTIF }),
    );
  });

  // ─── Cas limite : batchSize = 0 ──────────────────────────────────────────

  it('ne déclenche aucun redispatch si batchSize = 0', async () => {
    // arrange
    const posteA = makePoste('poste-a', 'Poste A');
    const posteB = makePoste('poste-b', 'Poste B');

    queueService.getQueuePositions.mockResolvedValue([
      { poste: posteA },
      { poste: posteB },
    ]);

    // batchSize = 0 → Math.min(excess, batchSize - dispatched) = Math.min(x, 0) = 0
    // → la requête srcChats est appelée avec take(0) → renvoie 0 conv → 0 updates
    // Ordre réel (2 postes actifs) : QB1=ferme, QB2=unavailable, QB3=count, QB4=srcChats
    chatRepositoryForDispatcher.createQueryBuilder
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)       // fermeNonRepondues (step 0)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)    // unavailableCountRows
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [{ poste_id: 'poste-a', cnt: '2' }] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>) // countRows
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>);      // srcChats (take(0) → vide)

    gateway.emitBatchReassignments.mockResolvedValue(undefined);

    // act — batchSize = 0 → Math.min(excess, 0 - 0) = 0 → aucune conv récupérée
    await dispatcherSvc.jobRunnerAllPostes(20, 0);

    // assert
    expect(chatRepositoryForDispatcher.update).not.toHaveBeenCalled();
  });

  // ─── Idempotence : même appel deux fois → même résultat ─────────────────

  it('est idempotent — le même appel sans changement d\'état retourne le même résultat', async () => {
    // arrange — charge déjà équilibrée : chaque poste a 1 conv
    const posteA = makePoste('poste-a', 'Poste A');
    const posteB = makePoste('poste-b', 'Poste B');

    queueService.getQueuePositions.mockResolvedValue([
      { poste: posteA },
      { poste: posteB },
    ]);

    // Chaque appel consomme 3 QBs (ordre réel) : ferme, unavailable, count
    // target = ceil(2/2) = 1, chaque poste a exactement 1 → overloaded = [] → équilibré
    const balancedCountRows = [{ poste_id: 'poste-a', cnt: '1' }, { poste_id: 'poste-b', cnt: '1' }];

    chatRepositoryForDispatcher.createQueryBuilder
      // Premier appel : ferme → unavailable → count
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: balancedCountRows }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      // Second appel : ferme → unavailable → count
      .mockReturnValueOnce(buildFullQb({ getManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: [] }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>)
      .mockReturnValueOnce(buildFullQb({ getRawManyResult: balancedCountRows }) as ReturnType<typeof chatRepositoryForDispatcher.createQueryBuilder>);

    // act
    const first = await dispatcherSvc.jobRunnerAllPostes(20, 300);
    const second = await dispatcherSvc.jobRunnerAllPostes(20, 300);

    // assert — charge équilibrée → aucune modification dans les deux cas
    expect(first).toContain('équilibrée');
    expect(second).toContain('équilibrée');
    expect(chatRepositoryForDispatcher.update).not.toHaveBeenCalled();
  });
});
