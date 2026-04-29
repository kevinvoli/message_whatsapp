import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTime,
  formatDateShort,
  formatDate,
  formatDateLong,
  formatDateTimeWithSeconds,
  formatRelativeDate,
  formatConversationTime,
} from '@/app/lib/dateUtils';

describe('dateUtils — formatTime', () => {
  it('retourne "--:--" pour null', () => {
    expect(formatTime(null)).toBe('--:--');
  });

  it('retourne "--:--" pour undefined', () => {
    expect(formatTime(undefined)).toBe('--:--');
  });

  it('retourne "--:--" pour une date invalide', () => {
    expect(formatTime('not-a-date')).toBe('--:--');
  });

  it('formate une date valide en HH:mm', () => {
    const result = formatTime(new Date(2026, 1, 18, 14, 30, 0));
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result).toBe('14:30');
  });

  it('accepte une string ISO', () => {
    const result = formatTime('2026-02-18T14:30:00Z');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('accepte un timestamp number', () => {
    const ts = new Date(2026, 1, 18, 9, 5, 0).getTime();
    expect(formatTime(ts)).toBe('09:05');
  });
});

describe('dateUtils — formatDateShort', () => {
  it('retourne "-" pour null', () => {
    expect(formatDateShort(null)).toBe('-');
  });

  it('retourne "-" pour undefined', () => {
    expect(formatDateShort(undefined)).toBe('-');
  });

  it('retourne "-" pour une date invalide', () => {
    expect(formatDateShort('invalid')).toBe('-');
  });

  it('formate la date en DD/MM/YYYY', () => {
    const result = formatDateShort(new Date(2026, 1, 18, 14, 30, 0));
    expect(result).toBe('18/02/2026');
  });
});

describe('dateUtils — formatDate', () => {
  it('retourne "-" pour null', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('retourne "-" pour une date invalide', () => {
    expect(formatDate('garbage')).toBe('-');
  });

  it('combine date courte et heure', () => {
    const result = formatDate(new Date(2026, 1, 18, 14, 30, 0));
    expect(result).toBe('18/02/2026 14:30');
  });
});

describe('dateUtils — formatDateLong', () => {
  it('retourne "-" pour null', () => {
    expect(formatDateLong(null)).toBe('-');
  });

  it('retourne "-" pour une date invalide', () => {
    expect(formatDateLong('not-valid')).toBe('-');
  });

  it('contient le jour de la semaine, le mois en clair et l\'heure', () => {
    const result = formatDateLong(new Date(2026, 1, 18, 14, 30, 0));
    expect(result).toContain('février');
    expect(result).toContain('2026');
    expect(result).toContain('à');
    expect(result).toContain('14:30');
  });
});

describe('dateUtils — formatDateTimeWithSeconds', () => {
  it('retourne "-" pour null', () => {
    expect(formatDateTimeWithSeconds(null)).toBe('-');
  });

  it('retourne "-" pour une date invalide', () => {
    expect(formatDateTimeWithSeconds('bad')).toBe('-');
  });

  it('formate avec les secondes', () => {
    const result = formatDateTimeWithSeconds(new Date(2026, 1, 18, 14, 30, 25));
    expect(result).toBe('18/02/2026 14:30:25');
  });
});

describe('dateUtils — formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 18, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retourne "-" pour null', () => {
    expect(formatRelativeDate(null)).toBe('-');
  });

  it('retourne "-" pour une date invalide', () => {
    expect(formatRelativeDate('xx')).toBe('-');
  });

  it('retourne "À l\'instant" pour il y a quelques secondes', () => {
    const date = new Date(2026, 1, 18, 11, 59, 30);
    expect(formatRelativeDate(date)).toBe("À l'instant");
  });

  it('retourne "Il y a Xmin" pour il y a moins de 60 minutes', () => {
    const date = new Date(2026, 1, 18, 11, 30, 0);
    expect(formatRelativeDate(date)).toBe('Il y a 30min');
  });

  it('retourne "Il y a Xh" pour il y a moins de 24h', () => {
    const date = new Date(2026, 1, 18, 7, 0, 0);
    expect(formatRelativeDate(date)).toBe('Il y a 5h');
  });

  it('retourne "Hier" pour il y a 1 jour', () => {
    const date = new Date(2026, 1, 17, 12, 0, 0);
    expect(formatRelativeDate(date)).toBe('Hier');
  });

  it('retourne "Il y a X jours" pour 2-6 jours', () => {
    const date = new Date(2026, 1, 15, 12, 0, 0);
    expect(formatRelativeDate(date)).toBe('Il y a 3 jours');
  });

  it('retourne "Il y a X sem." pour 7-29 jours', () => {
    const date = new Date(2026, 1, 4, 12, 0, 0);
    expect(formatRelativeDate(date)).toBe('Il y a 2 sem.');
  });

  it('retourne la date courte pour 30+ jours', () => {
    const date = new Date(2026, 0, 1, 12, 0, 0);
    expect(formatRelativeDate(date)).toBe('01/01/2026');
  });
});

describe('dateUtils — formatConversationTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 18, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retourne "-" pour null', () => {
    expect(formatConversationTime(null)).toBe('-');
  });

  it('retourne "-" pour une date invalide', () => {
    expect(formatConversationTime('zzz')).toBe('-');
  });

  it("retourne l'heure pour aujourd'hui", () => {
    const date = new Date(2026, 1, 18, 9, 30, 0);
    expect(formatConversationTime(date)).toBe('09:30');
  });

  it('retourne "Hier" pour la veille', () => {
    const date = new Date(2026, 1, 17, 22, 0, 0);
    expect(formatConversationTime(date)).toBe('Hier');
  });

  it('retourne le jour court pour cette semaine', () => {
    const date = new Date(2026, 1, 14, 10, 0, 0);
    const result = formatConversationTime(date);
    expect(result).toMatch(/sam/i);
  });

  it('retourne DD/MM pour plus de 7 jours', () => {
    const date = new Date(2026, 0, 10, 10, 0, 0);
    expect(formatConversationTime(date)).toBe('10/01');
  });
});
