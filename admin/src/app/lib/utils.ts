
export const getStatusColor = (status: 'online' | 'away' | 'offline') => {
    switch(status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  export const getPerformanceBadge = (performance: 'excellent' | 'moyen' | 'faible') => {
    switch(performance) {
      case 'excellent': return 'bg-green-100 text-green-800';
      case 'moyen': return 'bg-yellow-100 text-yellow-800';
      case 'faible': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
