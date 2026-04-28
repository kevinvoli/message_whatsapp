"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, Briefcase, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { useChatStore } from '@/store/chatStore';
import WorkSchedulePanel from './WorkSchedulePanel';
import AttendancePanel from './AttendancePanel';
import CreateFollowUpModal from '@/components/chat/CreateFollowUpModal';
import { FollowUpType } from '@/types/chat';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BizContact {
  id: string;
  name: string;
  phone: string;
  chat_id?: string | null;
  client_category?: string | null;
  last_message_date?: string | null;
}

type Tab = 'prospects' | 'annulee' | 'anciennes' | 'planning' | 'pointage';

type BizTab = 'prospects' | 'annulee' | 'anciennes';

const TAB_CONFIG: Record<BizTab, { label: string; endpoint: string; badge: string; color: string }> = {
  prospects:  { label: 'Prospects',         endpoint: 'contact/business/prospects', badge: 'bg-blue-100 text-blue-700',   color: 'blue' },
  annulee:    { label: 'Commandes annulées', endpoint: 'contact/business/annulee',   badge: 'bg-red-100 text-red-700',    color: 'red' },
  anciennes:  { label: 'Anciennes',          endpoint: 'contact/business/anciennes', badge: 'bg-gray-100 text-gray-700',  color: 'gray' },
};

const CATEGORY_LABELS: Record<string, string> = {
  jamais_commande:          'Jamais commandé',
  commande_sans_livraison:  'Sans livraison',
  commande_annulee:         'Annulée',
  commande_avec_livraison:  'Livré',
};

// ─── Composant contact card ─────────────────────────────────────────────────

const TAB_TYPE_MAP: Record<BizTab, FollowUpType> = {
  prospects: 'relance_sans_commande',
  annulee:   'relance_post_annulation',
  anciennes: 'relance_fidelisation',
};

interface ContactCardProps {
  contact: BizContact;
  onOpenConversation: (chatId: string) => void;
  onPlanRelance: () => void;
}

function ContactCard({ contact, onOpenConversation, onPlanRelance }: ContactCardProps) {
  return (
    <div className="px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
          <p className="text-xs text-gray-400 font-mono">{contact.phone}</p>
          {contact.client_category && (
            <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded mt-0.5 inline-block">
              {CATEGORY_LABELS[contact.client_category] ?? contact.client_category}
            </span>
          )}
          {contact.last_message_date && (
            <p className="text-[10px] text-gray-400 mt-0.5">Dernier message : {formatDate(contact.last_message_date)}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onPlanRelance}
            title="Planifier une relance"
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
          {contact.chat_id && (
            <button
              onClick={() => onOpenConversation(contact.chat_id!)}
              className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
            >
              Ouvrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────────────

export default function BusinessMenusPanel() {
  const [tab, setTab]             = useState<Tab>('prospects');
  const [data, setData]           = useState<Record<BizTab, BizContact[]>>({
    prospects: [], annulee: [], anciennes: [],
  });
  const [counts, setCounts]       = useState<Record<BizTab, number>>({ prospects: 0, annulee: 0, anciennes: 0 });
  const [loading, setLoading]     = useState<Record<BizTab, boolean>>({ prospects: false, annulee: false, anciennes: false });
  const [expanded, setExpanded]   = useState<Record<BizTab, boolean>>({ prospects: true, annulee: true, anciennes: true });
  const [followUpModal, setFollowUpModal] = useState<{ contactId: string; defaultType: FollowUpType } | null>(null);

  const selectConversation = useChatStore((s) => s.selectConversation);

  const loadTab = useCallback(async (t: BizTab) => {
    setLoading((prev) => ({ ...prev, [t]: true }));
    try {
      const res = await fetch(`${API_URL}/${TAB_CONFIG[t].endpoint}`, { credentials: 'include' });
      if (res.ok) {
        const contacts = await res.json() as BizContact[];
        setData((prev) => ({ ...prev, [t]: contacts }));
        setCounts((prev) => ({ ...prev, [t]: contacts.length }));
      }
    } catch { /* silencieux */ }
    finally { setLoading((prev) => ({ ...prev, [t]: false })); }
  }, []);

  useEffect(() => { void loadTab('prospects'); }, [loadTab]);
  useEffect(() => {
    if (tab !== 'planning') void loadTab(tab as BizTab);
  }, [tab, loadTab]);

  const handleOpenConversation = (chatId: string) => {
    selectConversation(chatId);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <Briefcase className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-semibold text-gray-800">Menus métier</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(Object.entries(TAB_CONFIG) as [BizTab, typeof TAB_CONFIG[BizTab]][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 text-[11px] font-medium py-2 border-b-2 transition-colors ${
              tab === key
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {cfg.label}
            {counts[key] > 0 && (
              <span className={`ml-1 text-[10px] px-1 py-0.5 rounded-full ${cfg.badge}`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setTab('planning')}
          className={`flex-1 text-[11px] font-medium py-2 border-b-2 transition-colors ${
            tab === 'planning'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Planning
        </button>
        <button
          onClick={() => setTab('pointage')}
          className={`flex-1 text-[11px] font-medium py-2 border-b-2 transition-colors ${
            tab === 'pointage'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Pointage
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'planning' ? (
          <WorkSchedulePanel />
        ) : tab === 'pointage' ? (
          <AttendancePanel />
        ) : (
          <>
            {loading[tab as BizTab] && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}

            {!loading[tab as BizTab] && data[tab as BizTab].length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <AlertCircle className="w-8 h-8" />
                <p className="text-xs text-center">
                  {tab === 'prospects' && 'Aucun prospect à relancer dans votre portefeuille.'}
                  {tab === 'annulee' && 'Aucune commande annulée dans votre portefeuille.'}
                  {tab === 'anciennes' && 'Aucune cliente inactive depuis 60 jours.'}
                </p>
              </div>
            )}

            {!loading[tab as BizTab] && data[tab as BizTab].length > 0 && (
              <>
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                    {data[tab as BizTab].length} contact{data[tab as BizTab].length > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => void loadTab(tab as BizTab)}
                    className="p-0.5 text-gray-400 hover:text-gray-600"
                    title="Rafraîchir"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                {data[tab as BizTab].map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onOpenConversation={handleOpenConversation}
                    onPlanRelance={() => setFollowUpModal({ contactId: contact.id, defaultType: TAB_TYPE_MAP[tab as BizTab] })}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {followUpModal && (
        <CreateFollowUpModal
          contactId={followUpModal.contactId}
          defaultType={followUpModal.defaultType}
          onClose={() => setFollowUpModal(null)}
          onDone={() => setFollowUpModal(null)}
        />
      )}
    </div>
  );
}
