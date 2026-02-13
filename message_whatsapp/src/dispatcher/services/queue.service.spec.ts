import { QueueService } from './queue.service';
import { QueuePosition } from '../entities/queue-position.entity';

const makeQueryRunner = () => {
  const manager = {
    findOne: jest.fn().mockResolvedValue({ position: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    }),
  };

  return {
    manager,
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
};

describe('QueueService', () => {
  const queueRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max_position: 0 }),
    }),
    create: jest.fn((payload) => payload),
    save: jest.fn().mockResolvedValue({ poste_id: 'p1', position: 1 }),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };

  const posteRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'p1' }),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };

  const commercialRepository = {};

  const dataSource = {
    createQueryRunner: jest.fn().mockImplementation(makeQueryRunner),
  };

  let service: QueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QueueService(
      queueRepository as any,
      posteRepository as any,
      commercialRepository as any,
      dataSource as any,
    );
  });

  it('wraps removeFromQueue in queueLock', async () => {
    const lock = (service as any).queueLock;
    const spy = jest
      .spyOn(lock, 'runExclusive')
      .mockImplementation(async (fn: () => Promise<void>) => fn());

    await service.removeFromQueue('p1');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('wraps moveToEnd in queueLock', async () => {
    const lock = (service as any).queueLock;
    const spy = jest
      .spyOn(lock, 'runExclusive')
      .mockImplementation(async (fn: () => Promise<void>) => fn());

    await service.moveToEnd('p1');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('wraps syncQueueWithActivePostes in queueLock', async () => {
    const lock = (service as any).queueLock;
    const spy = jest
      .spyOn(lock, 'runExclusive')
      .mockImplementation(async (fn: () => Promise<void>) => fn());

    await service.syncQueueWithActivePostes();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
