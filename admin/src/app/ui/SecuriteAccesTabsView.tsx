'use client';
import React, { useState } from 'react';
import RolesView from '@/app/modules/rbac/components/RolesView';
import IpAccessView from '@/app/ui/IpAccessView';
import LoginLogsView from '@/app/ui/LoginLogsView';

type Tab = 'roles' | 'ip-access' | 'login-logs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'roles',      label: 'Rôles & permissions'  },
  { id: 'ip-access',  label: "Restrictions d'accès" },
  { id: 'login-logs', label: 'Journal connexions'   },
];

export default function SecuriteAccesTabsView() {
  const [active, setActive] = useState<Tab>('roles');

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
      {active === 'roles'      && <RolesView />}
      {active === 'ip-access'  && <IpAccessView />}
      {active === 'login-logs' && <LoginLogsView />}
    </div>
  );
}
