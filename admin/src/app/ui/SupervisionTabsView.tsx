'use client';
import React, { useState } from 'react';
import SystemHealthView from '@/app/ui/SystemHealthView';
import ObservabiliteView from '@/app/modules/observability/components/ObservabiliteView';
import NotificationsView from '@/app/modules/notifications/components/NotificationsView';
import AlertConfigView from '@/app/modules/notifications/components/AlertConfigView';
import GoNoGoView from '@/app/modules/observability/components/GoNoGoView';
import { useNotifications } from '@/app/modules/notifications/hooks/useNotifications';
import { useSystemHealth } from '@/app/hooks/useSystemHealth';

type Tab = 'system-health' | 'observabilite' | 'notifications' | 'alert-config' | 'go_no_go';

const TABS: { id: Tab; label: string }[] = [
  { id: 'system-health',  label: 'Santé serveur'  },
  { id: 'observabilite',  label: 'Observabilité'  },
  { id: 'notifications',  label: 'Notifications'  },
  { id: 'alert-config',   label: 'Alertes système' },
  { id: 'go_no_go',       label: 'GO/NO-GO'       },
];

export default function SupervisionTabsView() {
  const [active, setActive] = useState<Tab>('system-health');

  const {
    notifications,
    total,
    loading,
    unreadCount,
    reload,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const { refresh: refreshHealth } = useSystemHealth();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'system-health' && <SystemHealthView />}
      {active === 'observabilite' && <ObservabiliteView />}
      {active === 'notifications' && (
        <NotificationsView
          notifications={notifications}
          total={total}
          loading={loading}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClearAll={clearAll}
          onReload={reload}
        />
      )}
      {active === 'alert-config' && <AlertConfigView onStatusRefresh={refreshHealth} />}
      {active === 'go_no_go'     && <GoNoGoView />}
    </div>
  );
}
