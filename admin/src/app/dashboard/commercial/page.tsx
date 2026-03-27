"use client";

import React, { useEffect, useState } from 'react';
import {
    navigationItems,
    navigationGroups
} from '@/app/data/admin-data';
import Navigation from '@/app/ui/Navigation';
import Header from '@/app/ui/Header';
import OverviewView from '@/app/ui/OverviewView';
import CommerciauxView from '@/app/ui/CommerciauxView';
import PerformanceView from '@/app/ui/PerformanceView';
import AnalyticsView from '@/app/ui/AnalyticsView';
import MessagesView from '@/app/ui/MessagesView';
import ClientsView from '@/app/ui/ClientsView';
import RapportsView from '@/app/ui/RapportsView';
import PostesView from '@/app/ui/PostesView';
import ChannelsView from '@/app/ui/ChannelsView';
import MessageAutoView from '@/app/ui/MessageAutoView';
import ConversationsView from '@/app/ui/ConversationsView';
import QueueView from '@/app/ui/QueueView';
import DispatchView from '@/app/ui/DispatchView';
import CronConfigView from '@/app/ui/CronConfigView';
import ObservabiliteView from '@/app/ui/ObservabiliteView';
import GoNoGoView from '@/app/ui/GoNoGoView';
import FeatureFlagsView from '@/app/ui/FeatureFlagsView';
import CannedResponsesView from '@/app/ui/CannedResponsesView';
import TagsView from '@/app/ui/TagsView';
import CsatView from '@/app/ui/CsatView';
import NotificationsView from '@/app/ui/NotificationsView';
import SettingsView from '@/app/ui/SettingsView';
import { useNotifications } from '@/app/hooks/useNotifications';
import { ViewMode } from '@/app/lib/definitions';
import { getAdminProfile } from '@/app/lib/api';

export default function AdminDashboard() {
    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [adminProfile, setAdminProfile] = useState<{ id: string; name: string; email: string } | null>(null);
    const [conversationFilterPosteId, setConversationFilterPosteId] = useState<string | undefined>(undefined);
    const [conversationFilterCommercialId, setConversationFilterCommercialId] = useState<string | undefined>(undefined);

    useEffect(() => {
        void getAdminProfile().then(setAdminProfile).catch(() => null);
    }, []);

    const handleViewPosteConversations = (posteId: string) => {
        setConversationFilterPosteId(posteId);
        setConversationFilterCommercialId(undefined);
        setViewMode('conversations');
    };

    const handleViewCommercialConversations = (commercialId: string, posteId: string) => {
        setConversationFilterPosteId(posteId || undefined);
        setConversationFilterCommercialId(commercialId);
        setViewMode('conversations');
    };

    const handleSetViewMode = (mode: ViewMode) => {
        if (mode !== 'conversations') {
            setConversationFilterPosteId(undefined);
            setConversationFilterCommercialId(undefined);
        }
        setViewMode(mode);
    };

    const {
        notifications,
        total: notificationsTotal,
        loading: notificationsLoading,
        unreadCount,
        reload: reloadNotifications,
        markAsRead,
        markAllAsRead,
        clearAll: clearAllNotifications,
    } = useNotifications();

    const renderContent = () => {
        switch(viewMode) {
            case 'overview':
                return <OverviewView selectedPeriod={selectedPeriod} />;
            case 'commerciaux':
                return <CommerciauxView selectedPeriod={selectedPeriod} onViewConversations={handleViewCommercialConversations} />;
            case 'postes':
                return <PostesView onViewConversations={handleViewPosteConversations} />;
            case 'queue':
                return <QueueView onRefresh={() => {}} />;
            case 'dispatch':
                return <DispatchView onRefresh={() => {}} />;
            case 'crons':
                return <CronConfigView />;
            case 'observabilite':
                return <ObservabiliteView />;
            case 'go_no_go':
                return <GoNoGoView />;
            case 'feature_flags':
                return <FeatureFlagsView />;
            case 'canned_responses':
                return <CannedResponsesView />;
            case 'tags':
                return <TagsView />;
            case 'csat':
                return <CsatView />;
            case 'canaux':
                return <ChannelsView />;
            case 'automessages':
                return <MessageAutoView />;
            case 'conversations':
                return (
                    <ConversationsView
                        onRefresh={() => {}}
                        selectedPeriod={selectedPeriod}
                        initialPosteId={conversationFilterPosteId}
                        initialCommercialId={conversationFilterCommercialId}
                    />
                );
            case 'performance':
                return <PerformanceView selectedPeriod={selectedPeriod} />;
            case 'analytics':
                return <AnalyticsView />;
            case 'messages':
                return <MessagesView onRefresh={() => {}} selectedPeriod={selectedPeriod} />;
            case 'clients':
                return <ClientsView onRefresh={() => {}} />;
            case 'rapports':
                return <RapportsView />;
            case 'notifications':
                return (
                    <NotificationsView
                        notifications={notifications}
                        total={notificationsTotal}
                        loading={notificationsLoading}
                        unreadCount={unreadCount}
                        onMarkAsRead={markAsRead}
                        onMarkAllAsRead={markAllAsRead}
                        onClearAll={clearAllNotifications}
                        onReload={reloadNotifications}
                    />
                );
            case 'settings':
                return (
                    <SettingsView
                        adminProfile={adminProfile}
                        onProfileUpdated={setAdminProfile}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex h-screen bg-gray-100">
            <Navigation
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                viewMode={viewMode}
                setViewMode={handleSetViewMode}
                navigationGroups={navigationGroups}
                message={[]}
                adminProfile={adminProfile}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <Header
                    selectedPeriod={selectedPeriod}
                    setSelectedPeriod={setSelectedPeriod}
                    viewMode={viewMode}
                    navigationItems={navigationItems}
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onMarkAsRead={markAsRead}
                    onMarkAllAsRead={markAllAsRead}
                    onClearNotifications={clearAllNotifications}
                />

                <div className="flex-1 overflow-y-auto p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
