/**
 * Normalise un numéro de téléphone vers sa forme locale courte (chiffres uniquement, sans indicatif).
 * Exemples :
 *   "+2250700000001" → "0700000001"
 *   "2250700000001"  → "0700000001"
 *   "0700000001"     → "0700000001"
 *   " +225 07 00 000001 " → "0700000001"
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Retirer indicatif +225 (Côte d'Ivoire) si présent
  if (digits.startsWith('225') && digits.length === 13) {
    return digits.slice(3); // "2250700000001" → "0700000001"
  }
  return digits;
}

/** Retourne true si deux numéros normalisés correspondent. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length > 0 && na === nb;
}
