"use client";

import React, { useState, useEffect } from 'react';
import {
    navigationItems
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
import ObservabiliteView from '@/app/ui/ObservabiliteView';
import GoNoGoView from '@/app/ui/GoNoGoView';
import { ViewMode, Poste, Channel, MessageAuto, Client, WhatsappChat, WhatsappMessage, MetriquesGlobales, PerformanceCommercial, StatutChannel, WebhookMetricsSnapshot } from '@/app/lib/definitions';
import { getPostes, getChannels, getMessageAuto, getClients, getChats, getMessages, getOverviewMetriques, getWebhookMetrics } from '@/app/lib/api';
import { goNoGoChecklist } from '@/app/data/admin-data';
import { Spinner } from '@/app/ui/Spinner';
import { logger } from '@/app/lib/logger';

export default function AdminDashboard() {
    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // États pour les métriques
    const [metriques, setMetriques] = useState<MetriquesGlobales | null>(null);
    const [performanceCommercial, setPerformanceCommercial] = useState<PerformanceCommercial[]>([]);
    const [statutChannels, setStatutChannels] = useState<StatutChannel[]>([]);
    const [webhookMetrics, setWebhookMetrics] = useState<WebhookMetricsSnapshot | null>(null);

    // États existants
    const [messages, setMessages] = useState<WhatsappMessage[]>([]);
    const [postes, setPostes] = useState<Poste[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [messagesAuto, setMessagesAuto] = useState<MessageAuto[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [chats, setChats] = useState<WhatsappChat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);

        try {
            // Charger les métriques et les autres données en parallèle
            const [
                overviewData,
                postesData,
                channelsData,
                messagesAutoData,
                clientsData,
                chatsData,
                messagesData,
                webhookData
            ] = await Promise.all([
                getOverviewMetriques(), // Nouveau: charge metriques, performanceCommercial et statutChannels
                getPostes(),
                getChannels(),
                getMessageAuto(),
                getClients(),
                getChats(),
                getMessages(),
                getWebhookMetrics(),
            ]);
            // Mettre à jour les états avec les données des métriques
            setMetriques(overviewData.metriques);
            setPerformanceCommercial(overviewData.performanceCommercial);
            setStatutChannels(overviewData.statutChannels);
            setWebhookMetrics(webhookData);

            // Mettre à jour les états existants
            setPostes(postesData);
            setChannels(channelsData);
            setMessagesAuto(messagesAutoData);
            setClients(clientsData);
            setChats(chatsData);
            setMessages(messagesData);

        } catch (err) {
            logger.error("Erreur lors du chargement des données", {
                error: err instanceof Error ? err.message : String(err),
            });
            setError(err instanceof Error ? err.message : "Erreur lors de la récupération des données.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        return undefined;
    }, []);

    const getStatusColor = (status: 'online' | 'away' | 'offline') => {
        switch(status) {
            case 'online': return 'bg-green-500';
            case 'away': return 'bg-yellow-500';
            case 'offline': return 'bg-gray-500';
            default: return 'bg-gray-500';
        }
    };

    const getPerformanceBadge = (performance: 'excellent' | 'moyen' | 'faible') => {
        switch(performance) {
            case 'excellent': return 'bg-green-100 text-green-800';
            case 'moyen': return 'bg-yellow-100 text-yellow-800';
            case 'faible': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const renderContent = () => {
        if (loading) {
            return <div className="flex justify-center items-center h-full"><Spinner /></div>;
        }

        if (error) {
            return <div className="text-red-500 text-center">{error}</div>;
        }

        switch(viewMode) {
            case 'overview':
                return (
                    metriques && (
                        <OverviewView
                            metriques={metriques}
                            performanceCommercial={performanceCommercial}
                            statutChannels={statutChannels}
                            webhookMetrics={webhookMetrics}
                            onRefresh={fetchData}
                        />
                    )
                );
            case 'commerciaux':
                return (
                    <CommerciauxView
                        commerciaux={performanceCommercial}
                        onCommercialUpdate={fetchData}
                        onRefresh={fetchData}
                    />
                );
            case 'postes':
                return <PostesView initialPostes={postes} onPosteUpdated={fetchData} onRefresh={fetchData} />;
            case 'queue':
                return <QueueView onRefresh={fetchData} />;
            case 'dispatch':
                return <DispatchView onRefresh={fetchData} />;
            case 'observabilite':
                return <ObservabiliteView metrics={webhookMetrics} onRefresh={fetchData} />;
            case 'go_no_go':
                return <GoNoGoView metrics={webhookMetrics} checklist={goNoGoChecklist} onRefresh={fetchData} />;
            case 'canaux':
                return <ChannelsView initialChannels={channels} onChannelUpdated={fetchData} onRefresh={fetchData} />;
            case 'automessages':
                return <MessageAutoView initialMessagesAuto={messagesAuto} onMessageAutoUpdated={fetchData} onRefresh={fetchData} />;
            case 'conversations':
                return <ConversationsView initialChats={chats} onChatUpdated={fetchData} onRefresh={fetchData} />;
            case 'performance':
                return <PerformanceView onRefresh={fetchData} />;
            case 'analytics':
                return <AnalyticsView onRefresh={fetchData} />;
            case 'messages':
                return <MessagesView messages={messages} onMessageUpdated={fetchData} onRefresh={fetchData} />;
            case 'clients':
                return <ClientsView initialClients={clients} onClientUpdated={fetchData} onRefresh={fetchData} />;
            case 'rapports':
                return <RapportsView onRefresh={fetchData} />;
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
                navigationItems={navigationItems}
                message={messages}
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
