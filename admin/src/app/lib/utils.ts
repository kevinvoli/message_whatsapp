// admin/src/app/lib/utils.ts

/**
 * Obtient la couleur du statut de connexion
 */
export const getStatusColor = (isConnected: boolean): string => {
  return isConnected ? 'bg-green-500' : 'bg-gray-400';
};

/**
 * Obtient le badge de performance basé sur le taux de réponse
 */
export const getPerformanceBadge = (tauxReponse: number): string => {
  if (tauxReponse >= 80) return 'bg-green-100 text-green-800';
  if (tauxReponse >= 60) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

/**
 * Obtient le texte de performance
 */
export const getPerformanceText = (tauxReponse: number): string => {
  if (tauxReponse >= 80) return 'Excellent';
  if (tauxReponse >= 60) return 'Moyen';
  return 'Faible';
};

/**
 * Formate le temps en secondes en format lisible (minutes/heures)
 */
export const formatTemps = (seconds: number): string => {
  if (seconds === 0) return '0min';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h${remainingMinutes}min`;
};

/**
 * Formate une date en format relatif (il y a X min/heures/jours)
 */
export const formatDateRelative = (dateString: string | null): string => {
  if (!dateString) return 'Jamais';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins}min`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `Il y a ${diffWeeks}sem`;
  
  return date.toLocaleDateString('fr-FR');
};

/**
 * Formate un nombre avec des séparateurs de milliers
 */
export const formatNumber = (num: number): string => {
  return num.toLocaleString('fr-FR');
};

/**
 * Formate un pourcentage
 */
export const formatPercentage = (value: number, total: number): string => {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
};

/**
 * Obtient la classe CSS pour un badge de statut
 */
export const getStatusBadgeClass = (isConnected: boolean): string => {
  return isConnected 
    ? 'bg-green-100 text-green-800' 
    : 'bg-gray-100 text-gray-800';
};

/**
 * Obtient le texte du statut
 */
export const getStatusText = (isConnected: boolean): string => {
  return isConnected ? 'En ligne' : 'Hors ligne';
};

/**
 * Calcule la variation en pourcentage
 * TODO: Implémenter avec les vraies données historiques
 */
export const calculateVariation = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
};

/**
 * Détermine si une alerte doit être affichée
 */
export const shouldShowAlert = (type: 'messages' | 'chats' | 'team', value: number, threshold?: number): boolean => {
  switch (type) {
    case 'messages':
      return value > (threshold || 10);
    case 'chats':
      return value > (threshold || 5);
    case 'team':
      return value < (threshold || 50); // Pourcentage minimum
    default:
      return false;
  }
};

/**
 * Génère une couleur pour un graphique basée sur un index
 */
export const getChartColor = (index: number): string => {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-red-500',
  ];
  return colors[index % colors.length];
};

/**
 * Tronque un texte avec ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Génère des initiales à partir d'un nom
 */
export const getInitials = (name: string): string => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

/**
 * Détermine le niveau d'uptime d'un channel
 */
export const getUptimeLevel = (uptime: number): 'excellent' | 'good' | 'warning' => {
  if (uptime > 80000) return 'excellent'; // Plus de ~22h
  if (uptime > 40000) return 'good';      // Plus de ~11h
  return 'warning';
};

/**
 * Obtient la couleur selon le niveau d'uptime
 */
export const getUptimeColor = (uptime: number): string => {
  const level = getUptimeLevel(uptime);
  switch (level) {
    case 'excellent': return 'bg-green-500';
    case 'good': return 'bg-yellow-500';
    case 'warning': return 'bg-red-500';
  }
};

type AdminMessageLike = {
  text?: string | null;
  mediaType?: string;
};

/**
 * Harmonise l'affichage des messages sans texte en admin.
 */
export const resolveAdminMessageText = (message: AdminMessageLike): string => {
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (text.length > 0) {
    return text;
  }

  switch ((message.mediaType || '').toLowerCase()) {
    case 'image':
      return '[Photo client]';
    case 'video':
      return '[Video client]';
    case 'audio':
    case 'voice':
      return '[Message vocal client]';
    case 'document':
      return '[Document client]';
    case 'location':
    case 'live_location':
      return '[Localisation client]';
    default:
      return '[Message client]';
  }
};
