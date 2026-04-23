import { CallObligationService } from '../call-obligation.service';
import { CommercialObligationBatch, BatchStatus } from '../entities/commercial-obligation-batch.entity';
import { CallTask, CallTaskCategory, CallTaskStatus } from '../entities/call-task.entity';
import { Contact, ClientCategory } from 'src/contact/entities/contact.entity';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeBatch(overrides: Partial<CommercialObligationBatch> = {}): CommercialObligationBatch {
  return Object.assign(new CommercialObligationBatch(), {
    id: 'batch-1',
    posteId: 'poste-1',
    batchNumber: 1,
    status: BatchStatus.PENDING,
    annuleeDone: 0,
    livreeDone: 0,
    sansCommandeDone: 0,
    qualityCheckPassed: false,
    createdAt: new Date(),
    completedAt: null,
    ...overrides,
  });
}

function makeTask(overrides: Partial<CallTask> = {}): CallTask {
  return Object.assign(new CallTask(), {
    id: 'task-1',
    batchId: 'batch-1',
    posteId: 'poste-1',
    category: CallTaskCategory.COMMANDE_ANNULEE,
    status: CallTaskStatus.PENDING,
    clientPhone: null,
    callEventId: null,
    durationSeconds: null,
    completedAt: null,
    ...overrides,
  });
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return Object.assign(new Contact(), {
    id: 'contact-1',
    phone: '0700000001',
    client_category: ClientCategory.COMMANDE_ANNULEE,
    ...overrides,
  });
}

function makeChat(overrides: Partial<WhatsappChat> = {}): WhatsappChat {
  return Object.assign(new WhatsappChat(), {
    id: 'chat-1',
    poste_id: 'poste-1',
    status: WhatsappChatStatus.ACTIF,
    last_client_message_at: null,
    last_poste_message_at: null,
    ...overrides,
  });
}

// ─── Mock Repos ───────────────────────────────────────────────────────────────

function makeBatchRepo(batch: CommercialObligationBatch | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(batch),
    find: jest.fn().mockResolvedValue(batch ? [batch] : []),
    create: jest.fn().mockImplementation((data) => Object.assign(new CommercialObligationBatch(), data)),
    save: jest.fn().mockImplementation(async (entity) => entity),
  } as any;
}

function makeTaskRepo(task: CallTask | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(task),
    find: jest.fn().mockResolvedValue(task ? [task] : []),
    save: jest.fn().mockImplementation(async (entities) => entities),
  } as any;
}

function makeContactRepo(contact: Contact | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(contact),
  } as any;
}

function makeCommercialRepo(posteId: string | null = 'poste-1') {
  return {
    findOne: jest.fn().mockResolvedValue(
      posteId ? { id: 'commercial-1', phone: '0700000002', poste: { id: posteId } } : null,
    ),
  } as any;
}

function makeChatRepo(chats: WhatsappChat[] = []) {
  return {
    find: jest.fn().mockResolvedValue(chats),
  } as any;
}

function makePosteRepo(posteIds: string[] = ['poste-1']) {
  return {
    find: jest.fn().mockResolvedValue(posteIds.map((id) => ({ id }))),
  } as any;
}

