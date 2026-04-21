'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles, RefreshCw, ToggleLeft, ToggleRight, Clock, Shield, CheckCircle2,
  XCircle, AlertTriangle, BarChart3, List, Settings2, Zap, Activity,
} from 'lucide-react';
import {
  AiDashboard, AiExecutionLog, AiModuleConfig, AiProvider, QualityAnalysis,
  getAiDashboard, getAiLogs, getAiModules, updateAiModule, analyzeConversationQuality,
  getAiProviders, createAiProvider, updateAiProvider, deleteAiProvider,
} from '../lib/api/ai-governance.api';

type Tab = 'dashboard' | 'modules' | 'logs' | 'coaching' | 'providers';

const MODULE_ICONS: Record<string, React.ElementType> = {
  suggestions: Sparkles,
  rewrite:     Settings2,
  summary:     List,
  qualification: CheckCircle2,
  flowbot:     Zap,
  followup:    Clock,
  dossier:     BarChart3,
  quality:     Activity,
};

const MODULE_COLORS: Record<string, string> = {
  suggestions:   'purple',
  rewrite:       'blue',
  summary:       'indigo',
  qualification: 'green',
  flowbot:       'orange',
  followup:      'yellow',
  dossier:       'cyan',
  quality:       'pink',
};

function colorClass(color: string, type: 'bg' | 'text' | 'border') {
  const map: Record<string, Record<string, string>> = {
    purple: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
    indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
    green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
    cyan:   { bg: 'bg-cyan-100',   text: 'text-cyan-700',   border: 'border-cyan-200' },
    pink:   { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'border-pink-200' },
  };
  return map[color]?.[type] ?? '';
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${colorClass(color, 'border')} bg-white`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${colorClass(color, 'text')}`}>{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ModuleRow({ mod, onToggle, onEdit }: {
  mod: AiModuleConfig;
  onToggle: (name: string, enabled: boolean) => void;
  onEdit: (mod: AiModuleConfig) => void;
}) {
  const color = MODULE_COLORS[mod.module_name] ?? 'blue';
  const Icon = MODULE_ICONS[mod.module_name] ?? Sparkles;
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border ${mod.is_enabled ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100'}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass(color, 'bg')}`}>
        <Icon className={`w-4.5 h-4.5 ${colorClass(color, 'text')}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{mod.label}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {mod.schedule_start && mod.schedule_end && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {mod.schedule_start}–{mod.schedule_end}
            </span>
          )}
          {mod.requires_human_validation && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <Shield className="w-3 h-3" />
              Validation humaine
            </span>
          )}
          {mod.fallback_text && (
            <span className="text-xs text-gray-400 truncate max-w-[180px]">Fallback : {mod.fallback_text}</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onEdit(mod)}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        title="Configurer"
      >
        <Settings2 className="w-4 h-4" />
      </button>
      <button onClick={() => onToggle(mod.module_name, !mod.is_enabled)} title={mod.is_enabled ? 'Désactiver' : 'Activer'}>
        {mod.is_enabled
          ? <ToggleRight className="w-8 h-8 text-green-500" />
          : <ToggleLeft className="w-8 h-8 text-gray-300" />}
      </button>
    </div>
  );
}

function EditModal({ mod, providers, onClose, onSave }: {
  mod: AiModuleConfig;
  providers: AiProvider[];
  onClose: () => void;
  onSave: (name: string, dto: Partial<AiModuleConfig>) => Promise<void>;
}) {
  const [fallback, setFallback] = useState(mod.fallback_text ?? '');
  const [scheduleStart, setScheduleStart] = useState(mod.schedule_start ?? '');
  const [scheduleEnd, setScheduleEnd] = useState(mod.schedule_end ?? '');
  const [validation, setValidation] = useState(mod.requires_human_validation);
  const [providerId, setProviderId] = useState<string>(mod.provider_id ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(mod.module_name, {
      fallback_text: fallback || null,
      schedule_start: scheduleStart || null,
      schedule_end: scheduleEnd || null,
      requires_human_validation: validation,
      provider_id: providerId || null,
    });
    setSaving(false);
    onClose();
  };

  const activeProviders = providers.filter(p => p.is_active);
  const selectedProvider = activeProviders.find(p => p.id === providerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900 mb-4">Configurer — {mod.label}</h3>
        <div className="space-y-4">
          {/* Moteur IA dédié */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Moteur IA pour ce module</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={providerId}
              onChange={e => setProviderId(e.target.value)}
            >
              <option value="">— Provider global (system_config) —</option>
              {activeProviders.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.model}</option>
              ))}
            </select>
            {selectedProvider && (
              <p className="text-xs text-gray-400 mt-0.5">
                {PROVIDER_TYPE_LABELS[selectedProvider.provider_type]} · {selectedProvider.model}
                {selectedProvider.api_url ? ` · ${selectedProvider.api_url}` : ''}
              </p>
            )}
            {activeProviders.length === 0 && (
              <p className="text-xs text-amber-600 mt-0.5">Aucun moteur actif — allez dans l&apos;onglet &quot;Moteurs IA&quot; pour en ajouter.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Texte de fallback</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              rows={2}
              placeholder="Message envoyé si l'IA est désactivée ou en erreur"
              value={fallback}
              onChange={e => setFallback(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Heure début</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Heure fin</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={validation} onChange={e => setValidation(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-gray-700">Validation humaine obligatoire</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
          <button onClick={() => void handleSave()} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsTable({ logs, total, page, onPage, filterModule, onFilterModule, modules }: {
  logs: AiExecutionLog[];
  total: number;
  page: number;
  onPage: (p: number) => void;
  filterModule: string;
  onFilterModule: (m: string) => void;
  modules: AiModuleConfig[];
}) {
  const totalPages = Math.ceil(total / 50);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={filterModule}
          onChange={e => onFilterModule(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="">Tous les modules</option>
          {modules.map(m => <option key={m.module_name} value={m.module_name}>{m.label}</option>)}
        </select>
        <span className="text-xs text-gray-400">{total} exécution(s)</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Module</th>
              <th className="px-4 py-2 text-left">Scénario</th>
              <th className="px-4 py-2 text-left">Déclencheur</th>
              <th className="px-4 py-2 text-center">Statut</th>
              <th className="px-4 py-2 text-right">Latence</th>
              <th className="px-4 py-2 text-center">Fallback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucun journal</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                <td className="px-4 py-2 font-medium text-gray-700">{log.module_name}</td>
                <td className="px-4 py-2 text-gray-500">{log.scenario ?? '—'}</td>
                <td className="px-4 py-2 text-gray-500 truncate max-w-[120px]">{log.triggered_by ?? 'system'}</td>
                <td className="px-4 py-2 text-center">
                  {log.success
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                    : <XCircle className="w-4 h-4 text-red-500 mx-auto" />}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">{log.latency_ms} ms</td>
                <td className="px-4 py-2 text-center">
                  {log.fallback_used ? <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" /> : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40">Précédent</button>
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="px-3 py-1 text-xs border border-gray-200 rounded disabled:opacity-40">Suivant</button>
        </div>
      )}
    </div>
  );
}

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI / Compatible',
  ollama: 'Ollama (local)',
  custom: 'Personnalisé',
};
const PROVIDER_TYPE_COLORS: Record<string, string> = {
  anthropic: 'bg-violet-100 text-violet-700',
  openai:    'bg-green-100 text-green-700',
  ollama:    'bg-orange-100 text-orange-700',
  custom:    'bg-gray-100 text-gray-700',
};

function ProviderFormModal({ initial, onClose, onSave }: {
  initial?: AiProvider | null;
  onClose: () => void;
  onSave: (dto: Partial<AiProvider>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AiProvider['provider_type']>(initial?.provider_type ?? 'anthropic');
  const [model, setModel] = useState(initial?.model ?? '');
  const [apiKey, setApiKey] = useState(initial?.api_key ?? '');
  const [apiUrl, setApiUrl] = useState(initial?.api_url ?? '');
  const [timeout, setTimeout] = useState(String(initial?.timeout_ms ?? 30000));
  const [saving, setSaving] = useState(false);

  const DEFAULT_MODELS: Record<string, string> = {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    ollama: 'llama3',
    custom: '',
  };

  const handleSave = async () => {
    if (!name.trim() || !model.trim()) return;
    setSaving(true);
    await onSave({ name, provider_type: type, model, api_key: apiKey || null, api_url: apiUrl || null, timeout_ms: parseInt(timeout) || 30000 });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">{initial ? 'Modifier le moteur' : 'Ajouter un moteur IA'}</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nom du moteur *</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Claude Haiku — FlowBot" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Type de provider *</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={type} onChange={e => { setType(e.target.value as AiProvider['provider_type']); if (!model) setModel(DEFAULT_MODELS[e.target.value] ?? ''); }}>
              {Object.entries(PROVIDER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Modèle *</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" value={model} onChange={e => setModel(e.target.value)} placeholder={DEFAULT_MODELS[type]} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Clé API</label>
          <input type="password" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-… ou vide si non requis (Ollama local)" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">URL API personnalisée</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:11434" />
            <p className="text-xs text-gray-400 mt-0.5">Vide = URL par défaut du provider</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Timeout (ms)</label>
            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={timeout} onChange={e => setTimeout(e.target.value)} min={1000} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
          <button onClick={() => void handleSave()} disabled={saving || !name.trim() || !model.trim()} className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProvidersPanel({ providers, onRefresh }: { providers: AiProvider[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AiProvider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleSave = async (dto: Partial<AiProvider>) => {
    if (editing) await updateAiProvider(editing.id, dto);
    else await createAiProvider(dto as Omit<AiProvider, 'id' | 'createdAt' | 'updatedAt' | 'is_active'>);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await deleteAiProvider(id);
    setConfirmDelete(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Configurez vos moteurs IA. Chaque module peut utiliser un moteur différent — si aucun moteur n&apos;est assigné à un module, le provider global (system_config) est utilisé.</p>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          + Ajouter un moteur
        </button>
      </div>

      {providers.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
          Aucun moteur IA configuré — ajoutez-en un pour l&apos;assigner à des modules.
        </div>
      )}

      <div className="space-y-3">
        {providers.map(p => (
          <div key={p.id} className={`flex items-center gap-4 p-4 rounded-xl border ${p.is_active ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PROVIDER_TYPE_COLORS[p.provider_type] ?? 'bg-gray-100 text-gray-600'}`}>{PROVIDER_TYPE_LABELS[p.provider_type] ?? p.provider_type}</span>
                {!p.is_active && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">Inactif</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="font-mono">{p.model}</span>
                {p.api_url && <span>URL : {p.api_url}</span>}
                <span>Timeout : {p.timeout_ms} ms</span>
                {p.api_key && <span className="text-green-600">● Clé API définie</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditing(p); setShowForm(true); }} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Modifier</button>
              <button onClick={() => void updateAiProvider(p.id, { is_active: !p.is_active }).then(onRefresh)} className={`px-3 py-1.5 text-xs border rounded-lg ${p.is_active ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                {p.is_active ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => setConfirmDelete(p.id)} className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Supprimer</button>
            </div>
          </div>
        ))}
      </div>

      {(showForm) && (
        <ProviderFormModal
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Supprimer ce moteur ?</h3>
            <p className="text-sm text-gray-500 mb-4">Les modules qui l&apos;utilisent reviendront au provider global.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Annuler</button>
              <button onClick={() => void handleDelete(confirmDelete)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoachingPanel() {
  const [chatId, setChatId] = useState('');
  const [result, setResult] = useState<QualityAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!chatId.trim()) return;
    setAnalyzing(true);
    setErr(null);
    setResult(null);
    try {
      const data = await analyzeConversationQuality(chatId.trim());
      setResult(data);
    } catch { setErr('Impossible d\'analyser cette conversation.'); }
    finally { setAnalyzing(false); }
  };

  const scoreColor = result
    ? result.quality_score >= 75 ? 'text-green-600 bg-green-50 border-green-200'
      : result.quality_score >= 50 ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
      : 'text-red-600 bg-red-50 border-red-200'
    : '';

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Entrez l&apos;identifiant d&apos;une conversation (chat_id) pour analyser la qualité des réponses de l&apos;agent et obtenir des conseils de coaching.
      </p>
      <div className="flex gap-3">
        <input
          type="text"
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleAnalyze(); }}
          placeholder="Identifiant de conversation (chat_id)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
        <button
          onClick={() => void handleAnalyze()}
          disabled={analyzing || !chatId.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analyzing
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <Activity className="w-4 h-4" />}
          {analyzing ? 'Analyse…' : 'Analyser'}
        </button>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{err}</div>}

      {result && (
        <div className="space-y-4">
          {/* Score */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-lg ${scoreColor}`}>
            <Activity className="w-5 h-5" />
            Score qualité : {result.quality_score} / 100
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Points forts */}
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Points forts
              </p>
              {result.strengths.length === 0
                ? <p className="text-xs text-gray-400">Aucun identifié</p>
                : <ul className="space-y-1">{result.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-green-800">• {s}</li>
                  ))}</ul>}
            </div>

            {/* Axes d'amélioration */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Axes d&apos;amélioration
              </p>
              {result.improvements.length === 0
                ? <p className="text-xs text-gray-400">Aucun identifié</p>
                : <ul className="space-y-1">{result.improvements.map((s, i) => (
                    <li key={i} className="text-xs text-amber-800">• {s}</li>
                  ))}</ul>}
            </div>

            {/* Conseils de coaching */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Conseils coaching
              </p>
              {result.coaching_tips.length === 0
                ? <p className="text-xs text-gray-400">Aucun conseil</p>
                : <ul className="space-y-1">{result.coaching_tips.map((s, i) => (
                    <li key={i} className="text-xs text-purple-800">• {s}</li>
                  ))}</ul>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiGovernanceView() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [modules, setModules] = useState<AiModuleConfig[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [dashboard, setDashboard] = useState<AiDashboard | null>(null);
  const [logs, setLogs] = useState<AiExecutionLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsFilter, setLogsFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingModule, setEditingModule] = useState<AiModuleConfig | null>(null);

  const loadModules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mods, dash, provs] = await Promise.all([getAiModules(), getAiDashboard(), getAiProviders()]);
      setModules(mods);
      setDashboard(dash);
      setProviders(provs);
    } catch { setError('Impossible de charger les données IA.'); }
    finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { items, total } = await getAiLogs(logsPage, 50, logsFilter || undefined);
      setLogs(items);
      setLogsTotal(total);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, [logsPage, logsFilter]);

  useEffect(() => { void loadModules(); }, [loadModules]);
  useEffect(() => { if (tab === 'logs') void loadLogs(); }, [tab, loadLogs]);

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      const updated = await updateAiModule(name, { is_enabled: enabled });
      setModules(prev => prev.map(m => m.module_name === name ? { ...m, ...updated } : m));
    } catch { /* silencieux */ }
  };

  const handleSaveEdit = async (name: string, dto: Partial<AiModuleConfig>) => {
    const updated = await updateAiModule(name, dto);
    setModules(prev => prev.map(m => m.module_name === name ? { ...m, ...updated } : m));
  };

  const activeCount = modules.filter(m => m.is_enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-500" />
          <h1 className="text-2xl font-bold text-gray-900">Gouvernance IA</h1>
          <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full">
            {activeCount} / {modules.length} actifs
          </span>
        </div>
        <button onClick={() => void loadModules()} disabled={loading} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
        {([['dashboard', 'Dashboard', BarChart3], ['providers', 'Moteurs IA', Zap], ['modules', 'Modules', Settings2], ['logs', 'Journaux', List], ['coaching', 'Coaching', Activity]] as [Tab, string, React.ElementType][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${tab === id ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Exécutions totales" value={dashboard.total_executions} color="purple" />
            <StatCard label="Taux de succès" value={`${dashboard.success_rate}%`} color="green" />
            <StatCard label="Taux de fallback" value={`${dashboard.fallback_rate}%`} sub="Réponses de secours utilisées" color="yellow" />
            <StatCard label="Latence moyenne" value={`${dashboard.avg_latency_ms} ms`} color="blue" />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Détail par module</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Module</th>
                  <th className="px-4 py-2 text-center">Statut</th>
                  <th className="px-4 py-2 text-right">Exécutions</th>
                  <th className="px-4 py-2 text-right">Succès</th>
                  <th className="px-4 py-2 text-right">Fallback</th>
                  <th className="px-4 py-2 text-right">Latence moy.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dashboard.modules.map(m => (
                  <tr key={m.module_name} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{m.label}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_enabled ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{m.total}</td>
                    <td className="px-4 py-2.5 text-right text-green-600">{m.success_rate}%</td>
                    <td className="px-4 py-2.5 text-right text-amber-500">{m.fallback_rate}%</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{m.avg_latency_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modules */}
      {tab === 'modules' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-3">
            Activez ou désactivez chaque module indépendamment. Un module inactif utilise le texte de fallback ou ne retourne rien.
          </p>
          {modules.map(mod => (
            <ModuleRow key={mod.module_name} mod={mod} onToggle={(n, e) => void handleToggle(n, e)} onEdit={setEditingModule} />
          ))}
        </div>
      )}

      {/* Logs */}
      {tab === 'logs' && (
        <LogsTable
          logs={logs}
          total={logsTotal}
          page={logsPage}
          onPage={(p) => setLogsPage(p)}
          filterModule={logsFilter}
          onFilterModule={(m) => { setLogsFilter(m); setLogsPage(1); }}
          modules={modules}
        />
      )}

      {/* Moteurs IA */}
      {tab === 'providers' && (
        <ProvidersPanel
          providers={providers}
          onRefresh={() => void loadModules()}
        />
      )}

      {/* Coaching */}
      {tab === 'coaching' && <CoachingPanel />}

      {/* Modal config module */}
      {editingModule && (
        <EditModal
          mod={editingModule}
          providers={providers}
          onClose={() => setEditingModule(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
