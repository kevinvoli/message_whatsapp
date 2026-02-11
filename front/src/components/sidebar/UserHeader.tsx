import React from 'react';
import { User, Search, BarChart3, Wifi, WifiOff, LogOut } from 'lucide-react';
import { Commercial, Stats } from '@/types/chat';


interface UserHeaderProps {
    stats?: Stats | null;
    totalUnread: number;
    setShowStats: (show: boolean) => void;
    showStats: boolean;
    commercial: Commercial;
    isConnected: boolean;
    onLogout: () => void;
}

export default function UserHeader({ stats, totalUnread, setShowStats, showStats, commercial, isConnected,onLogout }: UserHeaderProps) {
    return (
        <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                            <User className="w-6 h-6 text-green-600" />
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-yellow-400 border-2 border-white rounded-full"></div>
                    </div>
                    <div>
                        <h2 className="font-semibold">{commercial.name}</h2>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                            {isConnected ? (
                                <>
                                    <Wifi className="w-3 h-3" />
                                    <span>Connecté</span>
                                </>
                            ) : (

                                <>
                                    <WifiOff className="w-3 h-3" />
                                    <span>Déconnecté</span>
                                </>

                            )}
                        </div>
                    </div>
                </div>
                 <button
            onClick={onLogout}
             className="p-2 hover:bg-green-700 rounded-full transition-colors"
             title="Déconnexion"
          >
            <LogOut className="w-5 h-5" />
          </button>
            </div>

            {/* Stats rapides */}
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-green-700 bg-opacity-50 rounded p-2 text-center">
                    <p className="text-xs text-green-100">Actives</p>
                    <p className="text-lg font-bold">{stats?.conversationsActives}</p>
                </div>
                <div className="bg-green-700 bg-opacity-50 rounded p-2 text-center">
                    <p className="text-xs text-green-100">Non lus</p>
                    <p className="text-lg font-bold">{totalUnread}</p>
                </div>
                <div className="bg-green-700 bg-opacity-50 rounded p-2 text-center">
                    <p className="text-xs text-green-100">Conv.</p>
                    <p className="text-lg font-bold">{stats?.conversionsJour}</p>
                </div>
            </div>

            {/* Barre de recherche */}
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Rechercher une conversation..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-green-700 text-white placeholder-green-200 focus:outline-none focus:ring-2 focus:ring-white"
                />
            </div>
        </div>
    );
}
