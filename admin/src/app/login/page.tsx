"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, loginAdmin } from '@/app/lib/api'; // Import loginAdmin

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoginAsAdmin, setIsLoginAsAdmin] = useState(true); // Toggle for admin/commercial login
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            if (isLoginAsAdmin) {
                await loginAdmin(email, password); // No access_token in response
            } else {
                await login(email, password); // No access_token in response
            }
            router.push('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to login');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-md">
                <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
                    {isLoginAsAdmin ? 'Admin Login' : 'Commercial Login'}
                </h1>
                <form onSubmit={handleLogin}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
                    <div className="flex items-center justify-between">
                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline"
                        >
                            Sign In
                        </button>
                    </div>
                </form>
                <div className="mt-4 text-center">
                    <button
                        onClick={() => setIsLoginAsAdmin(!isLoginAsAdmin)}
                        className="text-blue-600 hover:underline text-sm"
                    >
                        {isLoginAsAdmin ? 'Login as Commercial' : 'Login as Admin'}
                    </button>
                </div>
            </div>
        </div>
    );
}
