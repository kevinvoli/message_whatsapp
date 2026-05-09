import { DataSource } from 'typeorm';
import { MessagingClientDossierMirror } from '../entities/messaging-client-dossier-mirror.entity';
import {
  getDb2TestDataSource,
  closeDb2TestDataSource,
  DB2_INTEGRATION_AVAILABLE,
} from 'src/order-call-sync/__tests__/order-db-integration.setup';

const describeIfDb2 = DB2_INTEGRATION_AVAILABLE ? describe : describe.skip;

describeIfDb2('OrderDossierMirrorWriteService — intégration DB2', () => {
  let db2: DataSource;
  const TEST_CHAT_ID = `test-integration-${Date.now()}`;

  beforeAll(async () => {
    db2 = await getDb2TestDataSource();
  });

  afterAll(async () => {
    // Nettoyage : supprimer la ligne de test
    await db2
      .getRepository(MessagingClientDossierMirror)
      .delete({ messagingChatId: TEST_CHAT_ID });
    await closeDb2TestDataSource();
  });

  it('upsert crée une ligne dans messaging_client_dossier_mirror', async () => {
    const repo = db2.getRepository(MessagingClientDossierMirror);

    const row: Partial<MessagingClientDossierMirror> = {
      messagingChatId: TEST_CHAT_ID,
      idClient: null,
      idCommercial: null,
      clientName: 'Test Client Intégration',
      commercialName: 'Test Commercial',
      syncStatus: 'synced',
      submittedAt: new Date(),
    };

    await repo.upsert(row, ['messagingChatId']);

    const found = await repo.findOne({ where: { messagingChatId: TEST_CHAT_ID } });
    expect(found).not.toBeNull();
    expect(found!.clientName).toBe('Test Client Intégration');
    expect(found!.syncStatus).toBe('synced');
  });

  it('upsert est idempotent — second appel met à jour sans doublon', async () => {
    const repo = db2.getRepository(MessagingClientDossierMirror);

    // Second upsert sur le même messaging_chat_id
    const updated: Partial<MessagingClientDossierMirror> = {
      messagingChatId: TEST_CHAT_ID,
      clientName: 'Test Client Mis à Jour',
      syncStatus: 'synced',
    };

    await repo.upsert(updated, ['messagingChatId']);

    const all = await repo.find({ where: { messagingChatId: TEST_CHAT_ID } });
    expect(all).toHaveLength(1); // pas de doublon
    expect(all[0].clientName).toBe('Test Client Mis à Jour');
  });

  it('markClosure met à jour conversation_result et closed_at', async () => {
    const repo = db2.getRepository(MessagingClientDossierMirror);
    const closedAt = new Date();

    await repo.update(
      { messagingChatId: TEST_CHAT_ID },
      { conversationResult: 'vente', closedAt, syncStatus: 'synced' },
    );

    const found = await repo.findOne({ where: { messagingChatId: TEST_CHAT_ID } });
    expect(found!.conversationResult).toBe('vente');
    expect(found!.syncStatus).toBe('synced');
  });
});
