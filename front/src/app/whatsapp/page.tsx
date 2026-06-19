'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { ConversationSidebar } from '@/components/layout/ConversationSidebar';
import ChatMainArea from '@/components/chat/ChatMainArea';
import { ContactDetailView } from '@/components/contacts/ContactDetailView';
import MediaPanel from '@/components/panel/MediaPanel';
import { ViewMode } from '@/types/chat';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { getPanelMedia } from '@/lib/mediaPanelApi';

const WhatsAppPage = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('conversations');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelEnabled, setPanelEnabled] = useState(false);
  useKeyboardShortcuts();

  useEffect(() => {
    getPanelMedia(1, 1)
      .then(r => { setPanelEnabled(r.enabled); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login');
    }
  }, [initialized, user, router]);

  if (!initialized || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Bannière absent */}
      {user && !user.isWorkingToday && user.absentToday && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700 flex-shrink-0">
          Vous êtes déclaré absent aujourd&apos;hui. Aucun appel ne vous sera attribué.
        </div>
      )}

      {/* Bannière hors planning */}
      {user && !user.isWorkingToday && !user.absentToday && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-sm text-gray-600 flex-shrink-0">
          Vous n&apos;êtes pas en service aujourd&apos;hui. Aucun appel ne vous sera attribué.
        </div>
      )}

      {/* Bannière remplaçant */}
      {user && user.isWorkingToday && user.isReplacing && (
        <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 text-sm text-purple-700 flex-shrink-0">
          Vous remplacez un collègue aujourd&apos;hui — vous gérez son poste et ses conversations.
        </div>
      )}

      <div className="flex flex-1 min-h-0 bg-gray-100">
        <ConversationSidebar viewMode={viewMode} onViewModeChange={setViewMode} />
        {viewMode === 'contacts'
          ? <ContactDetailView onSwitchToConversations={() => setViewMode('conversations')} />
          : <ChatMainArea panelEnabled={panelEnabled} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen(p => !p)} onOpenContact={() => setViewMode('contacts')} />}
        {panelEnabled && panelOpen && (
          <MediaPanel onClose={() => setPanelOpen(false)} />
        )}
      </div>
    </div>
  );
};

export default WhatsAppPage;
