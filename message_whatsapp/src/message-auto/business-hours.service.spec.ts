import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BusinessHoursService } from './business-hours.service';
import { BusinessHoursConfig } from './entities/business-hours-config.entity';

// Jour de référence : Mercredi 2026-04-08 (getDay() === 3)
const WEDNESDAY = 3;
const BASE_ISO  = '2026-04-08T';

function makeConfig(overrides: Partial<BusinessHoursConfig> = {}): BusinessHoursConfig {
  return {
    id: '1',
    dayOfWeek:   WEDNESDAY,
    openHour:    9,
    openMinute:  0,
    closeHour:   18,
    closeMinute: 0,
    isOpen:      true,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  } as BusinessHoursConfig;
}

describe('BusinessHoursService', () => {
  let service: BusinessHoursService;
  let repoFindOne: jest.Mock;

  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  beforeEach(async () => {
    repoFindOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessHoursService,
        {
          provide: getRepositoryToken(BusinessHoursConfig),
          useValue: {
            find:     jest.fn(),
            findOne:  repoFindOne,
            save:     jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BusinessHoursService);
  });

  // ─── isCurrentlyOpen ────────────────────────────────────────────────────────

  describe('isCurrentlyOpen()', () => {
    it('retourne false si aucune config trouvée pour le jour', async () => {
      jest.setSystemTime(new Date(`${BASE_ISO}10:00:00`));
      repoFindOne.mockResolvedValue(null);

      expect(await service.isCurrentlyOpen()).toBe(false);
    });

    it('retourne false si le jour est fermé (isOpen=false)', async () => {
      jest.setSystemTime(new Date(`${BASE_ISO}10:00:00`));
      repoFindOne.mockResolvedValue(makeConfig({ isOpen: false }));

      expect(await service.isCurrentlyOpen()).toBe(false);
    });

    it('retourne true quand l\'heure est dans la plage d\'ouverture', async () => {
      // 10:30 → dans 09:00–18:00
      jest.setSystemTime(new Date(`${BASE_ISO}10:30:00`));
      repoFindOne.mockResolvedValue(makeConfig());

      expect(await service.isCurrentlyOpen()).toBe(true);
    });

    it('retourne true sur l\'heure d\'ouverture exacte (borne incluse)', async () => {
      jest.setSystemTime(new Date(`${BASE_ISO}09:00:00`));
      repoFindOne.mockResolvedValue(makeConfig());

      expect(await service.isCurrentlyOpen()).toBe(true);
    });

    it('retourne false à l\'heure de fermeture exacte (borne exclue)', async () => {
      jest.setSystemTime(new Date(`${BASE_ISO}18:00:00`));
      repoFindOne.mockResolvedValue(makeConfig());

      expect(await service.isCurrentlyOpen()).toBe(false);
    });

    it('retourne false avant l\'ouverture', async () => {
      // 07:45 → avant 09:00
      jest.setSystemTime(new Date(`${BASE_ISO}07:45:00`));
      repoFindOne.mockResolvedValue(makeConfig());

      expect(await service.isCurrentlyOpen()).toBe(false);
    });

    it('retourne false après la fermeture', async () => {
      // 21:00 → après 18:00
      jest.setSystemTime(new Date(`${BASE_ISO}21:00:00`));
      repoFindOne.mockResolvedValue(makeConfig());

      expect(await service.isCurrentlyOpen()).toBe(false);
    });

    it('prend en compte les minutes dans la plage', async () => {
      // 09:29 → dans 09:30–12:00
      jest.setSystemTime(new Date(`${BASE_ISO}09:29:00`));
      repoFindOne.mockResolvedValue(makeConfig({ openHour: 9, openMinute: 30, closeHour: 12, closeMinute: 0 }));

      expect(await service.isCurrentlyOpen()).toBe(false);

      // 09:30 → dans 09:30–12:00 (borne incluse)
      jest.setSystemTime(new Date(`${BASE_ISO}09:30:00`));
      expect(await service.isCurrentlyOpen()).toBe(true);
    });

    it('passe le bon dayOfWeek au repository', async () => {
      // Lundi → getDay() === 1
      jest.setSystemTime(new Date('2026-04-06T10:00:00')); // Lundi
      repoFindOne.mockResolvedValue(makeConfig({ dayOfWeek: 1 }));

      await service.isCurrentlyOpen();

      expect(repoFindOne).toHaveBeenCalledWith({ where: { dayOfWeek: 1 } });
    });
  });

  // ─── updateDay ───────────────────────────────────────────────────────────────

  describe('updateDay()', () => {
    it('lève NotFoundException si le jour n\'existe pas', async () => {
      repoFindOne.mockResolvedValue(null);

      await expect(service.updateDay(WEDNESDAY, { isOpen: false })).rejects.toThrow();
    });
  });
});
