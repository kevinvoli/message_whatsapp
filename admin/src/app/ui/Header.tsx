import React, { useState, useRef, useEffect } from 'react';
import { Download, Bell, Check, Trash2, MessageCircle, ListOrdered, AlertTriangle, Info } from 'lucide-react';
import { NavigationItem } from '@/app/lib/definitions';
import { Notification } from '@/app/hooks/useNotifications';

interface HeaderProps {
    selectedPeriod: string;
    setSelectedPeriod: (value: string) => void;
    viewMode: string;
    navigationItems: NavigationItem[];
    notifications?: Notification[];
    unreadCount?: number;
    onMarkAsRead?: (id: string) => void;
    onMarkAllAsRead?: () => void;
    onClearNotifications?: () => void;
}

const notificationIcon = (type: Notification['type']) => {
    switch (type) {
        case 'message': return <MessageCircle className="w-4 h-4 text-blue-500" />;
        case 'queue': return <ListOrdered className="w-4 h-4 text-green-500" />;
        case 'alert': return <AlertTriangle className="w-4 h-4 text-red-500" />;
        default: return <Info className="w-4 h-4 text-gray-500" />;
    }
};

const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'A l\'instant';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return `Il y a ${Math.floor(hours / 24)}j`;
};

export default function Header({
    selectedPeriod,
    setSelectedPeriod,
    viewMode,
    navigationItems,
    notifications = [],
    unreadCount = 0,
    onMarkAsRead,
    onMarkAllAsRead,
    onClearNotifications,
}: HeaderProps) {
    const [showNotifications, setShowNotifications] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Close panel on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setShowNotifications(false);
            }
        };
        if (showNotifications) {
            document.addEventListener('mousedown', handler);
        }
        return () => document.removeEventListener('mousedown', handler);
    }, [showNotifications]);

    return (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {navigationItems.find(item => item.id === viewMode)?.name || 'Dashboard'}
                    </h1>
                    <p className="text-sm text-gray-600">Gestion et suivi en temps reel</p>
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
                        <option value="year">Cette annee</option>
                    </select>

                    {/* Notifications bell */}
                    <div className="relative" ref={panelRef}>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg relative"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notifications panel */}
                        {showNotifications && (
                            <div className="absolute right-0 top-12 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                                    <div className="flex items-center gap-2">
                                        {unreadCount > 0 && onMarkAllAsRead && (
                                            <button
                                                onClick={onMarkAllAsRead}
                                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                            >
                                                <Check className="w-3 h-3" /> Tout lire
                                            </button>
                                        )}
                                        {notifications.length > 0 && onClearNotifications && (
                                            <button
                                                onClick={onClearNotifications}
                                                className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {notifications.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                                            Aucune notification
                                        </div>
                                    ) : (
                                        notifications.map((n) => (
                                            <div
                                                key={n.id}
                                                onClick={() => onMarkAsRead?.(n.id)}
                                                className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 flex items-start gap-3 ${
                                                    !n.read ? 'bg-blue-50/50' : ''
                                                }`}
                                            >
                                                <div className="mt-0.5 flex-shrink-0">{notificationIcon(n.type)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                                        {n.title}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">{n.message}</p>
                                                    <p className="text-[10px] text-gray-400 mt-1">
                                                        {formatTimeAgo(n.timestamp)}
                                                    </p>
                                                </div>
                                                {!n.read && (
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>
                </div>
            </div>
        </div>
    );
}
