"use client";

import React, { useState } from 'react';
import { Bell, Check, Trash2, MessageCircle, ListOrdered, AlertTriangle, Info, RefreshCw, Filter } from 'lucide-react';
import { Notification as AdminNotification, NotificationType } from '@/app/hooks/useNotifications';
import { Spinner } from './Spinner';
import { formatRelativeDate } from '@/app/lib/dateUtils';

interface NotificationsViewProps {
  notifications: AdminNotification[];
  total: number;
  loading: boolean;
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onReload: () => void;
}

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  message: <MessageCircle className="w-4 h-4 text-blue-500" />,
  queue:   <ListOrdered   className="w-4 h-4 text-green-500" />,
  alert:   <AlertTriangle className="w-4 h-4 text-red-500" />,
  info:    <Info          className="w-4 h-4 text-gray-500" />,
};

const TYPE_BADGE: Record<NotificationType, string> = {
  message: 'bg-blue-100 text-blue-700',
  queue:   'bg-green-100 text-green-700',
  alert:   'bg-red-100 text-red-700',
  info:    'bg-gray-100 text-gray-700',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  message: 'Message',
  queue:   'File d\'attente',
  alert:   'Alerte',
  info:    'Info',
};

const FILTERS: { key: 'all' | NotificationType | 'unread'; label: string }[] = [
  { key: 'all',     label: 'Toutes' },
  { key: 'unread',  label: 'Non lues' },
  { key: 'message', label: 'Messages' },
  { key: 'queue',   label: 'File d\'attente' },
  { key: 'alert',   label: 'Alertes' },
  { key: 'info',    label: 'Infos' },
];

export default function NotificationsView({
  notifications,
  total,
  loading,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onReload,
}: NotificationsViewProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | NotificationType | 'unread'>('all');

  const filtered = notifications.filter((n) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unread') return !n.read;
    return n.type === activeFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500">
              {total} au total · {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onReload}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            title="Rafraîchir"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
            >
              <Check className="w-4 h-4" /> Tout marquer lu
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
            >
              <Trash2 className="w-4 h-4" /> Tout supprimer
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400 mr-1" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              activeFilter === f.key
                ? 'bg-slate-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            {f.key === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Bell className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Aucune notification</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((n) => (
              <li
                key={n.id}
                onClick={() => { if (!n.read) onMarkAsRead(n.id); }}
                className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-gray-50 ${
                  !n.read ? 'bg-blue-50/40' : ''
                }`}
              >
                {/* Icône type */}
                <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  {TYPE_ICONS[n.type]}
                </div>

                {/* Contenu */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${TYPE_BADGE[n.type]}`}>
                      {TYPE_LABELS[n.type]}
                    </span>
                    {!n.read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</p>
                </div>

                {/* Date */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-[11px] text-gray-400">
                    {formatRelativeDate(new Date(n.createdAt))}
                  </p>
                  {!n.read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMarkAsRead(n.id); }}
                      className="mt-1 text-[11px] text-blue-600 hover:underline"
                    >
                      Marquer lu
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
