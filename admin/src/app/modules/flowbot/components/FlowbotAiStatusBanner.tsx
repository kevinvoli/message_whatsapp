'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, ToggleLeft, ToggleRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { getAiModules, updateAiModule, type AiModuleConfig } from '@/app/lib/api/ai-governance.api';

interface Props {
  /** mode 'card' = bannière horizontale compacte ; mode 'inline' = bandeau minimal pour le panneau nœud */
  variant?: 'card' | 'inline';
}

export default function FlowbotAiStatusBanner({ variant = 'card' }: Props) {
  const [mod, setMod] = useState<AiModuleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mods = await getAiModules();
      setMod(mods.find(m => m.module_name === 'flowbot') ?? null);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async () => {
    if (!mod) return;
    setToggling(true);
    try {
      const updated = await updateAiModule('flowbot', { is_enabled: !mod.is_enabled });
      setMod(prev => prev ? { ...prev, ...updated } : prev);
    } catch { /* silencieux */ }
    finally { setToggling(false); }
  };

  if (loading) return null;
  if (!mod) return null;

  if (variant === 'inline') {
    return (
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${mod.is_enabled ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
        <span className="flex items-center gap-1.5 font-medium">
          {mod.is_enabled
            ? <><Sparkles className="w-3.5 h-3.5" /> Module IA FlowBot actif</>
            : <><AlertTriangle className="w-3.5 h-3.5" /> Module IA FlowBot désactivé — ce nœud utilisera le message de repli</>}
        </span>
        <button
          onClick={() => void handleToggle()}
          disabled={toggling}
          className={`ml-3 flex items-center gap-1 px-2 py-0.5 rounded font-semibold transition-colors ${mod.is_enabled ? 'bg-purple-200 hover:bg-purple-300 text-purple-800' : 'bg-amber-200 hover:bg-amber-300 text-amber-800'} disabled:opacity-50`}
        >
          {toggling ? <RefreshCw className="w-3 h-3 animate-spin" /> : mod.is_enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
          {mod.is_enabled ? 'Désactiver' : 'Activer'}
        </button>
      </div>
    );
  }

  // variant = 'card'
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${mod.is_enabled ? 'bg-purple-50 border-purple-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className={`w-9 h-9 flex items-center justify-center rounded-lg ${mod.is_enabled ? 'bg-purple-100' : 'bg-amber-100'}`}>
        <Sparkles className={`w-5 h-5 ${mod.is_enabled ? 'text-purple-600' : 'text-amber-500'}`} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${mod.is_enabled ? 'text-purple-800' : 'text-amber-800'}`}>
          Nœud IA dans FlowBot — {mod.is_enabled ? 'Activé' : 'Désactivé'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {mod.is_enabled
            ? 'Les nœuds de type « IA » génèrent des réponses via le fournisseur configuré dans Gouvernance IA.'
            : 'Activez ce module pour permettre aux nœuds AI_REPLY de générer des réponses. Sans activation, le message de repli est utilisé.'}
        </p>
      </div>
      <button
        onClick={() => void handleToggle()}
        disabled={toggling}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${mod.is_enabled ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
      >
        {toggling
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : mod.is_enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        {mod.is_enabled ? 'Désactiver' : 'Activer'}
      </button>
    </div>
  );
}
