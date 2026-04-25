import { Logger } from '@nestjs/common';
import { OrderDossierMirrorWriteService, DossierMirrorPayload } from '../services/order-dossier-mirror-write.service';
import { MessagingClientDossierMirror } from '../entities/messaging-client-dossier-mirror.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<DossierMirrorPayload> = {}): DossierMirrorPayload {
  return {
    messagingChatId:  'chat-1',
    commercialIdDb1:  'commercial-uuid-1',
    contactIdDb1:     'contact-uuid-1',
    clientName:       'Client Test',
    commercialName:   'Commercial Test',
    ...overrides,
  };
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeOrderDb(upsertFn = jest.fn().mockResolvedValue(undefined)) {
  const repoMock = { upsert: upsertFn };
  return {
    getRepository: jest.fn().mockReturnValue(repoMock),
    _repo:         repoMock,
  } as any;
}

function makeSyncLog() {
  return {
    createPending: jest.fn().mockResolvedValue({ id: 'log-1' }),
    markSuccess:   jest.fn().mockResolvedValue(undefined),
    markFailed:    jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeCommercialMappingRepo(externalId: number | null = 42) {
  return {
    findOne: jest.fn().mockResolvedValue(
      externalId !== null ? Object.assign(new CommercialIdentityMapping(), { external_id: externalId }) : null,
    ),
  } as any;
}

function makeClientMappingRepo(externalId: number | null = 99) {
  return {
    findOne: jest.fn().mockResolvedValue(
      externalId !== null ? Object.assign(new ClientIdentityMapping(), { external_id: externalId }) : null,
    ),
  } as any;
}

function buildService(
  orderDb             = makeOrderDb(),
  dbAvailable         = true,
  syncLog             = makeSyncLog(),
  commercialMappingRepo = makeCommercialMappingRepo(),
  clientMappingRepo   = makeClientMappingRepo(),
): OrderDossierMirrorWriteService {
  // Silence logger dans les tests
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  return new OrderDossierMirrorWriteService(
    orderDb,
    dbAvailable,
    syncLog,
    commercialMappingRepo,
    clientMappingRepo,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderDossierMirrorWriteService', () => {

  describe('upsertDossier', () => {

    it('lève une erreur si DB2 non disponible (orderDb=null)', async () => {
      const syncLog = makeSyncLog();
      const svc = buildService(null, false, syncLog);
      await expect(svc.upsertDossier(makePayload())).rejects.toThrow('DB2 non disponible');
      expect(syncLog.createPending).not.toHaveBeenCalled();
    });

    it('crée un log pending puis le marque success', async () => {
      const syncLog = makeSyncLog();
      const svc     = buildService(makeOrderDb(), true, syncLog);
      await svc.upsertDossier(makePayload());
      expect(syncLog.createPending).toHaveBeenCalledWith('client_dossier', 'chat-1', 'messaging_client_dossier_mirror');
      expect(syncLog.markSuccess).toHaveBeenCalledWith('log-1');
      expect(syncLog.markFailed).not.toHaveBeenCalled();
    });

    it('résout idCommercial et idClient via les mappings', async () => {
      const db      = makeOrderDb();
      const syncLog = makeSyncLog();
      const svc     = buildService(db, true, syncLog, makeCommercialMappingRepo(42), makeClientMappingRepo(99));
      await svc.upsertDossier(makePayload());
      const upsertArg = db._repo.upsert.mock.calls[0][0] as Partial<MessagingClientDossierMirror>;
      expect(upsertArg.idCommercial).toBe(42);
      expect(upsertArg.idClient).toBe(99);
    });

    it('laisse idCommercial/idClient à null si mapping absent', async () => {
      const db  = makeOrderDb();
      const svc = buildService(db, true, makeSyncLog(), makeCommercialMappingRepo(null), makeClientMappingRepo(null));
      await svc.upsertDossier(makePayload());
      const upsertArg = db._repo.upsert.mock.calls[0][0] as Partial<MessagingClientDossierMirror>;
      expect(upsertArg.idCommercial).toBeNull();
      expect(upsertArg.idClient).toBeNull();
    });

    it('marque le log en échec si l\'upsert lève une erreur', async () => {
      const dbError = new Error('Connexion DB2 coupée');
      const db      = makeOrderDb(jest.fn().mockRejectedValue(dbError));
      const syncLog = makeSyncLog();
      const svc     = buildService(db, true, syncLog);
      await expect(svc.upsertDossier(makePayload())).rejects.toThrow('Connexion DB2 coupée');
      expect(syncLog.markFailed).toHaveBeenCalledWith('log-1', dbError.message);
      expect(syncLog.markSuccess).not.toHaveBeenCalled();
    });

    it('utilise syncStatus=synced dans le payload upsert', async () => {
      const db  = makeOrderDb();
      const svc = buildService(db);
      await svc.upsertDossier(makePayload());
      const upsertArg = db._repo.upsert.mock.calls[0][0] as Partial<MessagingClientDossierMirror>;
      expect(upsertArg.syncStatus).toBe('synced');
      expect(upsertArg.messagingChatId).toBe('chat-1');
    });
  });

  describe('markClosure', () => {

    it('ne fait rien si DB2 non disponible', async () => {
      const db  = makeOrderDb();
      const svc = buildService(null, false);
      await svc.markClosure('chat-1', 'commande', new Date());
      expect(db.getRepository).not.toHaveBeenCalled();
    });

    it('met à jour conversationResult et closedAt', async () => {
      const updateFn = jest.fn().mockResolvedValue({ affected: 1 });
      const repoMock = { upsert: jest.fn(), update: updateFn };
      const db = { getRepository: jest.fn().mockReturnValue(repoMock) } as any;
      const svc = buildService(db, true);
      const closedAt = new Date('2026-04-24T10:00:00Z');
      await svc.markClosure('chat-1', 'commande', closedAt);
      expect(updateFn).toHaveBeenCalledWith(
        { messagingChatId: 'chat-1' },
        expect.objectContaining({ conversationResult: 'commande', closedAt, syncStatus: 'synced' }),
      );
    });
  });
});
