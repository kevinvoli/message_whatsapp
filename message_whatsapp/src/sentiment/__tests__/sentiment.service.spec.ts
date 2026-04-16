import { SentimentService } from '../sentiment.service';

describe('SentimentService', () => {
  let service: SentimentService;

  beforeEach(() => {
    service = new SentimentService();
  });

  it('retourne neutre pour texte vide', () => {
    expect(service.analyze('')).toEqual({ score: 0, label: 'neutral' });
    expect(service.analyze(null)).toEqual({ score: 0, label: 'neutral' });
  });

  it('détecte un sentiment positif', () => {
    const result = service.analyze('Merci super rapide et excellent service');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0.15);
  });

  it('détecte un sentiment négatif', () => {
    const result = service.analyze('Terrible problème bug horrible lent');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(-0.15);
  });

  it('retourne neutre pour texte sans mots sentimentaux', () => {
    const result = service.analyze('Bonjour je voudrais avoir des informations');
    expect(result.label).toBe('neutral');
  });

  it('fonctionne en anglais', () => {
    const result = service.analyze('Great service amazing and fast thank you');
    expect(result.label).toBe('positive');
  });

  it('score dans la plage [-1, 1]', () => {
    const tests = [
      'super excellent parfait merci bravo génial',
      'terrible horrible impossible bug erreur problème nul',
      'bonjour comment ça va',
    ];
    for (const text of tests) {
      const { score } = service.analyze(text);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
