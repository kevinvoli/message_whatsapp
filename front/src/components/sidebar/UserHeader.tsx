import React, { useRef, useEffect } from 'react';
import { User, Search, Wifi, WifiOff, LogOut, MessageSquare, Users, Bell } from 'lucide-react';
import { Commercial, Conversation, ViewMode } from '@/types/chat';

interface UserHeaderProps {
    conversation: Conversation[];
    totalUnread: number;
    setShowStats: (show: boolean) => void;
    showStats: boolean;
    commercial: Commercial;
    isConnected: boolean;
    onLogout: () => void;
    // 🆕 Nouveaux props pour la gestion des vues
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
}

export default function UserHeader({
    conversation,
    totalUnread,
    commercial,
    isConnected,
    onLogout,
    viewMode = 'conversations',
    onViewModeChange,
    searchQuery = '',
    onSearchChange,
}: UserHeaderProps) {
    
    const searchRef = useRef<HTMLInputElement>(null);

    const handleViewChange = (mode: ViewMode) => {
        onViewModeChange?.(mode);
    };

    useEffect(() => {
        const handler = () => searchRef.current?.focus();
        document.addEventListener('app:focus-search', handler);
        return () => document.removeEventListener('app:focus-search', handler);
    }, []);

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
                                    <span className="text-xs">Connecté</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-3 h-3" />
                                    <span className="text-xs">Déconnecté</span>
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

            {/* 🆕 Switch entre Conversations et Contacts */}
            {onViewModeChange && (
                <div className="mb-3 bg-green-700 bg-opacity-50 rounded-lg p-1 flex gap-1">
                    <button
                        onClick={() => handleViewChange('conversations')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-md transition-all ${
                            viewMode === 'conversations'
                                ? 'bg-white text-green-700 shadow-md font-medium'
                                : 'text-green-100 hover:bg-green-600 hover:bg-opacity-50'
                        }`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-xs">Conv.</span>
                    </button>
                    <button
                        onClick={() => handleViewChange('contacts')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-md transition-all ${
                            viewMode === 'contacts'
                                ? 'bg-white text-green-700 shadow-md font-medium'
                                : 'text-green-100 hover:bg-green-600 hover:bg-opacity-50'
                        }`}
                    >
                        <Users className="w-4 h-4" />
                        <span className="text-xs">Contacts</span>
                    </button>
                    <button
                        onClick={() => handleViewChange('relances')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-2 rounded-md transition-all ${
                            viewMode === 'relances'
                                ? 'bg-white text-green-700 shadow-md font-medium'
                                : 'text-green-100 hover:bg-green-600 hover:bg-opacity-50'
                        }`}
                    >
                        <Bell className="w-4 h-4" />
                        <span className="text-xs">Relances</span>
                    </button>
                </div>
            )}

            {/* Stats rapides */}

            {
               viewMode === 'conversations' ? (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-green-700 bg-opacity-50 rounded p-2 text-center">
                    <p className="text-xs text-green-100">Actives</p>
                    <p className="text-lg font-bold">
                        {conversation?.filter((con) => con.status === 'actif').length}
                    </p>
                </div>
                <div className="bg-green-700 bg-opacity-50 rounded p-2 text-center">
                    <p className="text-xs text-green-100">Non lus</p>
                    <p className="text-lg font-bold">{totalUnread}</p>
                </div>
                <div className="bg-green-700 bg-opacity-50 rounded p-2 text-center">
                    <p className="text-xs text-green-100">Conv.</p>
                    <p className="text-lg font-bold">{conversation?.length}</p>
                </div>
            </div>
               ) : <div></div>
            }

          




            {/* Barre de recherche */}
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange?.(e.target.value)}
                    placeholder={
                        viewMode === 'conversations'
                            ? 'Rechercher (Ctrl+K)...'
                            : 'Rechercher un contact...'
                    }
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-green-700 text-white placeholder-green-200 focus:outline-none focus:ring-2 focus:ring-white"
                />
            </div>
        </div>
    );
}