import { DomainError } from 'src/domain/shared/domain.error';

/**
 * Value Object représentant un numéro de téléphone WhatsApp.
 * Format attendu : digits seuls, ex "33612345678" ou avec @s.whatsapp.net
 */
export class PhoneNumber {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(raw: string): PhoneNumber {
    if (!raw) throw new DomainError('PhoneNumber ne peut pas être vide');
    // Normalise : retire le suffixe whatsapp si présent
    const normalized = raw.split('@')[0].trim();
    if (!/^\+?\d{7,15}$/.test(normalized)) {
      throw new DomainError(`PhoneNumber invalide : "${raw}"`);
    }
    return new PhoneNumber(normalized);
  }

  /** Crée sans validation (pour reconstruction depuis la BDD) */
  static fromPersistence(value: string): PhoneNumber {
    return new PhoneNumber(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: PhoneNumber): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
