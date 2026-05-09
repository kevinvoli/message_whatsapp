import { DataSource } from 'typeorm';
import { OrderCallSyncService } from '../order-call-sync.service';
import {
  DB2_INTEGRATION_AVAILABLE,
  getDb2TestDataSource,
  closeDb2TestDataSource,
} from './order-db-integration.setup';

const describeIfDb2 = DB2_INTEGRATION_AVAILABLE ? describe : describe.skip;

describeIfDb2('OrderCallSyncService.resolveClientCategory — intégration DB2', () => {
  let db2Ds: DataSource;

  beforeAll(async () => {
    db2Ds = await getDb2TestDataSource();
  });

  afterAll(async () => {
    await closeDb2TestDataSource();
  });

  it('retourne JAMAIS_COMMANDE pour un numéro totalement inconnu', async () => {
    // Numéro synthétique inexistant
    const svc = buildMinimalService(db2Ds);
    const cat = await (svc as unknown as { resolveClientCategory(n: string): Promise<string> })
      .resolveClientCategory('0000000000');
    expect(cat).toBe('jamais_commande');
  });
});

function buildMinimalService(db2: DataSource): OrderCallSyncService {
  // Service minimal avec uniquement orderDb câblé — suffisant pour resolveClientCategory
  return Object.assign(Object.create(OrderCallSyncService.prototype) as OrderCallSyncService, {
    orderDb: db2,
    dbAvailable: true,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  });
}
