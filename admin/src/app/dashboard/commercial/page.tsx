"use client";

import React, { useState } from 'react';
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
import { ViewMode } from '@/app/lib/definitions';

export default function AdminDashboard() {
    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const renderContent = () => {
        switch(viewMode) {
            case 'overview':
                return <OverviewView selectedPeriod={selectedPeriod} />;
            case 'commerciaux':
                return <CommerciauxView />;
            case 'postes':
                return <PostesView />;
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
            case 'canaux':
                return <ChannelsView />;
            case 'automessages':
                return <MessageAutoView />;
            case 'conversations':
                return <ConversationsView onRefresh={() => {}} />;
            case 'performance':
                return <PerformanceView selectedPeriod={selectedPeriod} />;
            case 'analytics':
                return <AnalyticsView onRefresh={() => {}} />;
            case 'messages':
                return <MessagesView onRefresh={() => {}} />;
            case 'clients':
                return <ClientsView onRefresh={() => {}} />;
            case 'rapports':
                return <RapportsView onRefresh={() => {}} />;
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
                setViewMode={setViewMode}
                navigationGroups={navigationGroups}
                message={[]}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <Header
                    selectedPeriod={selectedPeriod}
                    setSelectedPeriod={setSelectedPeriod}
                    viewMode={viewMode}
                    navigationItems={navigationItems}
                />

                <div className="flex-1 overflow-y-auto p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
