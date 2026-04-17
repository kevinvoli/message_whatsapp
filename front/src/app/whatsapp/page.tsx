'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { ConversationSidebar } from '@/components/layout/ConversationSidebar';
import ChatMainArea from '@/components/chat/ChatMainArea';
import { ContactDetailView } from '@/components/contacts/ContactDetailView';
import { ViewMode } from '@/types/chat';

const WhatsAppPage = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('conversations');

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
    <div className="flex h-screen bg-gray-100">
      <ConversationSidebar viewMode={viewMode} onViewModeChange={setViewMode} />
      {viewMode === 'conversations'
        ? <ChatMainArea onOpenContact={() => setViewMode('contacts')} />
        : <ContactDetailView onSwitchToConversations={() => setViewMode('conversations')} />}
    </div>
  );
};

export default WhatsAppPage;
