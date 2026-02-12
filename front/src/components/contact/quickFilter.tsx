import React from 'react';
import { Phone, PhoneCall, Clock, PhoneMissed, AlertCircle } from 'lucide-react';
import { CallStatus } from '@/types/chat';

interface QuickFiltersProps {
    activeFilter: CallStatus | 'all';
    onFilterChange: (filter: CallStatus | 'all') => void;
    counts: {
        all: number;
        à_appeler: number;
        appelé: number;
        rappeler: number;
        non_joignable: number;
    };
}

/**
 * Composant de filtres rapides pour la vue contacts en sidebar
 * Permet de filtrer rapidement les contacts par statut d'appel
 */
export const QuickFilters: React.FC<QuickFiltersProps> = ({
    activeFilter,
    onFilterChange,
    counts,
}) => {
    const filters = [
        {
            id: 'all' as const,
            label: 'Tous',
            icon: AlertCircle,
            color: 'gray',
            count: counts.all,
        },
        {
            id: 'à_appeler' as const,
            label: 'À appeler',
            icon: Phone,
            color: 'blue',
            count: counts.à_appeler,
        },
        {
            id: 'appelé' as const,
            label: 'Appelés',
            icon: PhoneCall,
            color: 'green',
            count: counts.appelé,
        },
        {
            id: 'rappeler' as const,
            label: 'À rappeler',
            icon: Clock,
            color: 'orange',
            count: counts.rappeler,
        },
        {
            id: 'non_joignable' as const,
            label: 'Non joignables',
            icon: PhoneMissed,
            color: 'gray',
            count: counts.non_joignable,
        },
    ];

    const getButtonClass = (filterId: string, color: string) => {
        const isActive = activeFilter === filterId;
        
        const colorClasses = {
            gray: isActive
                ? 'bg-gray-100 text-gray-900 border-gray-300'
                : 'text-gray-600 hover:bg-gray-50',
            blue: isActive
                ? 'bg-blue-100 text-blue-900 border-blue-300'
                : 'text-blue-600 hover:bg-blue-50',
            green: isActive
                ? 'bg-green-100 text-green-900 border-green-300'
                : 'text-green-600 hover:bg-green-50',
            orange: isActive
                ? 'bg-orange-100 text-orange-900 border-orange-300'
                : 'text-orange-600 hover:bg-orange-50',
        };

        return `flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            isActive ? 'border-2 font-medium' : 'border-transparent'
        } ${colorClasses[color as keyof typeof colorClasses]}`;
    };

    return (
        <div className="p-3 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Filtres rapides
            </p>
            <div className="space-y-1">
                {filters.map((filter) => {
                    const Icon = filter.icon;
                    return (
                        <button
                            key={filter.id}
                            onClick={() => onFilterChange(filter.id)}
                            className={getButtonClass(filter.id, filter.color)}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span className="text-sm flex-1 text-left">{filter.label}</span>
                            <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                    activeFilter === filter.id
                                        ? 'bg-white'
                                        : 'bg-gray-100'
                                }`}
                            >
                                {filter.count}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};