import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BreakScheduleEngine } from './break-schedule-engine.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CommercialPlanning } from './entities/commercial-planning.entity';
import { GroupScheduleDay } from './entities/group-schedule-day.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { BreakExclusionService } from './break-exclusion.service';
import { BreakSessionService } from './break-session.service';
import { BREAK_EVENTS } from 'src/realtime/events/socket-events.constants';
import { SubGroupBreakSchedule } from './entities/sub-group-break-schedule.entity';
import { CommercialSubGroup } from './entities/commercial-sub-group.entity';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<SubGroupBreakSchedule> = {}): SubGroupBreakSchedule {
  return {
    id: 'sched-1',
    subGroupId: 'sg-1',
    startTime: '14:00:00',
    endTime: '15:00:00',
    reminderIntervalMinutes: 0, // → interval check toujours passant (lastSent=0 << Date.now())
    popupMessageText: 'Temps de pause !',
    popupAudioAssetId: null,
    maxDurationMinutes: 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as SubGroupBreakSchedule;
}

function makeSubGroup(overrides: Partial<CommercialSubGroup> = {}): CommercialSubGroup {
  return {
    id: 'sg-1',
    parentGroupId: 'group-1',
    name: 'Sous-groupe Alpha',
    description: null,
    isActive: true,
    breakSchedules: [makeSchedule()],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as CommercialSubGroup;
}

function makeCommercial(overrides: Partial<WhatsappCommercial> = {}): WhatsappCommercial {
  return {
    id: 'comm-1',
    name: 'Alice Dupont',
    subGroup: makeSubGroup(),
    poste: null,
    ...overrides,
  } as unknown as WhatsappCommercial;
}

// ─── Mocks QueryBuilder ──────────────────────────────────────────────────────

function makeFluent(extraMethods: Record<string, jest.Mock> = {}): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    ...extraMethods,
  };
  // Chaîner toutes les méthodes
  for (const key of Object.keys(qb)) {
    if (key !== 'getMany') {
      qb[key] = qb[key] ?? jest.fn().mockReturnThis();
    }
  }
  return qb;
}

