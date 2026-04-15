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
// ── Modules autonomes par domaine (TICKET-09-C) ───────────────────────────────
import ChannelsView from '@/app/modules/channels/components/ChannelsView';
import PostesView from '@/app/modules/channels/components/PostesView';
import DispatchView from '@/app/modules/dispatch/components/DispatchView';
import QueueView from '@/app/modules/dispatch/components/QueueView';
import CronConfigView from '@/app/modules/automations/components/CronConfigView';
import NotificationsView from '@/app/modules/notifications/components/NotificationsView';
import AlertConfigView from '@/app/modules/notifications/components/AlertConfigView';
import ObservabiliteView from '@/app/modules/observability/components/ObservabiliteView';
import GoNoGoView from '@/app/modules/observability/components/GoNoGoView';
import SettingsView from '@/app/modules/settings/components/SettingsView';
// ── Vues non encore modulées ──────────────────────────────────────────────────
import ConversationsView from '@/app/ui/ConversationsView';
// ── FlowBot (TICKET-12-D) ─────────────────────────────────────────────────────
import FlowListView from '@/app/modules/flowbot/components/FlowListView';
import FlowBuilderView from '@/app/modules/flowbot/components/FlowBuilderView';
import { useNotifications } from '@/app/modules/notifications/hooks/useNotifications';
import { useSystemHealth } from '@/app/hooks/useSystemHealth';
import SystemHealthBanner from '@/app/ui/SystemHealthBanner';
import { ViewMode } from '@/app/lib/definitions';
import { getAdminProfile } from '@/app/lib/api/auth.api';

export default function AdminDashboard() {
    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [adminProfile, setAdminProfile] = useState<{ id: string; name: string; email: string } | null>(null);
    const [conversationFilterPosteId, setConversationFilterPosteId] = useState<string | undefined>(undefined);
    const [conversationFilterCommercialId, setConversationFilterCommercialId] = useState<string | undefined>(undefined);
    const [flowBotEditingId, setFlowBotEditingId] = useState<string | null>(null);

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

    const { status: systemHealth, refresh: refreshHealth } = useSystemHealth();

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
            case 'alert-config':
                return <AlertConfigView onStatusRefresh={refreshHealth} />;
            case 'observabilite':
                return <ObservabiliteView />;
            case 'go_no_go':
                return <GoNoGoView />;
            case 'canaux':
                return <ChannelsView />;
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
            case 'flowbot':
                return flowBotEditingId ? (
                    <FlowBuilderView
                        flowId={flowBotEditingId}
                        onBack={() => setFlowBotEditingId(null)}
                    />
                ) : (
                    <FlowListView
                        onOpenBuilder={(id) => setFlowBotEditingId(id)}
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

                <SystemHealthBanner status={systemHealth} />

                <div className="flex-1 overflow-y-auto p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
