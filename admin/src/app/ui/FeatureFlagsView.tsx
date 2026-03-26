"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { ToggleLeft, ToggleRight, RefreshCw, AlertCircle, Shield, Zap, MessageSquare, Server } from 'lucide-react';
import { FeatureFlagEntry } from '@/app/lib/definitions';
import { getFeatureFlags } from '@/app/lib/api';

const CATEGORY_CONFIG: Record<
  FeatureFlagEntry['category'],
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  security: {
    label: 'Sécurité',
    icon: Shield,
    colorClass: 'text-red-600 bg-red-50 border-red-200',
  },
  resilience: {
    label: 'Résilience',
    icon: Zap,
    colorClass: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  messaging: {
    label: 'Messagerie',
    icon: MessageSquare,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  infra: {
    label: 'Infrastructure',
    icon: Server,
    colorClass: 'text-purple-600 bg-purple-50 border-purple-200',
  },
};

export default function FeatureFlagsView() {
  const [flags, setFlags] = useState<FeatureFlagEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFeatureFlags();
      setFlags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = (Object.keys(CATEGORY_CONFIG) as FeatureFlagEntry['category'][]).map((cat) => ({
    category: cat,
    items: flags.filter((f) => f.category === cat),
  })).filter((g) => g.items.length > 0);

  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Feature Flags</h2>
          <p className="text-sm text-gray-500 mt-1">
            État des fonctionnalités contrôlées par variables d'environnement
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {enabledCount} / {flags.length} activés
          </span>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Barre de progression */}
      {flags.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Couverture des features</span>
            <span className="text-sm font-semibold text-gray-900">
              {Math.round((enabledCount / flags.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(enabledCount / flags.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Squelette chargement */}
      {loading && !error && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                {[1, 2].map((j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="h-4 w-48 bg-gray-200 rounded" />
                      <div className="h-3 w-64 bg-gray-100 rounded" />
                    </div>
                    <div className="h-6 w-12 bg-gray-200 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Groupes par catégorie */}
      {!loading && grouped.map(({ category, items }) => {
        const cfg = CATEGORY_CONFIG[category];
        const CategoryIcon = cfg.icon;
        const catEnabled = items.filter((f) => f.enabled).length;

        return (
          <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* En-tête catégorie */}
            <div className={`flex items-center justify-between px-5 py-3 border-b ${cfg.colorClass}`}>
              <div className="flex items-center gap-2">
                <CategoryIcon className="w-4 h-4" />
                <span className="font-semibold text-sm">{cfg.label}</span>
              </div>
              <span className="text-xs font-medium">
                {catEnabled}/{items.length}
              </span>
            </div>

            {/* Liste des flags */}
            <div className="divide-y divide-gray-100">
              {items.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between px-5 py-4">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{flag.label}</span>
                      <code className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                        {flag.envVar}
                      </code>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{flag.description}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {flag.enabled ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <ToggleRight className="w-7 h-7" />
                        <span className="text-xs font-semibold">ON</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <ToggleLeft className="w-7 h-7" />
                        <span className="text-xs font-medium">OFF</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Note informative */}
      {!loading && flags.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Les feature flags sont contrôlés par variables d'environnement côté backend.
          Modifier le fichier <code className="font-mono">.env</code> et redémarrer le serveur pour prendre effet.
        </p>
      )}
    </div>
  );
}
