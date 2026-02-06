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
import { ViewMode, Commercial, StatsGlobales, Poste, Channel, MessageAuto, Client } from '@/app/lib/definitions'; // Import Client
import { getCommerciaux, getStatsGlobales, getPostes, getChannels, getMessageAuto, getClients } from '@/app/lib/api'; // Import getClients
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
    const [clients, setClients] = useState<Client[]>([]); // New state for clients
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Extract fetchData logic into a named function
    const fetchData = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('jwt_token');

        if (!token) {
            setError("Authentification requise.");
            setLoading(false);
            return;
        }

        try {
            const [statsData, commerciauxData, postesData, channelsData, messagesAutoData, clientsData] = await Promise.all([
                getStatsGlobales(token),
                getCommerciaux(token),
                getPostes(token),
                getChannels(token),
                getMessageAuto(token),
                getClients(token)
            ]);
            setStatsGlobales(statsData);
            setCommerciaux(commerciauxData);
            setPostes(postesData);
            setChannels(channelsData);
            setMessagesAuto(messagesAutoData);
            setClients(clientsData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de la récupération des données.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ...

          case 'postes':
            return <PostesView initialPostes={postes} onPosteUpdated={fetchData} />;
    // ...


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