function buildService(
  batchRepo = makeBatchRepo(),
  taskRepo = makeTaskRepo(),
  contactRepo = makeContactRepo(),
  commercialRepo = makeCommercialRepo(),
  chatRepo = makeChatRepo(),
  posteRepo = makePosteRepo(),
): CallObligationService {
  return new CallObligationService(
    batchRepo,
    taskRepo,
    contactRepo,
    commercialRepo,
    chatRepo,
    posteRepo,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CallObligationService', () => {

  describe('getOrCreateActiveBatch', () => {
    it('retourne le batch actif existant', async () => {
      const batch = makeBatch();
      const batchRepo = makeBatchRepo(batch);
      const svc = buildService(batchRepo);

      const result = await svc.getOrCreateActiveBatch('poste-1');
      expect(result).toBe(batch);
      expect(batchRepo.save).not.toHaveBeenCalled();
    });

    it('crée un nouveau batch avec 15 tâches si aucun n\'existe', async () => {
      const batchRepo = makeBatchRepo(null);
      batchRepo.findOne = jest.fn().mockResolvedValue(null);
      const createdBatch = makeBatch({ id: 'batch-new', batchNumber: 1 });
      batchRepo.create = jest.fn().mockReturnValue(createdBatch);
      batchRepo.save = jest.fn().mockResolvedValue(createdBatch);

      const taskRepo = makeTaskRepo();

      const svc = buildService(batchRepo, taskRepo);
      const result = await svc.getOrCreateActiveBatch('poste-1');

      expect(result.id).toBe('batch-new');
      // 15 tâches sauvegardées (5 × 3 catégories)
      expect(taskRepo.save).toHaveBeenCalledTimes(1);
      const savedTasks = taskRepo.save.mock.calls[0][0] as CallTask[];
      expect(savedTasks).toHaveLength(15);
      const categories = savedTasks.map((t) => t.category);
      expect(categories.filter((c) => c === CallTaskCategory.COMMANDE_ANNULEE)).toHaveLength(5);
      expect(categories.filter((c) => c === CallTaskCategory.COMMANDE_AVEC_LIVRAISON)).toHaveLength(5);
      expect(categories.filter((c) => c === CallTaskCategory.JAMAIS_COMMANDE)).toHaveLength(5);
    });

    it('incrémente batchNumber depuis le dernier batch', async () => {
      const batchRepo = makeBatchRepo(null);
      let callCount = 0;
      batchRepo.findOne = jest.fn().mockImplementation(async () => {
        // 1er appel : pas de batch PENDING → null
        // 2ème appel : batch le plus récent avec batchNumber=3
        callCount++;
        if (callCount === 1) return null;
        return makeBatch({ batchNumber: 3 });
      });
      const newBatch = makeBatch({ batchNumber: 4 });
      batchRepo.create = jest.fn().mockReturnValue(newBatch);
      batchRepo.save = jest.fn().mockResolvedValue(newBatch);
      const taskRepo = makeTaskRepo();

      const svc = buildService(batchRepo, taskRepo);
      await svc.getOrCreateActiveBatch('poste-1');

      const createArg = batchRepo.create.mock.calls[0][0];
      expect(createArg.batchNumber).toBe(4);
    });
  });

  describe('tryMatchCallToTask', () => {
    it('refuse si durée < 90s', async () => {
      const svc = buildService();
      const result = await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-1',
        durationSeconds: 45,
      });
      expect(result.matched).toBe(false);
      expect(result.reason).toContain('durée_insuffisante');
    });

    it('refuse si poste introuvable', async () => {
      const commercialRepo = makeCommercialRepo(null);
      const svc = buildService(undefined, undefined, undefined, commercialRepo);
      const result = await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-1',
        durationSeconds: 120,
      });
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('poste_introuvable');
    });

    it('refuse si catégorie contact inconnue', async () => {
      const contactRepo = makeContactRepo(null);
      const svc = buildService(undefined, undefined, contactRepo);
      const result = await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-1',
        durationSeconds: 120,
        posteId: 'poste-1',
      });
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('categorie_contact_inconnue');
    });

    it('refuse si aucun batch actif', async () => {
      const batchRepo = makeBatchRepo(null);
      const contactRepo = makeContactRepo(makeContact());
      const svc = buildService(batchRepo, undefined, contactRepo);
      const result = await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-1',
        durationSeconds: 120,
        posteId: 'poste-1',
      });
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('aucun_batch_actif');
    });

    it('refuse si quota catégorie atteint (aucune tâche PENDING)', async () => {
      const batchRepo = makeBatchRepo(makeBatch());
      const taskRepo = makeTaskRepo(null); // pas de tâche PENDING
      const contactRepo = makeContactRepo(makeContact());
      const svc = buildService(batchRepo, taskRepo, contactRepo);

      const result = await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-1',
        durationSeconds: 120,
        posteId: 'poste-1',
      });
      expect(result.matched).toBe(false);
      expect(result.reason).toContain('quota_');
    });

    it('valide la tâche et met à jour le batch', async () => {
      const batch = makeBatch({ annuleeDone: 0 });
      const task = makeTask({ category: CallTaskCategory.COMMANDE_ANNULEE });
      const batchRepo = makeBatchRepo(batch);
      const taskRepo = makeTaskRepo(task);
      const contactRepo = makeContactRepo(makeContact());

      const svc = buildService(batchRepo, taskRepo, contactRepo);
      const result = await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-42',
        durationSeconds: 120,
        posteId: 'poste-1',
      });

      expect(result.matched).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(task.status).toBe(CallTaskStatus.DONE);
      expect(task.callEventId).toBe('evt-42');
      expect(task.durationSeconds).toBe(120);
      expect(batch.annuleeDone).toBe(1);
    });

    it('marque le batch COMPLETE quand tous les compteurs atteignent 5', async () => {
      const batch = makeBatch({ annuleeDone: 5, livreeDone: 5, sansCommandeDone: 4 });
      const task = makeTask({ category: CallTaskCategory.JAMAIS_COMMANDE });
      const contact = makeContact({ client_category: ClientCategory.JAMAIS_COMMANDE });
      const batchRepo = makeBatchRepo(batch);
      const taskRepo = makeTaskRepo(task);
      const contactRepo = makeContactRepo(contact);

      const svc = buildService(batchRepo, taskRepo, contactRepo);
      await svc.tryMatchCallToTask({
        clientPhone: '0700000001',
        commercialPhone: '0700000002',
        callEventId: 'evt-99',
        durationSeconds: 150,
        posteId: 'poste-1',
      });

      expect(batch.status).toBe(BatchStatus.COMPLETE);
      expect(batch.completedAt).not.toBeNull();
    });
  });

  describe('checkAndRecordQuality', () => {
    it('passe si aucun message client', async () => {
      const batch = makeBatch();
      const batchRepo = makeBatchRepo(batch);
      const svc = buildService(batchRepo);
      const convs = [makeChat({ last_client_message_at: null })];

      const result = await svc.checkAndRecordQuality('poste-1', convs);
      expect(result).toBe(true);
      expect(batch.qualityCheckPassed).toBe(true);
    });

    it('échoue si un commercial n\'a pas répondu au dernier message client', async () => {
      const batch = makeBatch();
      const batchRepo = makeBatchRepo(batch);
      const svc = buildService(batchRepo);
      const t = new Date();
      const convs = [makeChat({ last_client_message_at: t, last_poste_message_at: null })];

      const result = await svc.checkAndRecordQuality('poste-1', convs);
      expect(result).toBe(false);
      expect(batch.qualityCheckPassed).toBe(false);
    });

    it('passe si last_poste_message_at >= last_client_message_at', async () => {
      const batch = makeBatch();
      const batchRepo = makeBatchRepo(batch);
      const svc = buildService(batchRepo);
      const clientAt = new Date('2026-04-23T08:00:00Z');
      const posteAt  = new Date('2026-04-23T09:00:00Z');
      const convs = [makeChat({ last_client_message_at: clientAt, last_poste_message_at: posteAt })];

      const result = await svc.checkAndRecordQuality('poste-1', convs);
      expect(result).toBe(true);
    });

    it('échoue si last_poste_message_at < last_client_message_at', async () => {
      const batch = makeBatch();
      const batchRepo = makeBatchRepo(batch);
      const svc = buildService(batchRepo);
      const clientAt = new Date('2026-04-23T10:00:00Z');
      const posteAt  = new Date('2026-04-23T08:00:00Z');
      const convs = [makeChat({ last_client_message_at: clientAt, last_poste_message_at: posteAt })];

      const result = await svc.checkAndRecordQuality('poste-1', convs);
      expect(result).toBe(false);
    });

    it('fonctionne sans batch actif (ne plante pas)', async () => {
      const batchRepo = makeBatchRepo(null);
      const svc = buildService(batchRepo);
      const result = await svc.checkAndRecordQuality('poste-1', []);
      expect(result).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('retourne null si aucun batch actif', async () => {
      const svc = buildService(makeBatchRepo(null));
      expect(await svc.getStatus('poste-1')).toBeNull();
    });

    it('retourne le statut structuré du batch', async () => {
      const batch = makeBatch({ annuleeDone: 3, livreeDone: 5, sansCommandeDone: 2, qualityCheckPassed: false });
      const svc = buildService(makeBatchRepo(batch));
      const status = await svc.getStatus('poste-1');

      expect(status).not.toBeNull();
      expect(status!.annulee).toEqual({ done: 3, required: 5 });
      expect(status!.livree).toEqual({ done: 5, required: 5 });
      expect(status!.sansCommande).toEqual({ done: 2, required: 5 });
      expect(status!.readyForRotation).toBe(false);
    });

    it('readyForRotation = true quand tout est à 5 et qualité passée', async () => {
      const batch = makeBatch({
        annuleeDone: 5,
        livreeDone: 5,
        sansCommandeDone: 5,
        qualityCheckPassed: true,
      });
      const svc = buildService(makeBatchRepo(batch));
      const status = await svc.getStatus('poste-1');
      expect(status!.readyForRotation).toBe(true);
    });
  });

  describe('getActivePosteIds', () => {
    it('déduplique les posteIds depuis plusieurs batchs', async () => {
      const batchRepo = makeBatchRepo();
      batchRepo.find = jest.fn().mockResolvedValue([
        makeBatch({ posteId: 'poste-1' }),
        makeBatch({ id: 'batch-2', posteId: 'poste-1' }),
        makeBatch({ id: 'batch-3', posteId: 'poste-2' }),
      ]);
      const svc = buildService(batchRepo);
      const ids = await svc.getActivePosteIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('poste-1');
      expect(ids).toContain('poste-2');
    });

    it('retourne un tableau vide si aucun batch actif', async () => {
      const batchRepo = makeBatchRepo();
      batchRepo.find = jest.fn().mockResolvedValue([]);
      const svc = buildService(batchRepo);
      expect(await svc.getActivePosteIds()).toEqual([]);
    });
  });

  describe('initAllBatches', () => {
    it('crée des batchs pour les postes sans batch actif', async () => {
      const batchRepo = makeBatchRepo(null); // getActiveBatch retourne null
      const createdBatch = makeBatch();
      batchRepo.create = jest.fn().mockReturnValue(createdBatch);
      batchRepo.save = jest.fn().mockResolvedValue(createdBatch);
      const posteRepo = makePosteRepo(['poste-1', 'poste-2']);
      const taskRepo = makeTaskRepo();

      const svc = buildService(batchRepo, taskRepo, undefined, undefined, undefined, posteRepo);
      const result = await svc.initAllBatches();

      expect(result.created).toBe(2);
      expect(result.alreadyActive).toBe(0);
    });

    it('ignore les postes ayant déjà un batch actif', async () => {
      const batch = makeBatch();
      const batchRepo = makeBatchRepo(batch); // getActiveBatch retourne toujours le batch
      const posteRepo = makePosteRepo(['poste-1', 'poste-2']);
      const svc = buildService(batchRepo, undefined, undefined, undefined, undefined, posteRepo);

      const result = await svc.initAllBatches();
      expect(result.created).toBe(0);
      expect(result.alreadyActive).toBe(2);
    });
  });

  describe('isPosteReadyForRotation', () => {
    it('retourne true si aucun batch actif', async () => {
      const svc = buildService(makeBatchRepo(null));
      expect(await svc.isPosteReadyForRotation('poste-1')).toBe(true);
    });

    it('retourne false si batch incomplet', async () => {
      const batch = makeBatch({ annuleeDone: 3, livreeDone: 5, sansCommandeDone: 5, qualityCheckPassed: true });
      const svc = buildService(makeBatchRepo(batch));
      expect(await svc.isPosteReadyForRotation('poste-1')).toBe(false);
    });

    it('retourne false si qualité non passée', async () => {
      const batch = makeBatch({ annuleeDone: 5, livreeDone: 5, sansCommandeDone: 5, qualityCheckPassed: false });
      const svc = buildService(makeBatchRepo(batch));
      expect(await svc.isPosteReadyForRotation('poste-1')).toBe(false);
    });
  });
});
