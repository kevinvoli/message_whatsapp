const LOCALE = 'fr-FR';

/** Convertit une valeur en Date valide ou retourne null */
function safeDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Heure seule : "14:30" */
export function formatTime(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '--:--';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** Date courte : "18/02/2026" */
export function formatDateShort(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Date + heure : "18/02/2026 14:30" */
export function formatDate(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return `${formatDateShort(d)} ${formatTime(d)}`;
}

/** Date longue : "mardi 18 février 2026 à 14:30" */
export function formatDateLong(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  const datePart = d.toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = formatTime(d);
  return `${datePart} à ${timePart}`;
}

/** Date + heure + secondes : "18/02/2026 14:30:25" */
export function formatDateTimeWithSeconds(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  const time = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${formatDateShort(d)} ${time}`;
}

/** Date relative : "Il y a 2h", "Hier", "Il y a 3 jours", ou date courte si > 7j */
export function formatRelativeDate(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';

  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin}min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  return formatDateShort(d);
}

/**
 * Format intelligent pour les sidebars de conversation :
 * - Aujourd'hui : "14:30"
 * - Cette semaine : "Lun."
 * - Plus ancien : "18/02"
 */
export function formatConversationTime(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 86400000) return formatTime(d);
  if (diffMs < 604800000) return d.toLocaleDateString(LOCALE, { weekday: 'short' });
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}
