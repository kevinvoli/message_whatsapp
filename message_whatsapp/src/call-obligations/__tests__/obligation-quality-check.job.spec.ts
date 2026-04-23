import { ObligationQualityCheckJob } from '../obligation-quality-check.job';

// ─── Mock CronConfigService ────────────────────────────────────────────────────

function makeCronConfigService() {
  return {
    registerHandler: jest.fn(),
  } as any;
}

// ─── Mock CallObligationService ────────────────────────────────────────────────

function makeObligationService(posteIds: string[] = [], qualityResults: boolean[] = []) {
  let runCallIdx = 0;
  return {
    getActivePosteIds: jest.fn().mockResolvedValue(posteIds),
    runQualityCheck: jest.fn().mockImplementation(async () => qualityResults[runCallIdx++] ?? true),
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ObligationQualityCheckJob', () => {

  it('enregistre le handler au démarrage du module', () => {
    const cronConfigSvc = makeCronConfigService();
    const job = new ObligationQualityCheckJob(cronConfigSvc, makeObligationService());
    job.onModuleInit();
    expect(cronConfigSvc.registerHandler).toHaveBeenCalledWith(
      'obligation-quality-check',
      expect.any(Function),
    );
  });

  it('retourne early si aucun batch actif', async () => {
    const obligationSvc = makeObligationService([]);
    const job = new ObligationQualityCheckJob(makeCronConfigService(), obligationSvc);

    const msg = await job.run();
    expect(msg).toBe('Aucun batch actif — rien à vérifier');
    expect(obligationSvc.runQualityCheck).not.toHaveBeenCalled();
  });

  it('lance runQualityCheck pour chaque poste actif', async () => {
    const obligationSvc = makeObligationService(['poste-1', 'poste-2'], [true, false]);
    const job = new ObligationQualityCheckJob(makeCronConfigService(), obligationSvc);

    const msg = await job.run();
    expect(obligationSvc.runQualityCheck).toHaveBeenCalledTimes(2);
    expect(obligationSvc.runQualityCheck).toHaveBeenCalledWith('poste-1');
    expect(obligationSvc.runQualityCheck).toHaveBeenCalledWith('poste-2');
    expect(msg).toContain('1 poste(s) OK');
    expect(msg).toContain('1 poste(s) KO');
  });

  it('tous les postes passent la qualité', async () => {
    const obligationSvc = makeObligationService(['poste-1', 'poste-2', 'poste-3'], [true, true, true]);
    const job = new ObligationQualityCheckJob(makeCronConfigService(), obligationSvc);

    const msg = await job.run();
    expect(msg).toContain('3 poste(s) OK');
    expect(msg).toContain('0 poste(s) KO');
  });
});
