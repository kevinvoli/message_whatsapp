import { OrderDbRepository } from 'src/order-db/order-db.repository';
import { DataSource } from 'typeorm';
import {
  DB2_INTEGRATION_AVAILABLE,
  getDb2TestDataSource,
  closeDb2TestDataSource,
} from './order-db-integration.setup';

const describeIfDb2 = DB2_INTEGRATION_AVAILABLE ? describe : describe.skip;

/** Construit un OrderDbRepository en contournant l'injection NestJS. */
function buildRepo(ds: DataSource): OrderDbRepository {
  return Object.assign(Object.create(OrderDbRepository.prototype) as OrderDbRepository, {
    orderDb: ds,
    dbAvailable: true,
  });
}

describeIfDb2('OrderDbRepository — intégration DB2', () => {
  let repo: OrderDbRepository;

  beforeAll(async () => {
    const ds = await getDb2TestDataSource();
    repo = buildRepo(ds);
  });

  afterAll(async () => {
    await closeDb2TestDataSource();
  });

  describe('findCallLogsAfterCursor', () => {
    it('retourne un tableau (vide ou non) sans erreur', async () => {
      const result = await repo.findCallLogsAfterCursor({
        since: new Date('2020-01-01'),
        lastId: '',
        batchSize: 10,
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('tie-breaker : deux appels successifs ne dupliquent pas le dernier élément', async () => {
      const batch1 = await repo.findCallLogsAfterCursor({
        since: new Date('2020-01-01'),
        lastId: '',
        batchSize: 5,
      });
      if (batch1.length === 0) return; // pas de données, skip implicite
      const last = batch1[batch1.length - 1];
      const batch2 = await repo.findCallLogsAfterCursor({
        since: last.callTimestamp,
        lastId: last.id,
        batchSize: 5,
      });
      // batch2 ne doit pas contenir l'élément de curseur
      expect(batch2.find((c) => c.id === last.id)).toBeUndefined();
    });
  });

  describe('findClientByPhone', () => {
    it('retourne null pour un numéro totalement inexistant', async () => {
      const result = await repo.findClientByPhone('0000000000');
      expect(result).toBeNull();
    });
  });

  describe('findDormantClientsByCommercial', () => {
    it('retourne un tableau sans erreur', async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const result = await repo.findDormantClientsByCommercial(1, cutoff);
      expect(Array.isArray(result)).toBe(true);
    });

    it('tous les éléments retournés ont un idClient et un lastOrderDate', async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const result = await repo.findDormantClientsByCommercial(1, cutoff);
      for (const row of result) {
        expect(row).toHaveProperty('idClient');
        expect(row).toHaveProperty('lastOrderDate');
      }
    });
  });
});
