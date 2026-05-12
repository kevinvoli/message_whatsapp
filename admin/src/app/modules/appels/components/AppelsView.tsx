'use client';

import { useState } from 'react';
import { Phone, PhoneOff, PhoneMissed, PhoneCall } from 'lucide-react';
import MissedCallsTab from './MissedCallsTab';
import CallTasksTab from './CallTasksTab';
import { CallTaskCategory } from '@/app/lib/api/call-tasks.api';

type TabId = 'absence' | 'sans-commande' | 'annules' | 'livres';

interface TabConfig {
    id: TabId;
    label: string;
    icon: React.ElementType;
    iconColor: string;
}

const TABS: TabConfig[] = [
    { id: 'absence',       label: 'Appels en absence', icon: PhoneOff,   iconColor: 'text-red-500'    },
    { id: 'sans-commande', label: 'Sans commande',      icon: PhoneMissed,iconColor: 'text-yellow-500' },
    { id: 'annules',       label: 'Annulés',            icon: PhoneOff,   iconColor: 'text-orange-500' },
    { id: 'livres',        label: 'Livrés',             icon: PhoneCall,  iconColor: 'text-green-500'  },
];

const CATEGORY_MAP: Record<Exclude<TabId, 'absence'>, CallTaskCategory> = {
    'sans-commande': 'jamais_commande',
    'annules':       'commande_annulee',
    'livres':        'commande_avec_livraison',
};

export default function AppelsView() {
    const [activeTab, setActiveTab] = useState<TabId>('absence');

    const renderContent = () => {
        if (activeTab === 'absence') return <MissedCallsTab />;
        return <CallTasksTab category={CATEGORY_MAP[activeTab]} />;
    };

    return (
        <div className="space-y-6 p-6">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Phone className="w-6 h-6 text-blue-500" />
                Appels
            </h1>

            {/* Onglets */}
            <div className="border-b border-gray-200">
                <nav className="flex gap-1 -mb-px">
                    {TABS.map(({ id, label, icon: Icon, iconColor }) => {
                        const active = activeTab === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                    active
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : iconColor}`} />
                                {label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Contenu de l'onglet actif */}
            <div>{renderContent()}</div>
        </div>
    );
}
