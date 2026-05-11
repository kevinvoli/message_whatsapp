'use client';
import React, { useState } from 'react';
import ClientsView from '@/app/ui/ClientsView';
import CrmView from '@/app/modules/crm/components/CrmView';

type Tab = 'clients' | 'crm';

const TABS: { id: Tab; label: string }[] = [
  { id: 'clients', label: 'Clients'    },
  { id: 'crm',     label: 'Champs CRM' },
];

export default function ClientsCrmTabsView() {
  const [active, setActive] = useState<Tab>('clients');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
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
      {active === 'clients' && <ClientsView onRefresh={() => {}} />}
      {active === 'crm'     && <CrmView />}
    </div>
  );
}
