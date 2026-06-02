"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, RefreshCw, AlertCircle } from 'lucide-react';
import { getCampagnesMeta } from '../lib/api';
import { MetaAdKpiRow } from '../lib/definitions';
import { formatDateShort } from '../lib/dateUtils';
import { Spinner } from './Spinner';

function defaultDateFrom(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
    return new Date().toISOString().slice(0, 10);
}

function formatSeconds(sec: number | null): string {
    if (!sec || sec <= 0) return '—';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function MetaCampaignsView() {
    const [dateFrom, setDateFrom] = useState<string>(defaultDateFrom());
    const [dateTo, setDateTo] = useState<string>(defaultDateTo());
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<MetaAdKpiRow[] | null>(null);
    const [error, setError] = useState(false);

    const load = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError(false);
        try {
            const data = await getCampagnesMeta(from, to);
            setRows(data);
        } catch {
            setError(true);
            setRows(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(dateFrom, dateTo);
    }, []);

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <Megaphone className="w-6 h-6 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">Campagnes Meta</h1>
            </div>

            <div className="flex flex-wrap items-end gap-4 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Du</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Au</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    onClick={() => {
                        setRows(null);
                        void load(dateFrom, dateTo);
                    }}
                    disabled={!dateFrom || !dateTo || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualiser
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-semibold text-gray-900">Campagnes publicitaires Meta (CTWA)</h2>
                </div>

                {loading && (
                    <div className="flex justify-center py-12">
                        <Spinner />
                    </div>
                )}

                {!loading && error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg mx-6 my-4 px-4 py-3 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        Impossible de charger les campagnes Meta.
                    </div>
                )}

                {!loading && !error && rows !== null && rows.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-12">
                        Aucune campagne sur cette période.
                    </p>
                )}

                {!loading && !error && rows !== null && rows.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Publicite</th>
                                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Conversations</th>
                                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Fermees</th>
                                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Taux conv.</th>
                                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Moy. messages</th>
                                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">1re reponse</th>
                                    <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">1er contact</th>
                                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Dernier contact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {rows.map((row) => (
                                    <tr key={row.source_id} className="hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <p className="font-medium text-gray-900 truncate max-w-xs">
                                                {row.headline ?? null}
                                            </p>
                                            <p className="text-xs text-gray-400 font-mono truncate max-w-xs">
                                                {row.source_id.length > 20
                                                    ? `${row.source_id.slice(0, 20)}…`
                                                    : row.source_id}
                                            </p>
                                        </td>
                                        <td className="py-3 px-3 text-right font-semibold text-gray-900">
                                            {row.total_conversations.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="py-3 px-3 text-right text-gray-600">
                                            {row.conversations_closed.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            <span className={`font-medium ${
                                                row.conversion_rate >= 60 ? 'text-green-600'
                                                : row.conversion_rate >= 30 ? 'text-yellow-600'
                                                : 'text-red-500'
                                            }`}>
                                                {row.conversion_rate}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-right text-gray-600">
                                            {row.avg_messages_per_chat.toLocaleString('fr-FR')}
                                        </td>
                                        <td className="py-3 px-3 text-right text-gray-600">
                                            {formatSeconds(row.avg_first_response_s)}
                                        </td>
                                        <td className="py-3 px-3 text-right text-gray-500 text-xs">
                                            {formatDateShort(row.first_seen)}
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-500 text-xs">
                                            {formatDateShort(row.last_seen)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
