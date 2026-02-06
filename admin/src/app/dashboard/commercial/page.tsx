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
import ConversationsView from '@/app/ui/ConversationsView'; // Import ConversationsView
import { ViewMode, Commercial, StatsGlobales, Poste, Channel, MessageAuto, Client, WhatsappChat } from '@/app/lib/definitions';
import { getCommerciaux, getStatsGlobales, getPostes, getChannels, getMessageAuto, getClients, getChats } from '@/app/lib/api';
import { Spinner } from '@/app/ui/Spinner';

export default function AdminDashboard() {
    const [selectedPeriod, setSelectedPeriod] = useState('today');
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
    const [statsGlobales, setStatsGlobales] = useState<StatsGlobales | null>(null);
    const [postes, setPostes] = useState<Poste[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [messagesAuto, setMessagesAuto] = useState<MessageAuto[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [chats, setChats] = useState<WhatsappChat[]>([]); // New state for chats
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        // Authentication is now handled by HTTP-only cookies, no need for localStorage token or explicit check here.

        try {
            const [statsData, commerciauxData, postesData, channelsData, messagesAutoData, clientsData, chatsData] = await Promise.all([
                getStatsGlobales(),
                getCommerciaux(),
                getPostes(),
                getChannels(),
                getMessageAuto(),
                getClients(),
                getChats() // Fetch chats data
            ]);
            setStatsGlobales(statsData);
            setCommerciaux(commerciauxData);
            setPostes(postesData);
            setChannels(channelsData);
            setMessagesAuto(messagesAutoData);
            setClients(clientsData);
            setChats(chatsData); // Set chats data
        } catch (err) {
            // If an API call fails due to authentication, the checkAdminAuth in page.tsx will redirect.
            // This error likely indicates a network issue or a backend error other than authentication.
            setError(err instanceof Error ? err.message : "Erreur lors de la récupération des données.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
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
                statsGlobales && <OverviewView
                    statsGlobales={statsGlobales}
                    performanceData={[]}
                    sourcesClients={[]}
                    heuresActivite={[]}
                    produitsPopulaires={[]}
                    commerciaux={commerciaux}
                    getStatusColor={getStatusColor}
                />
            );
          case 'commerciaux':
            return (
                <CommerciauxView
                    commerciaux={commerciaux}
                    getStatusColor={getStatusColor}
                    getPerformanceBadge={getPerformanceBadge}
                />
            );
          case 'postes':
            return <PostesView initialPostes={postes} onPosteUpdated={fetchData} />;
          case 'canaux':
            return <ChannelsView initialChannels={channels} onChannelUpdated={fetchData} />;
          case 'automessages':
            return <MessageAutoView initialMessagesAuto={messagesAuto} onMessageAutoUpdated={fetchData} />;
          case 'conversations': // New case for conversations
            return <ConversationsView initialChats={chats} onChatUpdated={fetchData} />;
          case 'performance':
            return <PerformanceView />;
          case 'analytics':
            return <AnalyticsView />;
          case 'messages':
            return <MessagesView />;
          case 'clients':
            return <ClientsView initialClients={clients} onClientUpdated={fetchData} />;
          case 'rapports':
            return <RapportsView />;
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