import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveMediaUrl,
  getStatusColor,
  getPerformanceBadge,
  getPerformanceText,
  formatTemps,
  formatNumber,
  formatPercentage,
  getStatusBadgeClass,
  getStatusText,
  calculateVariation,
  shouldShowAlert,
  getChartColor,
  truncateText,
  getInitials,
  getUptimeLevel,
  getUptimeColor,
  resolveAdminMessageText,
} from '@/app/lib/utils';

describe('utils — resolveMediaUrl', () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
  });

  it('retourne null si null', () => {
    expect(resolveMediaUrl(null)).toBeNull();
  });

  it('retourne null si undefined', () => {
    expect(resolveMediaUrl(undefined)).toBeNull();
  });

  it('retourne null si chaîne vide', () => {
    expect(resolveMediaUrl('')).toBeNull();
  });

  it('préfixe les chemins relatifs avec NEXT_PUBLIC_API_URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.com';
    expect(resolveMediaUrl('/messages/media/123')).toBe('http://api.example.com/messages/media/123');
  });

  it('supprime les slashes finaux du base URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.com//';
    expect(resolveMediaUrl('/foo')).toBe('http://api.example.com/foo');
  });

  it('retourne les URL absolues telles quelles', () => {
    expect(resolveMediaUrl('https://cdn.whapi.cloud/x.jpg')).toBe('https://cdn.whapi.cloud/x.jpg');
  });
});

describe('utils — getStatusColor', () => {
  it('renvoie la couleur verte si connecté', () => {
    expect(getStatusColor(true)).toBe('bg-green-500');
  });

  it('renvoie la couleur grise si déconnecté', () => {
    expect(getStatusColor(false)).toBe('bg-gray-400');
  });
});

describe('utils — getPerformanceBadge', () => {
  it('renvoie vert pour >= 80', () => {
    expect(getPerformanceBadge(80)).toBe('bg-green-100 text-green-800');
    expect(getPerformanceBadge(95)).toBe('bg-green-100 text-green-800');
  });

  it('renvoie jaune pour 60-79', () => {
    expect(getPerformanceBadge(60)).toBe('bg-yellow-100 text-yellow-800');
    expect(getPerformanceBadge(79)).toBe('bg-yellow-100 text-yellow-800');
  });

  it('renvoie rouge pour < 60', () => {
    expect(getPerformanceBadge(59)).toBe('bg-red-100 text-red-800');
    expect(getPerformanceBadge(0)).toBe('bg-red-100 text-red-800');
  });
});

describe('utils — getPerformanceText', () => {
  it('renvoie Excellent pour >= 80', () => {
    expect(getPerformanceText(85)).toBe('Excellent');
  });

  it('renvoie Moyen pour 60-79', () => {
    expect(getPerformanceText(70)).toBe('Moyen');
  });

  it('renvoie Faible pour < 60', () => {
    expect(getPerformanceText(50)).toBe('Faible');
  });
});

describe('utils — formatTemps', () => {
  it('renvoie "0min" si 0', () => {
    expect(formatTemps(0)).toBe('0min');
  });

  it('renvoie en minutes pour < 60min', () => {
    expect(formatTemps(120)).toBe('2min');
    expect(formatTemps(3540)).toBe('59min');
  });

  it('renvoie en heures pour multiple de 60min', () => {
    expect(formatTemps(3600)).toBe('1h');
    expect(formatTemps(7200)).toBe('2h');
  });

  it('renvoie heures + minutes', () => {
    expect(formatTemps(3660)).toBe('1h1min');
    expect(formatTemps(5400)).toBe('1h30min');
  });
});

