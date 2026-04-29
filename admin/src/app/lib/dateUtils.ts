const LOCALE = 'fr-FR';

function safeDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTime(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '--:--';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateShort(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDate(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  return `${formatDateShort(d)} ${formatTime(d)}`;
}

export function formatDateLong(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  const datePart = d.toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${datePart} à ${formatTime(d)}`;
}

export function formatDateTimeWithSeconds(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';
  const time = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${formatDateShort(d)} ${time}`;
}

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

export function formatConversationTime(value: Date | string | number | null | undefined): string {
  const d = safeDate(value);
  if (!d) return '-';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7DaysAgo = new Date(startOfToday.getTime() - 6 * 86400000);

  if (d >= startOfToday) return formatTime(d);
  if (d >= startOfYesterday) return 'Hier';
  if (d >= startOf7DaysAgo) return d.toLocaleDateString(LOCALE, { weekday: 'short' });
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}
