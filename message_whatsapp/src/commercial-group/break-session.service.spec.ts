import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BreakSessionService } from './break-session.service';
import { BreakSession } from './entities/break-session.entity';

describe('BreakSessionService', () => {
  let service: BreakSessionService;

  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const TODAY = new Date().toISOString().slice(0, 10);

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakSessionService,
        { provide: getRepositoryToken(BreakSession), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BreakSessionService>(BreakSessionService);
  });

  // ─── takeBreak ───────────────────────────────────────────────────────────────

  describe('takeBreak', () => {
    it('retourne la session existante sans en créer une nouvelle (idempotence)', async () => {
      const existing: Pick<BreakSession, 'id' | 'commercialId' | 'breakScheduleId' | 'date' | 'status' | 'takenAt' | 'createdAt'> = {
        id: 'session-uuid-1',
        commercialId: 'comm-1',
        breakScheduleId: 'sched-1',
        date: TODAY,
        status: 'taken',
        takenAt: new Date(),
        createdAt: new Date(),
      };
      mockRepo.findOne.mockResolvedValue(existing);

      const result = await service.takeBreak('comm-1', 'sched-1');

      expect(result).toBe(existing);
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('crée une session status=taken quand aucune n\'existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const entityStub: Partial<BreakSession> = {
        commercialId: 'comm-1',
        breakScheduleId: 'sched-1',
        date: TODAY,
        status: 'taken',
      };
      mockRepo.create.mockReturnValue(entityStub);
      mockRepo.save.mockResolvedValue({ ...entityStub, id: 'new-uuid', createdAt: new Date() });

      const result = await service.takeBreak('comm-1', 'sched-1');

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { commercialId: 'comm-1', breakScheduleId: 'sched-1', date: TODAY },
      });
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          commercialId: 'comm-1',
          breakScheduleId: 'sched-1',
          date: TODAY,
          status: 'taken',
        }),
      );
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('taken');
    });

    it('takenAt est une Date lors de la création', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const captured: { takenAt?: Date | null } = {};
      mockRepo.create.mockImplementation((data: Partial<BreakSession>) => {
        captured.takenAt = data.takenAt ?? null;
        return data;
      });
      mockRepo.save.mockImplementation((e: Partial<BreakSession>) =>
        Promise.resolve({ ...e, id: 'uuid-x', createdAt: new Date() }),
      );

      await service.takeBreak('comm-1', 'sched-1');

      expect(captured.takenAt).toBeInstanceOf(Date);
    });
  });

  // ─── hasTakenBreak ───────────────────────────────────────────────────────────

  describe('hasTakenBreak', () => {
    it('retourne true si une session existe pour (commercialId, breakScheduleId, date)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'x', status: 'taken' });

      await expect(service.hasTakenBreak('comm-1', 'sched-1', TODAY)).resolves.toBe(true);

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { commercialId: 'comm-1', breakScheduleId: 'sched-1', date: TODAY },
      });
    });

    it('retourne false si aucune session n\'existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.hasTakenBreak('comm-1', 'sched-1', TODAY)).resolves.toBe(false);
    });
  });

  // ─── markMissed ──────────────────────────────────────────────────────────────

  describe('markMissed', () => {
    it('crée une session status=missed si aucune session n\'existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const missedStub: Partial<BreakSession> = {
        commercialId: 'comm-1',
        breakScheduleId: 'sched-1',
        date: TODAY,
        status: 'missed',
        takenAt: null,
      };
      mockRepo.create.mockReturnValue(missedStub);
      mockRepo.save.mockResolvedValue({ ...missedStub, id: 'missed-uuid', createdAt: new Date() });

      await service.markMissed('comm-1', 'sched-1', TODAY);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'missed', takenAt: null }),
      );
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ne crée pas de doublon si une session existe déjà (idempotence)', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing', status: 'taken' });

      await service.markMissed('comm-1', 'sched-1', TODAY);

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('ne crée pas de doublon même si la session existante est déjà missed', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing', status: 'missed' });

      await service.markMissed('comm-1', 'sched-1', TODAY);

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