describe('utils — formatNumber', () => {
  it('formate avec séparateurs fr-FR', () => {
    const result = formatNumber(1234567);
    expect(result).toMatch(/1.234.567/);
  });

  it('gère 0', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('utils — formatPercentage', () => {
  it('renvoie "0%" si total = 0', () => {
    expect(formatPercentage(5, 0)).toBe('0%');
  });

  it('calcule le pourcentage', () => {
    expect(formatPercentage(50, 100)).toBe('50%');
    expect(formatPercentage(1, 4)).toBe('25%');
  });

  it('arrondit le résultat', () => {
    expect(formatPercentage(1, 3)).toBe('33%');
  });
});

describe('utils — getStatusBadgeClass', () => {
  it('renvoie vert si connecté', () => {
    expect(getStatusBadgeClass(true)).toBe('bg-green-100 text-green-800');
  });

  it('renvoie gris si déconnecté', () => {
    expect(getStatusBadgeClass(false)).toBe('bg-gray-100 text-gray-800');
  });
});

describe('utils — getStatusText', () => {
  it('renvoie "En ligne" si true', () => {
    expect(getStatusText(true)).toBe('En ligne');
  });

  it('renvoie "Hors ligne" si false', () => {
    expect(getStatusText(false)).toBe('Hors ligne');
  });
});

describe('utils — calculateVariation', () => {
  it('renvoie 0 si previous = 0', () => {
    expect(calculateVariation(50, 0)).toBe(0);
  });

  it('calcule la variation positive', () => {
    expect(calculateVariation(150, 100)).toBe(50);
  });

  it('calcule la variation négative', () => {
    expect(calculateVariation(80, 100)).toBe(-20);
  });

  it('arrondit le résultat', () => {
    expect(calculateVariation(100, 33)).toBe(203);
  });
});

describe('utils — shouldShowAlert', () => {
  it('messages : true si > 10 (par défaut)', () => {
    expect(shouldShowAlert('messages', 11)).toBe(true);
    expect(shouldShowAlert('messages', 10)).toBe(false);
  });

  it('messages : utilise le seuil custom', () => {
    expect(shouldShowAlert('messages', 6, 5)).toBe(true);
  });

  it('chats : true si > 5 (par défaut)', () => {
    expect(shouldShowAlert('chats', 6)).toBe(true);
    expect(shouldShowAlert('chats', 5)).toBe(false);
  });

  it('team : true si < 50 (par défaut)', () => {
    expect(shouldShowAlert('team', 49)).toBe(true);
    expect(shouldShowAlert('team', 50)).toBe(false);
  });
});

describe('utils — getChartColor', () => {
  it('renvoie une couleur pour chaque index', () => {
    expect(getChartColor(0)).toBe('bg-blue-500');
    expect(getChartColor(1)).toBe('bg-green-500');
    expect(getChartColor(2)).toBe('bg-purple-500');
  });

  it('boucle sur les couleurs (modulo 8)', () => {
    expect(getChartColor(8)).toBe(getChartColor(0));
    expect(getChartColor(9)).toBe(getChartColor(1));
  });
});

describe('utils — truncateText', () => {
  it('ne tronque pas si <= maxLength', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
    expect(truncateText('Hello', 5)).toBe('Hello');
  });

  it('tronque et ajoute "..."', () => {
    expect(truncateText('Hello world', 5)).toBe('Hello...');
  });
});

describe('utils — getInitials', () => {
  it('prend la première lettre du prénom et du nom', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('prend les 2 premières lettres si un seul mot', () => {
    expect(getInitials('Alice')).toBe('AL');
  });

  it('met en majuscules', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('gère les espaces multiples au début/fin', () => {
    expect(getInitials('  John Doe  ')).toBe('JD');
  });
});

describe('utils — getUptimeLevel', () => {
  it('renvoie excellent pour > 80000', () => {
    expect(getUptimeLevel(90000)).toBe('excellent');
  });

  it('renvoie good pour 40001-80000', () => {
    expect(getUptimeLevel(50000)).toBe('good');
    expect(getUptimeLevel(80000)).toBe('good');
  });

  it('renvoie warning pour <= 40000', () => {
    expect(getUptimeLevel(30000)).toBe('warning');
    expect(getUptimeLevel(0)).toBe('warning');
  });
});

describe('utils — getUptimeColor', () => {
  it('renvoie vert pour excellent', () => {
    expect(getUptimeColor(90000)).toBe('bg-green-500');
  });

  it('renvoie jaune pour good', () => {
    expect(getUptimeColor(50000)).toBe('bg-yellow-500');
  });

  it('renvoie rouge pour warning', () => {
    expect(getUptimeColor(10000)).toBe('bg-red-500');
  });
});

describe('utils — resolveAdminMessageText', () => {
  it('renvoie le texte trim si présent', () => {
    expect(resolveAdminMessageText({ text: '  Hello  ' })).toBe('Hello');
  });

  it('renvoie [Message client] par défaut si pas de texte ni media reconnu', () => {
    expect(resolveAdminMessageText({})).toBe('[Message client]');
    expect(resolveAdminMessageText({ text: '' })).toBe('[Message client]');
    expect(resolveAdminMessageText({ text: null })).toBe('[Message client]');
  });

  it('renvoie chaîne vide pour les médias connus', () => {
    expect(resolveAdminMessageText({ mediaType: 'image' })).toBe('');
    expect(resolveAdminMessageText({ mediaType: 'video' })).toBe('');
    expect(resolveAdminMessageText({ mediaType: 'audio' })).toBe('');
    expect(resolveAdminMessageText({ mediaType: 'voice' })).toBe('');
    expect(resolveAdminMessageText({ mediaType: 'document' })).toBe('');
    expect(resolveAdminMessageText({ mediaType: 'location' })).toBe('');
    expect(resolveAdminMessageText({ mediaType: 'live_location' })).toBe('');
  });

  it('utilise type si mediaType absent', () => {
    expect(resolveAdminMessageText({ type: 'image' })).toBe('');
  });

  it('priorise text sur mediaType', () => {
    expect(resolveAdminMessageText({ text: 'caption', mediaType: 'image' })).toBe('caption');
  });

  it('insensible à la casse pour mediaType', () => {
    expect(resolveAdminMessageText({ mediaType: 'IMAGE' })).toBe('');
  });

  it('mediaType inconnu → [Message client]', () => {
    expect(resolveAdminMessageText({ mediaType: 'sticker' })).toBe('[Message client]');
  });
});

describe('utils — shouldShowAlert (default fallback)', () => {
  it('renvoie false pour un type inconnu', () => {
    expect(shouldShowAlert('team' as never, 100)).toBe(false);
  });
});
