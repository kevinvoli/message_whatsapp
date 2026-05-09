/**
 * T3/T7 — Tests unitaires pour OrderCallSyncService.resolveClientCategory()
 *
 * Couvre les 5 branches de la logique de catégorisation client :
 *   CAS-01 : résolution directe par id_client → COMMANDE_AVEC_LIVRAISON
 *   CAS-02 : fallback téléphone → COMMANDE_ANNULEE (trueCancel = 1)
 *   CAS-03 : id_client présent, aucune commande → JAMAIS_COMMANDE
 *   CAS-04 : id_client absent, numéro inconnu dans users → JAMAIS_COMMANDE
 *   CAS-05 : dernier statut = retour (etat 99) → COMMANDE_ANNULEE même si dateLivree définie
 */

import { OrderCallSyncService } from '../order-call-sync.service';
import { CallTaskCategory } from 'src/call-obligations/entities/call-task.entity';
import { OrderCommand } from 'src/order-read/entities/order-command.entity';
import { OrderCommandStatus } from 'src/order-read/entities/order-command-status.entity';
import { GicopUser } from 'src/order-read/entities/giocop-user.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrderDb({
  userResult      = null as { id: number } | null,
  orderResult     = null as { id: number; dateLivree: Date | null; trueCancel: number } | null,
  statusResult    = null as { etat: number } | null,
} = {}) {
  const userQb = {
    where:    jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    getOne:   jest.fn().mockResolvedValue(userResult),
  };

  const cmdQb = {
    where:    jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy:  jest.fn().mockReturnThis(),
    limit:    jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    getOne:   jest.fn().mockResolvedValue(orderResult),
  };

  const statusQb = {
    where:    jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy:  jest.fn().mockReturnThis(),
    limit:    jest.fn().mockReturnThis(),
    select:   jest.fn().mockReturnThis(),
    getOne:   jest.fn().mockResolvedValue(statusResult),
  };

  return {
    getRepository: jest.fn().mockImplementation((entity: unknown) => {
      if (entity === GicopUser)         return { createQueryBuilder: jest.fn().mockReturnValue(userQb) };
      if (entity === OrderCommandStatus) return { createQueryBuilder: jest.fn().mockReturnValue(statusQb) };
      // OrderCommand (default)
      return { createQueryBuilder: jest.fn().mockReturnValue(cmdQb) };
    }),
  };
}

function buildService(orderDb: ReturnType<typeof makeOrderDb> | null) {
  return new OrderCallSyncService(
    orderDb as any,
    true,
    null as any, // cursorRepo — non utilisé par resolveClientCategory
    null as any, // commercialRepo
    null as any, // mappingRepo
    null as any, // callDeviceRepo — non utilisé par resolveClientCategory
    null as any, // syncLog
    undefined as any, // obligationService
    null as any, // callEventService — non utilisé par resolveClientCategory
    null as any, // contactRepo
    null as any, // clientMappingRepo
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrderCallSyncService — resolveClientCategory()', () => {
  it('CAS-01 : id_client présent + dateLivree IS NOT NULL → COMMANDE_AVEC_LIVRAISON', async () => {
    const orderDb = makeOrderDb({
      userResult:  { id: 42 },  // user trouvé via phone
      orderResult: { id: 42, dateLivree: new Date('2026-01-15'), trueCancel: 0 },
      statusResult: null, // pas de retour
    });
    const svc = buildService(orderDb);

    const category = await (svc as any).resolveClientCategory('0700000001');

    expect(category).toBe(CallTaskCategory.COMMANDE_AVEC_LIVRAISON);
  });

  it('CAS-02 : id_client absent + téléphone trouvé dans users + trueCancel=1 → COMMANDE_ANNULEE', async () => {
    const orderDb = makeOrderDb({
      userResult:  { id: 99 },
      orderResult: { id: 10, dateLivree: null, trueCancel: 1 },
    });
    const svc = buildService(orderDb);

    const category = await (svc as any).resolveClientCategory('0600000099');

    expect(category).toBe(CallTaskCategory.COMMANDE_ANNULEE);
  });

  it('CAS-03 : id_client présent, aucune commande trouvée → JAMAIS_COMMANDE', async () => {
    const orderDb = makeOrderDb({ userResult: { id: 7 }, orderResult: null });
    const svc = buildService(orderDb);

    const category = await (svc as any).resolveClientCategory('0700000007');

    expect(category).toBe(CallTaskCategory.JAMAIS_COMMANDE);
  });

  it('CAS-04 : id_client absent + numéro inconnu dans users → JAMAIS_COMMANDE', async () => {
    const orderDb = makeOrderDb({ userResult: null });
    const svc = buildService(orderDb);

    const category = await (svc as any).resolveClientCategory('0000000000');

    expect(category).toBe(CallTaskCategory.JAMAIS_COMMANDE);
  });

  it('CAS-05 : dateLivree définie mais dernier statut = retour (etat 99) → COMMANDE_ANNULEE', async () => {
    const orderDb = makeOrderDb({
      userResult:   { id: 55 },  // user trouvé via phone
      orderResult:  { id: 55, dateLivree: new Date('2026-03-10'), trueCancel: 0 },
      statusResult: { etat: 99 }, // retour commande
    });
    const svc = buildService(orderDb);

    const category = await (svc as any).resolveClientCategory('0700000055');

    expect(category).toBe(CallTaskCategory.COMMANDE_ANNULEE);
  });
});
