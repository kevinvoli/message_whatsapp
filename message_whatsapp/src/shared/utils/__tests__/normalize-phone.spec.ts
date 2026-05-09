import { normalizePhone, phonesMatch } from '../normalize-phone';

describe('normalizePhone', () => {
  it('retire +225 et garde 10 chiffres', () => {
    expect(normalizePhone('+2250700000001')).toBe('0700000001');
  });
  it('retire 225 sans + et garde 10 chiffres', () => {
    expect(normalizePhone('2250700000001')).toBe('0700000001');
  });
  it('garde le numéro local tel quel', () => {
    expect(normalizePhone('0700000001')).toBe('0700000001');
  });
  it('ignore espaces et tirets', () => {
    expect(normalizePhone(' +225 07 00 000001 ')).toBe('0700000001');
  });
  it('retourne chaîne vide pour null', () => {
    expect(normalizePhone(null)).toBe('');
  });
  it('retourne chaîne vide pour undefined', () => {
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('phonesMatch', () => {
  it('matche +225 avec forme locale', () => {
    expect(phonesMatch('+2250700000001', '0700000001')).toBe(true);
  });
  it('ne matche pas deux chaînes vides', () => {
    expect(phonesMatch(null, null)).toBe(false);
  });
  it('ne matche pas des numéros différents', () => {
    expect(phonesMatch('0700000001', '0700000002')).toBe(false);
  });
});
