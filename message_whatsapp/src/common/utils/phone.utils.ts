/**
 * Normalise un numéro de téléphone en format E.164.
 * - Retire tout sauf chiffres et +
 * - Normalise le préfixe algérien 0X → +213X (10 chiffres)
 * - Ajoute + si manquant
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');

  // Préfixe algérien : 0XXXXXXXXX (10 chiffres) → +213XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 10) {
    return '+213' + digits.slice(1);
  }

  // Ajouter + si absent
  if (!digits.startsWith('+')) return '+' + digits;
  return digits;
}
