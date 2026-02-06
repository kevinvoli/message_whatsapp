import React from 'react';
import { Download, Bell } from 'lucide-react';
import { NavigationItem } from '@/app/lib/definitions';

interface HeaderProps {
    selectedPeriod: string;
    setSelectedPeriod: (value: string) => void;
    viewMode: string;
    navigationItems: NavigationItem[];
}

export default function Header({ selectedPeriod, setSelectedPeriod, viewMode, navigationItems }: HeaderProps) {
    return (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {navigationItems.find(item => item.id === viewMode)?.name || 'Dashboard'}
                    </h1>
                    <p className="text-sm text-gray-600">Gestion et suivi en temps réel</p>
                </div>
                <div className="flex items-center gap-4">
                    <select 
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="today">Aujourd&apos;hui</option>
                        <option value="week">Cette semaine</option>
                        <option value="month">Ce mois</option>
                        <option value="year">Cette année</option>
                    </select>

                    <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg relative">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                    </button>
                    
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>
                </div>
            </div>
        </div>
    );
}