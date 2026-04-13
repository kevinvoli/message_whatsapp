import { useState } from 'react';
import { Settings, LogOut, Menu, X, ChevronDown, ChevronRight } from 'lucide-react';
import { NavigationGroup, ViewMode, WhatsappMessage } from '@/app/lib/definitions';
import { useRouter } from 'next/navigation';
import { logoutAdmin } from '@/app/lib/api/auth.api';
import { logger } from '@/app/lib/logger';
import { useToast } from '@/app/ui/ToastProvider';

interface AdminProfile {
    id: string;
    name: string;
    email: string;
}

interface NavigationProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    viewMode: string;
    setViewMode: (view: ViewMode) => void;
    navigationGroups: NavigationGroup[];
    message: WhatsappMessage[];
    adminProfile?: AdminProfile | null;
}

export default function Navigation({ sidebarOpen, setSidebarOpen, viewMode, setViewMode, navigationGroups, message, adminProfile }: NavigationProps) {
    const router = useRouter();
    const { addToast } = useToast();
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
        // Auto-expand the group containing the active view
        const active = navigationGroups.find(g => g.items.some(i => i.id === viewMode));
        return new Set(active ? [active.label] : [navigationGroups[0]?.label]);
    });

    const toggleGroup = (label: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(label)) {
                next.delete(label);
            } else {
                next.add(label);
            }
            return next;
        });
    };

    const handleLogout = async () => {
        try {
            await logoutAdmin();
        } catch (error) {
            logger.error("Logout failed on backend", {
                error: error instanceof Error ? error.message : String(error),
            });
            addToast({
                type: 'error',
                message: "La deconnexion a echoue. Merci de reessayer.",
            });
        }
        router.push('/login');
    };

    return (
        <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-gradient-to-b from-blue-900 to-blue-800 text-white transition-all duration-300 flex flex-col`}>
            {/* Logo et toggle */}
            <div className="p-4 border-b border-blue-700">
                <div className="flex items-center justify-between">
                    {sidebarOpen && (
                        <div>
                            <h2 className="text-xl font-bold">AdminPro</h2>
                            <p className="text-xs text-blue-300">Dashboard</p>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 overflow-y-auto">
                <div className="space-y-1">
                    {navigationGroups.map((group) => {
                        const GroupIcon = group.icon;
                        const isExpanded = expandedGroups.has(group.label);
                        const hasActiveItem = group.items.some(i => i.id === viewMode);

                        return (
                            <div key={group.label}>
                                {/* Group header */}
                                <button
                                    onClick={() => {
                                        if (sidebarOpen) {
                                            toggleGroup(group.label);
                                        } else {
                                            // When collapsed, click goes to first item
                                            setViewMode(group.items[0].id);
                                        }
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-semibold uppercase tracking-wider ${
                                        hasActiveItem
                                            ? 'text-white bg-blue-700/50'
                                            : 'text-blue-300 hover:text-white hover:bg-blue-800/50'
                                    }`}
                                >
                                    <GroupIcon className="w-4 h-4 flex-shrink-0" />
                                    {sidebarOpen && (
                                        <>
                                            <span className="flex-1 text-left">{group.label}</span>
                                            {isExpanded
                                                ? <ChevronDown className="w-3 h-3" />
                                                : <ChevronRight className="w-3 h-3" />
                                            }
                                        </>
                                    )}
                                </button>

                                {/* Group items */}
                                {(sidebarOpen ? isExpanded : false) && (
                                    <div className="ml-3 mt-1 space-y-0.5">
                                        {group.items.map((item) => {
                                            const Icon = item.icon;
                                            const isActive = viewMode === item.id;

                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => setViewMode(item.id)}
                                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                                                        isActive
                                                            ? 'bg-blue-700 text-white shadow-lg'
                                                            : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                                                    }`}
                                                >
                                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                                    <span className="flex-1 text-left text-sm font-medium">{item.name}</span>
                                                    {item.badge && (
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                                            item.badge === 'NEW'
                                                                ? 'bg-green-500 text-white'
                                                                : 'bg-blue-600 text-white'
                                                        }`}>
                                                            {item.id === "messages" ? `${message.length}` : item.badge}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </nav>

            {/* User profile */}
            <div className="p-4 border-t border-blue-700">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">
                        {(adminProfile?.name?.[0] ?? 'A').toUpperCase()}
                    </div>
                    {sidebarOpen && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{adminProfile?.name ?? 'Admin'}</p>
                            <p className="text-xs text-blue-300 truncate">{adminProfile?.email ?? ''}</p>
                        </div>
                    )}
                </div>
                {sidebarOpen && (
                    <button
                        onClick={() => setViewMode('settings')}
                        className={`w-full mt-3 flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                            viewMode === 'settings'
                                ? 'bg-blue-700 text-white'
                                : 'text-blue-200 hover:bg-blue-700'
                        }`}
                    >
                        <Settings className="w-4 h-4" />
                        Parametres
                    </button>
                )}
                <button
                    onClick={handleLogout}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-red-900 rounded-lg transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    {sidebarOpen && 'Deconnexion'}
                </button>
            </div>
        </div>
    );
}