describe('BreakScheduleEngine', () => {
  let engine: BreakScheduleEngine;

  // Mocks QB séparés pour chaque repo
  let commercialQb: Record<string, jest.Mock>;
  let planningQb: Record<string, jest.Mock>;
  let scheduleDayQb: Record<string, jest.Mock>;

  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });

  const mockGateway = {
    getConnectedCommercialIds: jest.fn().mockReturnValue(['comm-1']),
    server: { to: mockTo },
  };

  const mockSystemConfig = {
    get: jest.fn().mockResolvedValue('Africa/Abidjan'),
  };

  const mockExclusionService = {
    findBySubGroups: jest.fn().mockResolvedValue([]),
  };

  const mockSessionService = {
    bulkHasTaken: jest.fn().mockResolvedValue(new Set<string>()),
    markMissed: jest.fn().mockResolvedValue(undefined),
  };

  const mockCommercialRepo = { createQueryBuilder: jest.fn() };
  const mockPlanningRepo = { createQueryBuilder: jest.fn() };
  const mockScheduleDayRepo = { createQueryBuilder: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    commercialQb = makeFluent();
    planningQb = makeFluent();
    scheduleDayQb = makeFluent();

    mockCommercialRepo.createQueryBuilder.mockReturnValue(commercialQb);
    mockPlanningRepo.createQueryBuilder.mockReturnValue(planningQb);
    mockScheduleDayRepo.createQueryBuilder.mockReturnValue(scheduleDayQb);

    mockGateway.getConnectedCommercialIds.mockReturnValue(['comm-1']);
    mockGateway.server.to = mockTo;
    mockTo.mockReturnValue({ emit: mockEmit });
    mockSystemConfig.get.mockResolvedValue('Africa/Abidjan');
    mockExclusionService.findBySubGroups.mockResolvedValue([]);
    mockSessionService.bulkHasTaken.mockResolvedValue(new Set<string>());
    mockSessionService.markMissed.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakScheduleEngine,
        { provide: getRepositoryToken(WhatsappCommercial), useValue: mockCommercialRepo },
        { provide: getRepositoryToken(CommercialPlanning), useValue: mockPlanningRepo },
        { provide: getRepositoryToken(GroupScheduleDay), useValue: mockScheduleDayRepo },
        { provide: SystemConfigService, useValue: mockSystemConfig },
        { provide: WhatsappMessageGateway, useValue: mockGateway },
        { provide: BreakExclusionService, useValue: mockExclusionService },
        { provide: BreakSessionService, useValue: mockSessionService },
      ],
    }).compile();

    engine = module.get<BreakScheduleEngine>(BreakScheduleEngine);
  });

  // ─── Méthodes privées ────────────────────────────────────────────────────────

  describe('getCurrentHHmm (méthode privée)', () => {
    it('retourne une chaîne de 5 caractères au format HH:mm', () => {
      const result = (engine as unknown as { getCurrentHHmm: (tz: string) => string })
        .getCurrentHHmm('Africa/Abidjan');

      expect(result).toHaveLength(5);
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('les deux segments sont séparés par ":"', () => {
      const result = (engine as unknown as { getCurrentHHmm: (tz: string) => string })
        .getCurrentHHmm('Europe/Paris');

      const [hours, minutes] = result.split(':');
      expect(Number(hours)).toBeGreaterThanOrEqual(0);
      expect(Number(hours)).toBeLessThanOrEqual(23);
      expect(Number(minutes)).toBeGreaterThanOrEqual(0);
      expect(Number(minutes)).toBeLessThanOrEqual(59);
    });
  });

  describe('buildExpiresAt (méthode privée)', () => {
    it('retourne une chaîne ISO contenant la date et l\'heure de fin', () => {
      const result = (engine as unknown as { buildExpiresAt: (d: string, h: string) => string })
        .buildExpiresAt('2026-06-26', '15:00');

      expect(result).toContain('2026-06-26');
      expect(result).toContain('15:00');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/);
    });

    it('concatène correctement la date, l\'heure de fin et les secondes', () => {
      const result = (engine as unknown as { buildExpiresAt: (d: string, h: string) => string })
        .buildExpiresAt('2026-01-15', '09:30');

      expect(result).toBe('2026-01-15T09:30:00.000Z');
    });
  });

  // ─── Logique d'éligibilité via run() ────────────────────────────────────────

  describe('run() — filtrage des absences', () => {
    beforeEach(() => {
      // Fixe l'heure courante à 14:30 pour que le schedule 14:00-15:00 soit en fenêtre
      jest.spyOn(
        engine as unknown as { getCurrentHHmm: (tz: string) => string },
        'getCurrentHHmm',
      ).mockReturnValue('14:30');

      // Jour travaillé
      scheduleDayQb.getMany.mockResolvedValue([
        { groupId: 'group-1', isWorkDay: true },
      ] as Partial<GroupScheduleDay>[]);
    });

    it('un commercial absent timeSlot=full ne reçoit pas BREAK_PROMPT', async () => {
      commercialQb.getMany.mockResolvedValue([makeCommercial()]);
      planningQb.getMany.mockResolvedValue([
        { commercialId: 'comm-1', timeSlot: 'full' } as Partial<CommercialPlanning>,
      ]);

      await engine.run();

      expect(mockEmit).not.toHaveBeenCalledWith(BREAK_EVENTS.BREAK_PROMPT, expect.anything());
    });

    it('un commercial absent timeSlot=morning avec startTime=09:00 ne reçoit pas BREAK_PROMPT', async () => {
      const morningSchedule = makeSchedule({ startTime: '09:00:00', endTime: '10:00:00' });
      commercialQb.getMany.mockResolvedValue([
        makeCommercial({ subGroup: makeSubGroup({ breakSchedules: [morningSchedule] }) }),
      ]);
      planningQb.getMany.mockResolvedValue([
        { commercialId: 'comm-1', timeSlot: 'morning' } as Partial<CommercialPlanning>,
      ]);

      await engine.run();

      expect(mockEmit).not.toHaveBeenCalledWith(BREAK_EVENTS.BREAK_PROMPT, expect.anything());
    });

    it('un commercial absent timeSlot=morning avec startTime=14:00 reçoit BREAK_PROMPT', async () => {
      // startTime='14:00' >= '12:00' → l'absence morning ne bloque pas la plage d'après-midi
      commercialQb.getMany.mockResolvedValue([makeCommercial()]);
      planningQb.getMany.mockResolvedValue([
        { commercialId: 'comm-1', timeSlot: 'morning' } as Partial<CommercialPlanning>,
      ]);

      await engine.run();

      expect(mockEmit).toHaveBeenCalledWith(
        BREAK_EVENTS.BREAK_PROMPT,
        expect.objectContaining({ breakScheduleId: 'sched-1' }),
      );
    });

    it('un commercial absent timeSlot=afternoon avec startTime=14:00 ne reçoit pas BREAK_PROMPT', async () => {
      // startTime='14:00' >= '12:00' → l'absence afternoon bloque la plage
      commercialQb.getMany.mockResolvedValue([makeCommercial()]);
      planningQb.getMany.mockResolvedValue([
        { commercialId: 'comm-1', timeSlot: 'afternoon' } as Partial<CommercialPlanning>,
      ]);

      await engine.run();

      expect(mockEmit).not.toHaveBeenCalledWith(BREAK_EVENTS.BREAK_PROMPT, expect.anything());
    });
  });

  describe('run() — jour de repos', () => {
    it('un commercial en jour de repos (isWorkDay=false) ne reçoit pas BREAK_PROMPT', async () => {
      jest.spyOn(
        engine as unknown as { getCurrentHHmm: (tz: string) => string },
        'getCurrentHHmm',
      ).mockReturnValue('14:30');

      commercialQb.getMany.mockResolvedValue([makeCommercial()]);
      planningQb.getMany.mockResolvedValue([]); // pas d'absence
      scheduleDayQb.getMany.mockResolvedValue([
        { groupId: 'group-1', isWorkDay: false } as Partial<GroupScheduleDay>,
      ]);

      await engine.run();

      expect(mockEmit).not.toHaveBeenCalledWith(BREAK_EVENTS.BREAK_PROMPT, expect.anything());
    });
  });

  describe('run() — exclusion', () => {
    it('un commercial exclu ne reçoit pas BREAK_PROMPT', async () => {
      jest.spyOn(
        engine as unknown as { getCurrentHHmm: (tz: string) => string },
        'getCurrentHHmm',
      ).mockReturnValue('14:30');

      commercialQb.getMany.mockResolvedValue([makeCommercial()]);
      planningQb.getMany.mockResolvedValue([]);
      scheduleDayQb.getMany.mockResolvedValue([
        { groupId: 'group-1', isWorkDay: true } as Partial<GroupScheduleDay>,
      ]);
      // Exclusion commerciale sur le sous-groupe
      mockExclusionService.findBySubGroups.mockResolvedValue([
        { subGroupId: 'sg-1', scope: 'commercial', commercialId: 'comm-1', posteId: null },
      ]);

      await engine.run();

      expect(mockEmit).not.toHaveBeenCalledWith(BREAK_EVENTS.BREAK_PROMPT, expect.anything());
    });
  });

  describe('run() — pause déjà prise', () => {
    it('un commercial ayant déjà pris sa pause ne reçoit pas BREAK_PROMPT', async () => {
      jest.spyOn(
        engine as unknown as { getCurrentHHmm: (tz: string) => string },
        'getCurrentHHmm',
      ).mockReturnValue('14:30');

      commercialQb.getMany.mockResolvedValue([makeCommercial()]);
      planningQb.getMany.mockResolvedValue([]);
      scheduleDayQb.getMany.mockResolvedValue([
        { groupId: 'group-1', isWorkDay: true } as Partial<GroupScheduleDay>,
      ]);
      // Session déjà prise pour ce commercial × schedule
      mockSessionService.bulkHasTaken.mockResolvedValue(new Set(['comm-1:sched-1']));

      await engine.run();

      expect(mockEmit).not.toHaveBeenCalledWith(BREAK_EVENTS.BREAK_PROMPT, expect.anything());
    });
  });

  describe('run() — aucun connecté', () => {
    it('retourne immédiatement sans requête si aucun commercial connecté', async () => {
      mockGateway.getConnectedCommercialIds.mockReturnValue([]);

      await engine.run();

      expect(mockCommercialRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });
});
