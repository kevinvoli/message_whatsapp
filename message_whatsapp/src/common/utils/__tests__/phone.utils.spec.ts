import { normalizePhone } from 'src/common/utils/phone.utils';

describe('normalizePhone', () => {
  it('laisse un numéro E.164 algérien inchangé', () => {
    expect(normalizePhone('+213612345678')).toBe('+213612345678');
  });

  it('normalise 0XXXXXXXXX (10 chiffres) vers +213XXXXXXXXX', () => {
    expect(normalizePhone('0612345678')).toBe('+213612345678');
  });

  it('ajoute + si le numéro commence par 213 (sans +)', () => {
    expect(normalizePhone('213612345678')).toBe('+213612345678');
  });

  it('laisse un numéro français E.164 inchangé', () => {
    expect(normalizePhone('+33612345678')).toBe('+33612345678');
  });

  it('retire les espaces et normalise 0X en algérien si 10 chiffres', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+213612345678');
  });

  it('ajoute + devant 0033612345678 (pas de normalisation — plus de 10 chiffres)', () => {
    expect(normalizePhone('0033612345678')).toBe('+0033612345678');
  });
});
