import { Settings, LogOut, Menu, X } from 'lucide-react';
import { NavigationItem, ViewMode } from '@/app/lib/definitions';
import { useRouter } from 'next/navigation';
import { logoutAdmin } from '@/app/lib/api'; // Import logoutAdmin

interface NavigationProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    viewMode: string;
    setViewMode: (view: ViewMode) => void;
    navigationItems: NavigationItem[];
}

export default function Navigation({ sidebarOpen, setSidebarOpen, viewMode, setViewMode, navigationItems }: NavigationProps) {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await logoutAdmin(); // Call without token, relies on HTTP-only cookie
        } catch (error) {
            console.error("Logout failed on backend", error);
            // Frontend doesn't store token, so no localStorage to clear for token itself.
            // If there were other local storage items related to auth state, they'd be cleared here.
        }
        // Since the actual token is in an HTTP-only cookie, we don't clear localStorage for 'jwt_token'.
        // Any other client-side session state might be cleared here if applicable.
        router.push('/login'); // Redirect to login page
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
            <nav className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-2">
                    {navigationItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = viewMode === item.id;
                        
                        return (
                            <button
                                key={item.id}
                                onClick={() => setViewMode(item.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                                    isActive 
                                        ? 'bg-blue-700 text-white shadow-lg' 
                                        : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                                }`}
                            >
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                {sidebarOpen && (
                                    <>
                                        <span className="flex-1 text-left text-sm font-medium">{item.name}</span>
                                        {item.badge && (
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                                item.badge === 'NEW' 
                                                    ? 'bg-green-500 text-white' 
                                                    : 'bg-blue-600 text-white'
                                            }`}>
                                                {item.badge}
                                            </span>
                                        )}
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* User profile */}
            <div className="p-4 border-t border-blue-700">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">
                        A
                    </div>
                    {sidebarOpen && (
                        <div className="flex-1">
                            <p className="text-sm font-semibold">Admin</p>
                            <p className="text-xs text-blue-300">admin@company.ci</p>
                        </div>
                    )}
                </div>
                {sidebarOpen && (
                    <button className="w-full mt-3 flex items-center gap-2 px-3 py-2 text-sm text-blue-200 hover:bg-blue-700 rounded-lg transition-colors">
                        <Settings className="w-4 h-4" />
                        Paramètres
                    </button>
                )}
                <button
                    onClick={handleLogout} // Attach logout function here
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-red-900 rounded-lg transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    {sidebarOpen && 'Déconnexion'}
                </button>
            </div>
        </div>
    );
}