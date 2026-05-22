"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
    navigationItems,
    navigationGroups as allNavigationGroups
} from '@/app/data/admin-data';

/** HSM templates désactivés en dur — changer false en true pour activer */
const HSM_TEMPLATES_ENABLED = false;

/** Navigation filtrée selon les feature flags actifs. */
const navigationGroups = HSM_TEMPLATES_ENABLED
    ? allNavigationGroups
    : allNavigationGroups.map(group => ({
        ...group,
        items: group.items.filter(item => item.id !== 'templates'),
    })).filter(group => group.items.length > 0);
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
import TemplatesView from '@/app/ui/TemplatesView';
import MessageAutoView from '@/app/ui/MessageAutoView';
import ConversationsView from '@/app/ui/ConversationsView';
import QueueView from '@/app/ui/QueueView';
import DispatchView from '@/app/ui/DispatchView';
import LectureSeuleView from '@/app/ui/LectureSeuleView';
import CronConfigView from '@/app/ui/CronConfigView';
import AlertConfigView from '@/app/ui/AlertConfigView';
import ObservabiliteView from '@/app/ui/ObservabiliteView';
import GoNoGoView from '@/app/ui/GoNoGoView';
import NotificationsView from '@/app/ui/NotificationsView';
import SettingsView from '@/app/ui/SettingsView';
import CampaignLinksView from '@/app/ui/CampaignLinksView';
import MediathequeView from '@/app/ui/MediathequeView';
import ChannelStatsView from '@/app/ui/ChannelStatsView';
import { useNotifications } from '@/app/hooks/useNotifications';
import { useSystemHealth } from '@/app/hooks/useSystemHealth';
import SystemHealthBanner from '@/app/ui/SystemHealthBanner';
import { ViewMode } from '@/app/lib/definitions';
import { getAdminProfile } from '@/app/lib/api';

const VALID_VIEWS: ViewMode[] = [
    'overview', 'commerciaux', 'performance', 'analytics', 'messages', 'clients',
    'rapports', 'postes', 'canaux', 'templates', 'automessages', 'conversations',
    'queue', 'dispatch', 'lecture-seule', 'crons', 'observabilite', 'go_no_go',
    'notifications', 'alert-config', 'campaign-links', 'mediatheque', 'settings', 'channel-stats',
];

function AdminDashboardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
    const [dateTo, setDateTo] = useState<string | undefined>(undefined);
    const rawView = searchParams.get('view') as ViewMode;
    const [viewMode, setViewMode] = useState<ViewMode>(
        VALID_VIEWS.includes(rawView) ? rawView : 'overview'
    );
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
        router.replace(`${pathname}?view=conversations`, { scroll: false });
    };

    const handleViewCommercialConversations = (commercialId: string, posteId: string) => {
        setConversationFilterPosteId(posteId || undefined);
        setConversationFilterCommercialId(commercialId);
        setViewMode('conversations');
        router.replace(`${pathname}?view=conversations`, { scroll: false });
    };

    const handleSetViewMode = (mode: ViewMode) => {
        if (mode !== 'conversations') {
            setConversationFilterPosteId(undefined);
            setConversationFilterCommercialId(undefined);
        }
        setViewMode(mode);
        router.replace(`${pathname}?view=${mode}`, { scroll: false });
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
                return <OverviewView selectedPeriod={selectedPeriod} dateFrom={dateFrom} dateTo={dateTo} />;
            case 'commerciaux':
                return <CommerciauxView selectedPeriod={selectedPeriod} dateFrom={dateFrom} dateTo={dateTo} onViewConversations={handleViewCommercialConversations} />;
            case 'postes':
                return <PostesView onViewConversations={handleViewPosteConversations} />;
            case 'queue':
                return <QueueView onRefresh={() => {}} />;
            case 'dispatch':
                return <DispatchView onRefresh={() => {}} />;
            case 'lecture-seule':
                return <LectureSeuleView />;
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
            case 'templates':
                return HSM_TEMPLATES_ENABLED ? <TemplatesView /> : null;
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
            case 'campaign-links':
                return <CampaignLinksView />;
            case 'mediatheque':
                return <MediathequeView />;
            case 'channel-stats':
                return <ChannelStatsView selectedPeriod={selectedPeriod} dateFrom={dateFrom} dateTo={dateTo} />;
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
                    dateFrom={dateFrom}
                    setDateFrom={setDateFrom}
                    dateTo={dateTo}
                    setDateTo={setDateTo}
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

export default function AdminDashboard() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400"></div></div>}>
            <AdminDashboardContent />
        </Suspense>
    );
}
