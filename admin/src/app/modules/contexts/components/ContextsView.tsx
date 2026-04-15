'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Context, ContextBinding, ContextType } from '@/app/lib/definitions';
import {
  getContexts,
  createContext,
  updateContext,
  deleteContext,
  addBinding,
  removeBinding,
} from '@/app/lib/api/contexts.api';
import { Plus, Trash2, ChevronDown, ChevronRight, Tag, ToggleLeft, ToggleRight } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTEXT_TYPE_LABELS: Record<ContextType, string> = {
  CHANNEL: 'Canal',
  POSTE: 'Poste',
  PROVIDER: 'Fournisseur',
  POOL: 'Pool global',
};

const CONTEXT_TYPE_OPTIONS: ContextType[] = ['CHANNEL', 'POSTE', 'PROVIDER', 'POOL'];

const CONTEXT_TYPE_COLORS: Record<ContextType, string> = {
  CHANNEL: 'bg-blue-100 text-blue-700',
  POSTE: 'bg-green-100 text-green-700',
  PROVIDER: 'bg-purple-100 text-purple-700',
  POOL: 'bg-gray-100 text-gray-700',
};

// ─── CreateContextModal ────────────────────────────────────────────────────────

function CreateContextModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ctx: Context) => void;
}) {
  const [label, setLabel] = useState('');
  const [contextType, setContextType] = useState<ContextType>('CHANNEL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const ctx = await createContext({ label: label || null, contextType, isActive: true });
      onCreated(ctx);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-800">Nouveau contexte</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Libellé</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex: Canal WhatsApp Principal"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={contextType}
            onChange={(e) => setContextType(e.target.value as ContextType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CONTEXT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{CONTEXT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Création...' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── AddBindingModal ──────────────────────────────────────────────────────────

function AddBindingModal({
  contextId,
  onClose,
  onAdded,
}: {
  contextId: string;
  onClose: () => void;
  onAdded: (b: ContextBinding) => void;
}) {
  const [bindingType, setBindingType] = useState<ContextType>('CHANNEL');
  const [refValue, setRefValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!refValue.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const binding = await addBinding(contextId, { bindingType, refValue: refValue.trim() });
      onAdded(binding);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const refValuePlaceholder: Record<ContextType, string> = {
    CHANNEL: 'channel_id (ex: 33612345678)',
    POSTE: 'poste_id (ex: uuid du poste)',
    PROVIDER: 'provider (ex: whapi, meta)',
    POOL: 'global',
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-800">Ajouter un binding</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type de binding</label>
          <select
            value={bindingType}
            onChange={(e) => setBindingType(e.target.value as ContextType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {CONTEXT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{CONTEXT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Valeur de référence</label>
          <input
            value={refValue}
            onChange={(e) => setRefValue(e.target.value)}
            placeholder={refValuePlaceholder[bindingType]}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading || !refValue.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Ajout...' : 'Ajouter'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── ContextRow ────────────────────────────────────────────────────────────────

function ContextRow({
  context,
  onToggleActive,
  onDelete,
  onBindingAdded,
  onBindingRemoved,
}: {
  context: Context;
  onToggleActive: (ctx: Context) => void;
  onDelete: (id: string) => void;
  onBindingAdded: (contextId: string, binding: ContextBinding) => void;
  onBindingRemoved: (contextId: string, bindingId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddBinding, setShowAddBinding] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONTEXT_TYPE_COLORS[context.contextType]}`}>
          {CONTEXT_TYPE_LABELS[context.contextType]}
        </span>

        <span className="font-medium text-gray-800 flex-1">
          {context.label || <span className="text-gray-400 italic">Sans libellé</span>}
        </span>

        <span className="text-xs text-gray-400">{(context.bindings ?? []).length} binding(s)</span>

        <button
          onClick={() => onToggleActive(context)}
          className={`${context.isActive ? 'text-green-600' : 'text-gray-400'} hover:opacity-70`}
          title={context.isActive ? 'Désactiver' : 'Activer'}
        >
          {context.isActive
            ? <ToggleRight className="w-5 h-5" />
            : <ToggleLeft className="w-5 h-5" />
          }
        </button>

        <button
          onClick={() => onDelete(context.id)}
          className="text-red-400 hover:text-red-600"
          title="Supprimer le contexte"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded bindings */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bindings</span>
            <button
              onClick={() => setShowAddBinding(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>

          {(context.bindings ?? []).length === 0 && (
            <p className="text-xs text-gray-400 italic">Aucun binding — ce contexte ne sera jamais résolu.</p>
          )}

          {(context.bindings ?? []).map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-sm">
              <Tag className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CONTEXT_TYPE_COLORS[b.bindingType]}`}>
                {CONTEXT_TYPE_LABELS[b.bindingType]}
              </span>
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs text-gray-700 flex-1">
                {b.refValue}
              </code>
              <button
                onClick={() => onBindingRemoved(context.id, b.id)}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddBinding && (
        <AddBindingModal
          contextId={context.id}
          onClose={() => setShowAddBinding(false)}
          onAdded={(b) => {
            onBindingAdded(context.id, b);
            setShowAddBinding(false);
          }}
        />
      )}
    </div>
  );
}

// ─── ContextsView ─────────────────────────────────────────────────────────────

export default function ContextsView() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getContexts();
      setContexts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(ctx: Context) {
    setContexts((prev) => [...prev, { ...ctx, bindings: [] }]);
    setShowCreate(false);
  }

  async function handleToggleActive(ctx: Context) {
    try {
      const updated = await updateContext(ctx.id, { isActive: !ctx.isActive });
      setContexts((prev) => prev.map((c) => c.id === ctx.id ? { ...updated, bindings: c.bindings } : c));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce contexte ? Tous les ChatContexts associés seront supprimés.')) return;
    try {
      await deleteContext(id);
      setContexts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function handleBindingAdded(contextId: string, binding: ContextBinding) {
    setContexts((prev) =>
      prev.map((c) =>
        c.id === contextId
          ? { ...c, bindings: [...(c.bindings ?? []), binding] }
          : c,
      ),
    );
  }

  async function handleBindingRemoved(contextId: string, bindingId: string) {
    try {
      await removeBinding(bindingId);
      setContexts((prev) =>
        prev.map((c) =>
          c.id === contextId
            ? { ...c, bindings: (c.bindings ?? []).filter((b) => b.id !== bindingId) }
            : c,
        ),
      );
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contextes d&apos;isolation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Définissez des unités logiques d&apos;isolation pour éviter la corruption des compteurs entre canaux.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Nouveau contexte
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Priorité de résolution :</strong> Canal &gt; Poste &gt; Fournisseur &gt; Pool global.
        Un message entrant reçoit le contexte du binding le plus spécifique.
      </div>

      {/* Content */}
      {loading && <p className="text-gray-500 text-sm">Chargement...</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && contexts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          Aucun contexte configuré. Créez votre premier contexte pour activer l&apos;isolation des compteurs.
        </div>
      )}

      <div className="space-y-3">
        {contexts.map((ctx) => (
          <ContextRow
            key={ctx.id}
            context={ctx}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
            onBindingAdded={handleBindingAdded}
            onBindingRemoved={handleBindingRemoved}
          />
        ))}
      </div>

      {showCreate && (
        <CreateContextModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
