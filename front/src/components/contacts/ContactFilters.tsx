'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { Contact, CallStatus, ContactFilters as Filters, Priority } from '@/types/chat';

interface ContactFiltersProps {
  contacts: Contact[];
  filters: Filters;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onFiltersChange: (f: Filters) => void;
}

const STATUS_OPTIONS: { value: CallStatus; label: string; dot: string }[] = [
  { value: 'rappeler',      label: 'À rappeler',    dot: 'bg-emerald-400' },
  { value: 'non_joignable', label: 'Non joignable', dot: 'bg-orange-400'  },
  { value: 'à_appeler',     label: 'À appeler',     dot: 'bg-blue-400'    },
  { value: 'appelé',        label: 'Appelé',        dot: 'bg-gray-400'    },
];

const PRIORITY_OPTIONS: { value: Priority; label: string; active: string; inactive: string }[] = [
  { value: 'haute',   label: 'Haute',   active: 'bg-blue-600 text-white',           inactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100'       },
  { value: 'moyenne', label: 'Moyenne', active: 'bg-amber-400 text-amber-900',       inactive: 'bg-amber-50 text-amber-700 hover:bg-amber-100'    },
  { value: 'basse',   label: 'Basse',   active: 'bg-gray-500 text-white',            inactive: 'bg-gray-100 text-gray-700 hover:bg-gray-200'      },
];

export function ContactFilters({
  contacts,
  filters,
  searchQuery,
  onSearchChange,
  onFiltersChange,
}: ContactFiltersProps) {
  const activeCount = contacts.filter((c) => c.is_active).length;

  // Compte par statut (sur TOUS les contacts, pas filtrés)
  const countByStatus = (status: CallStatus) =>
    contacts.filter((c) => c.call_status === status).length;

  function toggleStatus(value: CallStatus) {
    const cur = filters.call_status ?? [];
    onFiltersChange({
      ...filters,
      call_status: cur.includes(value) ? cur.filter((s) => s !== value) : [...cur, value],
    });
  }

  function togglePriority(value: Priority) {
    const cur = filters.priority ?? [];
    onFiltersChange({
      ...filters,
      priority: cur.includes(value) ? cur.filter((p) => p !== value) : [...cur, value],
    });
  }

  const isStatusActive  = (v: CallStatus) => (filters.call_status ?? []).includes(v);
  const isPriorityActive = (v: Priority)  => (filters.priority    ?? []).includes(v);

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-xs text-gray-500 mt-0.5">Filtrez, triez et priorisez les relances.</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
          Actifs {activeCount}
        </span>
      </div>

      {/* Recherche */}
      <div className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-700">Recherche</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Nom, téléphone, note…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Statuts */}
      <div className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-700">Statuts</span>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(({ value, label, dot }) => {
            const active = isStatusActive(value);
            const count  = countByStatus(value);
            return (
              <button
                key={value}
                onClick={() => toggleStatus(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  active
                    ? 'bg-white border-gray-300 shadow-sm text-gray-900'
                    : 'bg-blue-50 border-transparent text-gray-700 hover:bg-white hover:border-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                {label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Priorité */}
      <div className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-700">Priorité</span>
        <div className="flex flex-wrap gap-2">
          {PRIORITY_OPTIONS.map(({ value, label, active, inactive }) => (
            <button
              key={value}
              onClick={() => togglePriority(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                isPriorityActive(value) ? active : inactive
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tri */}
      <div className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-700">Trier par</span>
        <select
          value={filters.sort_by ?? 'last_call'}
          onChange={(e) =>
            onFiltersChange({ ...filters, sort_by: e.target.value as Filters['sort_by'] })
          }
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="last_call">Dernier appel</option>
          <option value="next_call">Prochain appel</option>
          <option value="name">Nom</option>
          <option value="priority">Priorité</option>
          <option value="created_at">Date de création</option>
        </select>
      </div>
    </div>
  );
}
