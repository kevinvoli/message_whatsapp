'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/contexts/SocketProvider';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CallStatus, Conversation, ViewMode } from '@/types/chat';
import type { QuizPdf } from '@/lib/definitions';
import { useStatsStore } from '@/store/stats.store';
import ChatMainArea from '@/components/chat/ChatMainArea';
import { ContactDetailView } from '@/components/contacts/ContactDetailView';
import { logger } from '@/lib/logger';
import ConversationRestrictionModal from '@/components/ConversationRestrictionModal';
import MediaPanel from '@/components/panel/MediaPanel';
import { getPanelMedia } from '@/lib/api';
import { PlanningBadgeJour } from '@/components/planning/PlanningBadgeJour';
import { PlanningVueCommercial } from '@/components/planning/PlanningVueCommercial';

const VALID_FILTER_STATUSES = ['all', 'unread', 'nouveau'];

const WhatsAppPageContent = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const {
    conversations,
    selectedConversation,
    selectConversation,
    totalUnread: totalUnreadFromStore,
    loadConversations,
  } = useChatStore();
  const conversationsUnread = useChatStore((s) => s.conversationsUnread);
  const conversationsNouveau = useChatStore((s) => s.conversationsNouveau);
  const loadUnreadConversations = useChatStore((s) => s.loadUnreadConversations);
  const loadNouveauConversations = useChatStore((s) => s.loadNouveauConversations);
  
  const { isConnected: isWebSocketConnected } = useSocket();
  const { stats } = useStatsStore();

  const [showStats, setShowStats] = useState(false);
  const rawFilter = searchParams.get('filter') ?? 'all';
  const [filterStatus, setFilterStatus] = useState(
    VALID_FILTER_STATUSES.includes(rawFilter) ? rawFilter : 'all'
  );
  const rawView = searchParams.get('view') as ViewMode;
  const [viewMode, setViewMode] = useState<ViewMode>(
    rawView === 'contacts' ? 'contacts' : 'conversations'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelEnabled, setPanelEnabled] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<QuizPdf | null>(null);
  const [showPlanning, setShowPlanning] = useState(false);
  const testBreak = searchParams.get('testBreak') === '1';

  useEffect(() => {
    getPanelMedia(1, 1)
      .then(r => {
        console.log('[MediaPanel] response:', r);
        setPanelEnabled(r.enabled);
      })
      .catch((err) => console.error('[MediaPanel] error:', err));
  }, []);

  // Évite un double chargement au montage (WebSocketEvents.tsx gère le premier via refreshAfterConnect)
  const isInitialSearchMount = useRef(true);

  // Protection de route
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login');
    }
  }, [initialized, user, router]);

  // Gérer la sélection d'une conversation
  const handleSelectConversation = useCallback((conversation: Conversation) => {
    logger.debug('Conversation selected', {
      chat_id: conversation.chat_id,
    });
    setViewingPdf(null);
    selectConversation(conversation.chat_id);
  }, [selectConversation]);

  // Envoyer un message

  
  const totalMessages = selectedConversation ? selectedConversation.messages?.length : 0;
  // totalUnread est mis à jour dans setUnreadConversations via conversationsUnread.length.
  // Fallback sur totalUnreadFromStore pendant le chargement initial.
  const totalUnread = totalUnreadFromStore;

  // Recherche côté serveur : quand searchQuery change, recharger les 3 onglets depuis le backend.
  // Debounce 300 ms pour éviter de spammer à chaque frappe.
  // On skip le premier render car WebSocketEvents.tsx gère le chargement initial.
  useEffect(() => {
    if (isInitialSearchMount.current) {
      isInitialSearchMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const search = searchQuery || undefined;
      loadConversations(search);
      loadUnreadConversations(search);
      loadNouveauConversations(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadConversations, loadUnreadConversations, loadNouveauConversations]);

  const filteredConversations = useMemo(() => {
    switch (filterStatus) {
      case 'unread':  return conversationsUnread;
      case 'nouveau': return conversationsNouveau;
      default:        return conversations;
    }
  }, [filterStatus, conversations, conversationsUnread, conversationsNouveau]);

  const socket = useChatStore((s) => s.socket);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSearchQuery('');
    if (mode === 'contacts' && socket) {
      socket.emit('contacts:get');
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const handleSetFilterStatus = useCallback((status: string) => {
    setFilterStatus(status);
    if (status === 'unread') {
      loadUnreadConversations(searchQuery || undefined);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('filter', status);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router, loadUnreadConversations, searchQuery]);

  if (!initialized || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">

      <Sidebar
        commercial={user}
        conversations={filteredConversations}
        allConversations={conversations}
        searchTerm=""
        selectedConversation={selectedConversation}
        isConnected={isWebSocketConnected}
        onSelectConversation={handleSelectConversation}

        setFilterStatus={handleSetFilterStatus}
        stats={stats}
        filterStatus={filterStatus}
        totalUnread={totalUnread}
        setShowStats={setShowStats}
        showStats={showStats}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onViewPdf={setViewingPdf}
      />
      {viewingPdf ? (
        <PdfViewerPanel pdf={viewingPdf} onClose={() => setViewingPdf(null)} />
      ) : viewMode === 'conversations' ? (
        <ChatMainArea panelEnabled={panelEnabled} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen(p => !p)} testBreak={testBreak} />
      ) : (
        <ContactDetailView onSwitchToConversations={() => handleViewModeChange('conversations')} />
      )}
      {panelEnabled && panelOpen && (
        <MediaPanel onClose={() => setPanelOpen(false)} />
      )}

      <ConversationRestrictionModal />

      {/* Bouton Mon planning — coin inférieur gauche */}
      <button
        onClick={() => setShowPlanning(true)}
        className="fixed bottom-4 left-4 z-30 bg-white border border-gray-200 shadow-md rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors flex items-center gap-1.5"
        title="Mon planning"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Mon planning
      </button>

      {/* Modale planning */}
      {showPlanning && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          onClick={() => setShowPlanning(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 text-sm">Mon planning</h2>
              <button
                onClick={() => setShowPlanning(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <div className="mb-3">
              <PlanningBadgeJour />
            </div>
            <PlanningVueCommercial />
          </div>
        </div>
      )}
    </div>
  );
};

const WhatsAppPage = () => (
  <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>}>
    <WhatsAppPageContent />
  </Suspense>
);

export default WhatsAppPage;

// ---------------------------------------------------------------------------
// Viewer PDF dans la zone principale
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

function PdfViewerPanel({ pdf, onClose }: { pdf: QuizPdf; onClose: () => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white">
      {/* Barre du haut */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={onClose}
          aria-label="Fermer le document"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <span className="flex-1 truncate text-sm font-medium text-gray-800">
          {pdf.originalName}
        </span>
        <a
          href={`${API_BASE_URL}/quiz/pdfs/${pdf.id}/download`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Telecharger
        </a>
      </div>

      {/* Iframe pleine hauteur */}
      <iframe
        src={`${API_BASE_URL}/quiz/pdfs/${pdf.id}/view`}
        title={pdf.originalName}
        className="flex-1 w-full border-none"
      />
    </div>
  );
}
