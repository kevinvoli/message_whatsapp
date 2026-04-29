import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatTime,
  formatDateShort,
  formatDate,
  formatDateLong,
  formatDateTimeWithSeconds,
  formatRelativeDate,
  formatConversationTime,
} from '../../../shared/dateUtils';

describe('dateUtils', () => {
  describe('formatTime', () => {
    it('renvoie "--:--" pour null', () => {
      expect(formatTime(null)).toBe('--:--');
    });

    it('renvoie "--:--" pour undefined', () => {
      expect(formatTime(undefined)).toBe('--:--');
    });

    it('renvoie "--:--" pour une date invalide (NaN)', () => {
      expect(formatTime('not-a-date')).toBe('--:--');
    });

    it('formate une Date valide en HH:MM', () => {
      const date = new Date(2026, 1, 18, 14, 30);
      expect(formatTime(date)).toMatch(/^\d{2}:\d{2}$/);
      expect(formatTime(date)).toBe('14:30');
    });

    it('formate une string ISO en HH:MM', () => {
      const iso = new Date(2026, 1, 18, 9, 5).toISOString();
      expect(formatTime(iso)).toMatch(/^\d{2}:\d{2}$/);
    });

    it('formate un timestamp number', () => {
      const ts = new Date(2026, 1, 18, 23, 59).getTime();
      expect(formatTime(ts)).toBe('23:59');
    });
  });

  describe('formatDateShort', () => {
    it('renvoie "-" pour null', () => {
      expect(formatDateShort(null)).toBe('-');
    });

    it('renvoie "-" pour undefined', () => {
      expect(formatDateShort(undefined)).toBe('-');
    });

    it('renvoie "-" pour valeur invalide', () => {
      expect(formatDateShort('garbage')).toBe('-');
    });

    it('formate une Date valide en DD/MM/YYYY', () => {
      const date = new Date(2026, 1, 18, 14, 30);
      expect(formatDateShort(date)).toBe('18/02/2026');
    });
  });

  describe('formatDate', () => {
    it('renvoie "-" pour null', () => {
      expect(formatDate(null)).toBe('-');
    });

    it('renvoie "-" pour undefined', () => {
      expect(formatDate(undefined)).toBe('-');
    });

    it('formate une Date valide en DD/MM/YYYY HH:MM', () => {
      const date = new Date(2026, 1, 18, 14, 30);
      expect(formatDate(date)).toBe('18/02/2026 14:30');
    });
  });

  describe('formatDateLong', () => {
    it('renvoie "-" pour null', () => {
      expect(formatDateLong(null)).toBe('-');
    });

    it('renvoie "-" pour undefined', () => {
      expect(formatDateLong(undefined)).toBe('-');
    });

    it('contient le jour, mois en français pour une date valide', () => {
      const date = new Date(2026, 1, 18, 14, 30);
      const result = formatDateLong(date);
      expect(result).toContain('février');
      expect(result).toContain('18');
      expect(result).toContain('2026');
      expect(result).toContain('14:30');
      expect(result).toContain('à');
    });
  });

  describe('formatDateTimeWithSeconds', () => {
    it('renvoie "-" pour null', () => {
      expect(formatDateTimeWithSeconds(null)).toBe('-');
    });

    it('renvoie "-" pour undefined', () => {
      expect(formatDateTimeWithSeconds(undefined)).toBe('-');
    });

    it('formate une Date valide en DD/MM/YYYY HH:MM:SS', () => {
      const date = new Date(2026, 1, 18, 14, 30, 25);
      expect(formatDateTimeWithSeconds(date)).toBe('18/02/2026 14:30:25');
    });
  });

  describe('formatRelativeDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 3, 29, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renvoie "-" pour null', () => {
      expect(formatRelativeDate(null)).toBe('-');
    });

    it('renvoie "-" pour undefined', () => {
      expect(formatRelativeDate(undefined)).toBe('-');
    });

    it('renvoie "À l\'instant" si moins d\'une minute', () => {
      const now = new Date();
      expect(formatRelativeDate(now)).toBe("À l'instant");
    });

    it('renvoie "Il y a Xmin" pour < 60min', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeDate(date)).toBe('Il y a 5min');
    });

    it('renvoie "Il y a Xh" pour < 24h', () => {
      const date = new Date(Date.now() - 3 * 3600 * 1000);
      expect(formatRelativeDate(date)).toBe('Il y a 3h');
    });

    it('renvoie "Hier" pour exactement 1 jour', () => {
      const date = new Date(Date.now() - 86400 * 1000);
      expect(formatRelativeDate(date)).toBe('Hier');
    });

    it('renvoie "Il y a X jours" pour < 7 jours', () => {
      const date = new Date(Date.now() - 3 * 86400 * 1000);
      expect(formatRelativeDate(date)).toBe('Il y a 3 jours');
    });

    it('renvoie "Il y a X sem." pour < 30 jours', () => {
      const date = new Date(Date.now() - 14 * 86400 * 1000);
      expect(formatRelativeDate(date)).toBe('Il y a 2 sem.');
    });

    it('renvoie une date courte pour > 30 jours', () => {
      const date = new Date(Date.now() - 60 * 86400 * 1000);
      const result = formatRelativeDate(date);
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
  });

  describe('formatConversationTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 3, 29, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('renvoie "-" pour null', () => {
      expect(formatConversationTime(null)).toBe('-');
    });

    it('renvoie "-" pour undefined', () => {
      expect(formatConversationTime(undefined)).toBe('-');
    });

    it('renvoie l\'heure si même jour', () => {
      const date = new Date(2026, 3, 29, 9, 15);
      expect(formatConversationTime(date)).toBe('09:15');
    });

    it('renvoie "Hier" si la veille', () => {
      const date = new Date(2026, 3, 28, 18, 0);
      expect(formatConversationTime(date)).toBe('Hier');
    });

    it('renvoie le jour court de la semaine si dans les 7 derniers jours', () => {
      const date = new Date(2026, 3, 25, 10, 0);
      const result = formatConversationTime(date);
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toBe('Hier');
      expect(result).not.toMatch(/^\d{2}\/\d{2}$/);
    });

    it('renvoie DD/MM si plus ancien que 7 jours', () => {
      const date = new Date(2026, 2, 15, 10, 0);
      expect(formatConversationTime(date)).toBe('15/03');
    });
  });
});
