import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BreakSupervisionService, BreakSupervisionRow } from './break-supervision.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { BreakSession } from './entities/break-session.entity';
import { ConnectionLog } from 'src/connection-log/entities/connection-log.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { CommercialSubGroup } from './entities/commercial-sub-group.entity';
import { SubGroupBreakSchedule } from './entities/sub-group-break-schedule.entity';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<SubGroupBreakSchedule> = {}): SubGroupBreakSchedule {
  return {
    id: 'sched-1',
    subGroupId: 'sg-1',
    startTime: '14:00:00',
    endTime: '15:00:00',
    reminderIntervalMinutes: 5,
    popupMessageText: null,
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
    name: 'Équipe Matin',
    description: null,
    isActive: true,
    breakSchedules: [makeSchedule()],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as CommercialSubGroup;
}

function makeCommercialMock(
  id: string,
  name: string,
  subGroup: CommercialSubGroup | null = null,
): WhatsappCommercial {
  return { id, name, subGroup } as unknown as WhatsappCommercial;
}

function makeSessionMock(
  commercialId: string,
  status: 'taken' | 'missed',
  takenAt: Date | null = null,
): BreakSession {
  return {
    id: `session-${commercialId}`,
    commercialId,
    breakScheduleId: 'sched-1',
    date: new Date().toISOString().slice(0, 10),
    status,
    takenAt,
    createdAt: new Date(),
  } as BreakSession;
}

function makeConnectionLogMock(userId: string, loginAt: Date): ConnectionLog {
  return {
    id: `log-${userId}`,
    userId,
    userType: 'commercial',
    loginAt,
    logoutAt: null,
    alertedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ConnectionLog;
}

// ─── Setup module ────────────────────────────────────────────────────────────

describe('BreakSupervisionService', () => {
  let service: BreakSupervisionService;

  let commercialQb: Record<string, jest.Mock>;
  let sessionQb: Record<string, jest.Mock>;
  let connLogQb: Record<string, jest.Mock>;

  const mockGateway = {
    getConnectedCommercialIds: jest.fn(),
  };

  const mockSystemConfig = {
    get: jest.fn().mockResolvedValue('Africa/Abidjan'),
  };

  const mockCommercialRepo = { createQueryBuilder: jest.fn() };
  const mockSessionRepo = { createQueryBuilder: jest.fn() };
  const mockConnLogRepo = { createQueryBuilder: jest.fn() };

  function makeFluent(): Record<string, jest.Mock> {
    return {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    commercialQb = makeFluent();
    sessionQb = makeFluent();
    connLogQb = makeFluent();

    mockCommercialRepo.createQueryBuilder.mockReturnValue(commercialQb);
    mockSessionRepo.createQueryBuilder.mockReturnValue(sessionQb);
    mockConnLogRepo.createQueryBuilder.mockReturnValue(connLogQb);

    mockSystemConfig.get.mockResolvedValue('Africa/Abidjan');
    mockGateway.getConnectedCommercialIds.mockReturnValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakSupervisionService,
        { provide: getRepositoryToken(WhatsappCommercial), useValue: mockCommercialRepo },
        { provide: getRepositoryToken(BreakSession), useValue: mockSessionRepo },
        { provide: getRepositoryToken(ConnectionLog), useValue: mockConnLogRepo },
        { provide: WhatsappMessageGateway, useValue: mockGateway },
        { provide: SystemConfigService, useValue: mockSystemConfig },
      ],
    }).compile();

    service = module.get<BreakSupervisionService>(BreakSupervisionService);

    // Fixe nowHHmm à 10:00 pour ne pas interférer avec les fenêtres de pause
    jest.spyOn(
      service as unknown as { getCurrentHHmm: (tz: string) => string },
      'getCurrentHHmm',
    ).mockReturnValue('10:00');
  });

  // ─── Cas : aucun commercial ──────────────────────────────────────────────────

  it('retourne [] si aucun commercial en base', async () => {
    commercialQb.getMany.mockResolvedValue([]);

    const result = await service.getSupervision();

    expect(result).toEqual([]);
  });

  // ─── Cas : en_service ────────────────────────────────────────────────────────

  it('un commercial connecté sans sous-groupe a status=en_service', async () => {
    const commercial = makeCommercialMock('comm-1', 'Alice', null);
    mockGateway.getConnectedCommercialIds.mockReturnValue(['comm-1']);
    commercialQb.getMany.mockResolvedValue([commercial]);
    sessionQb.getMany.mockResolvedValue([]);  // aucune session
    connLogQb.getMany.mockResolvedValue([]);  // aucun log ouvert

    const result = await service.getSupervision();

    expect(result).toHaveLength(1);
    const row = result[0] as BreakSupervisionRow;
    expect(row.commercialId).toBe('comm-1');
    expect(row.status).toBe('en_service');
    expect(row.subGroupId).toBeNull();
    expect(row.hasTakenBreak).toBe(false);
    expect(row.disconnectDurationMinutes).toBeNull();
  });

  // ─── Cas : en_pause ─────────────────────────────────────────────────────────

  it('un commercial avec session status=taken a status=en_pause et hasTakenBreak=true', async () => {
    const takenAt = new Date();
    const commercial = makeCommercialMock('comm-1', 'Bob', makeSubGroup());
    const session = makeSessionMock('comm-1', 'taken', takenAt);

    mockGateway.getConnectedCommercialIds.mockReturnValue(['comm-1']);
    commercialQb.getMany.mockResolvedValue([commercial]);
    sessionQb.getMany.mockResolvedValue([session]);
    connLogQb.getMany.mockResolvedValue([]);

    const result = await service.getSupervision();

    expect(result).toHaveLength(1);
    const row = result[0] as BreakSupervisionRow;
    expect(row.status).toBe('en_pause');
    expect(row.hasTakenBreak).toBe(true);
    expect(row.breakTakenAt).toBe(takenAt.toISOString());
  });

  // ─── Cas : pause_manquee ────────────────────────────────────────────────────

  it('un commercial avec session status=missed a status=pause_manquee', async () => {
    const commercial = makeCommercialMock('comm-1', 'Claire', makeSubGroup());
    const session = makeSessionMock('comm-1', 'missed', null);

    mockGateway.getConnectedCommercialIds.mockReturnValue(['comm-1']);
    commercialQb.getMany.mockResolvedValue([commercial]);
    sessionQb.getMany.mockResolvedValue([session]);
    connLogQb.getMany.mockResolvedValue([]);

    const result = await service.getSupervision();

    expect(result).toHaveLength(1);
    const row = result[0] as BreakSupervisionRow;
    expect(row.status).toBe('pause_manquee');
    expect(row.hasTakenBreak).toBe(false);
    expect(row.breakTakenAt).toBeNull();
  });

  // ─── Cas : deconnecte ───────────────────────────────────────────────────────

  it('un commercial non connecté avec un ConnectionLog ouvert a status=deconnecte et disconnectDurationMinutes > 0', async () => {
    const loginAt = new Date(Date.now() - 2 * 60_000); // connecté il y a 2 minutes
    const commercial = makeCommercialMock('comm-1', 'David', null);
    const openLog = makeConnectionLogMock('comm-1', loginAt);

    mockGateway.getConnectedCommercialIds.mockReturnValue([]); // non connecté
    commercialQb.getMany.mockResolvedValue([commercial]);
    sessionQb.getMany.mockResolvedValue([]);
    connLogQb.getMany.mockResolvedValue([openLog]);

    const result = await service.getSupervision();

    expect(result).toHaveLength(1);
    const row = result[0] as BreakSupervisionRow;
    expect(row.status).toBe('deconnecte');
    expect(row.disconnectDurationMinutes).not.toBeNull();
    expect(row.disconnectDurationMinutes as number).toBeGreaterThan(0);
  });

  // ─── Cas : repos ────────────────────────────────────────────────────────────

  it('un commercial non connecté sans ConnectionLog ouvert a status=repos', async () => {
    const commercial = makeCommercialMock('comm-1', 'Eve', null);

    mockGateway.getConnectedCommercialIds.mockReturnValue([]); // non connecté
    commercialQb.getMany.mockResolvedValue([commercial]);
    sessionQb.getMany.mockResolvedValue([]);
    connLogQb.getMany.mockResolvedValue([]); // aucun log ouvert

    const result = await service.getSupervision();

    expect(result).toHaveLength(1);
    const row = result[0] as BreakSupervisionRow;
    expect(row.status).toBe('repos');
    expect(row.disconnectDurationMinutes).toBeNull();
  });

  // ─── Contrat de retour ───────────────────────────────────────────────────────

  it('chaque ligne respecte le contrat BreakSupervisionRow', async () => {
    const commercial = makeCommercialMock('comm-1', 'Frank', makeSubGroup());
    const session = makeSessionMock('comm-1', 'taken', new Date());

    mockGateway.getConnectedCommercialIds.mockReturnValue(['comm-1']);
    commercialQb.getMany.mockResolvedValue([commercial]);
    sessionQb.getMany.mockResolvedValue([session]);
    connLogQb.getMany.mockResolvedValue([]);

    const result = await service.getSupervision();

    const row = result[0] as BreakSupervisionRow;
    expect(row).toHaveProperty('commercialId');
    expect(row).toHaveProperty('commercialName');
    expect(row).toHaveProperty('subGroupId');
    expect(row).toHaveProperty('subGroupName');
    expect(row).toHaveProperty('scheduledBreak');
    expect(row).toHaveProperty('hasTakenBreak');
    expect(row).toHaveProperty('breakTakenAt');
    expect(row).toHaveProperty('disconnectDurationMinutes');
    expect(row).toHaveProperty('status');
    expect(typeof row.commercialId).toBe('string');
    expect(typeof row.commercialName).toBe('string');
    expect(typeof row.hasTakenBreak).toBe('boolean');
  });

  // ─── Pas de N+1 ──────────────────────────────────────────────────────────────

  it('charge les sessions en une seule requête groupée (pas de N+1)', async () => {
    const commercials = [
      makeCommercialMock('comm-1', 'Alice', makeSubGroup()),
      makeCommercialMock('comm-2', 'Bob', makeSubGroup()),
      makeCommercialMock('comm-3', 'Claire', makeSubGroup()),
    ];
    const sessions = [
      makeSessionMock('comm-1', 'taken', new Date()),
      makeSessionMock('comm-2', 'missed', null),
    ];

    mockGateway.getConnectedCommercialIds.mockReturnValue(['comm-1', 'comm-2', 'comm-3']);
    commercialQb.getMany.mockResolvedValue(commercials);
    sessionQb.getMany.mockResolvedValue(sessions);
    connLogQb.getMany.mockResolvedValue([]);

    const result = await service.getSupervision();

    // Une seule requête session pour 3 commerciaux — pas de N+1
    expect(mockSessionRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });
});
