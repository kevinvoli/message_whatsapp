'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, Settings } from 'lucide-react';
import { FollowUpTemplateMappingDto, FollowUpType, FOLLOW_UP_TYPE_LABELS, HsmTemplate } from '@/app/lib/definitions';
import {
  getAutoRelanceSetting,
  setAutoRelanceSetting,
  getFollowUpMappings,
  upsertFollowUpMapping,
  deleteFollowUpMapping,
} from '@/app/lib/api/relance-config.api';
import { getHsmTemplates } from '@/app/lib/api/hsm-templates.api';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const FOLLOW_UP_TYPES: FollowUpType[] = [
  'rappel',
  'relance_post_conversation',
  'relance_sans_commande',
  'relance_post_annulation',
  'relance_fidelisation',
  'relance_sans_reponse',
];

// ─── Toggle ───────────────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

function Toggle({ enabled, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? 'bg-green-600' : 'bg-gray-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Ligne de mapping ─────────────────────────────────────────────────────────

interface MappingRowProps {
  followUpType: FollowUpType;
  mapping: FollowUpTemplateMappingDto | undefined;
  templates: HsmTemplate[];
  autoRelanceEnabled: boolean;
  onSaved: (updated: FollowUpTemplateMappingDto | null) => void;
}

function MappingRow({ followUpType, mapping, templates, autoRelanceEnabled, onSaved }: MappingRowProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(mapping?.template_id ?? '');
  const [languageCode, setLanguageCode] = useState(mapping?.language_code ?? 'fr');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    setSelectedTemplateId(mapping?.template_id ?? '');
    setLanguageCode(mapping?.language_code ?? 'fr');
  }, [mapping]);

  const handleSave = async () => {
    setError(null);
    setSavedOk(false);
    setSaving(true);
    try {
      if (!selectedTemplateId) {
        if (mapping) {
          await deleteFollowUpMapping(followUpType);
          onSaved(null);
        }
        setSavedOk(true);
        return;
      }
      const tpl = templates.find((t) => t.id === selectedTemplateId);
      const result = await upsertFollowUpMapping(followUpType, {
        template_id: selectedTemplateId,
        template_name: tpl?.name ?? selectedTemplateId,
        language_code: languageCode || 'fr',
      });
      onSaved(result);
      setSavedOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
        {FOLLOW_UP_TYPE_LABELS[followUpType]}
      </td>
      <td className="px-4 py-3">
        <select
          value={selectedTemplateId}
          onChange={(e) => { setSelectedTemplateId(e.target.value); setSavedOk(false); }}
          aria-label={`Template pour ${FOLLOW_UP_TYPE_LABELS[followUpType]}`}
          className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">Aucun template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={languageCode}
          onChange={(e) => { setLanguageCode(e.target.value); setSavedOk(false); }}
          aria-label={`Code langue pour ${FOLLOW_UP_TYPE_LABELS[followUpType]}`}
          placeholder="fr"
          maxLength={10}
          className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!mapping && !selectedTemplateId && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs">Aucun</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Sauvegarder
          </button>
          {savedOk && !saving && (
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" aria-label="Sauvegarde réussie" />
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </td>
      {!autoRelanceEnabled && (
        <td className="sr-only" aria-hidden="true" />
      )}
    </tr>
  );
}

// ─── Vue principale ───────────────────────────────────────────────────────────

export default function RelanceConfigView() {
  const [autoRelanceEnabled, setAutoRelanceEnabled] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleSaved, setToggleSaved] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [mappings, setMappings] = useState<FollowUpTemplateMappingDto[]>([]);
  const [templates, setTemplates] = useState<HsmTemplate[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setInitialLoading(true);
    setLoadError(null);
    try {
      const [settingResult, mappingsResult, templatesResult] = await Promise.all([
        getAutoRelanceSetting(),
        getFollowUpMappings(),
        getHsmTemplates(TENANT_ID, { status: 'APPROVED' }),
      ]);
      setAutoRelanceEnabled(settingResult.enabled);
      setMappings(mappingsResult);
      setTemplates(templatesResult);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (val: boolean) => {
    setToggleLoading(true);
    setToggleSaved(false);
    setToggleError(null);
    try {
      const result = await setAutoRelanceSetting(val);
      setAutoRelanceEnabled(result.enabled);
      setToggleSaved(true);
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setToggleLoading(false);
    }
  };

  const handleMappingSaved = (followUpType: FollowUpType, updated: FollowUpTemplateMappingDto | null) => {
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.follow_up_type !== followUpType);
      return updated ? [...filtered, updated] : filtered;
    });
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" aria-label="Chargement en cours" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 max-w-xl">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Erreur de chargement</p>
          <p className="text-xs mt-0.5">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-green-600" />
            Config relances auto
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Paramétrage des templates WhatsApp utilisés lors des relances automatiques
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Actualiser la configuration"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Section 1 — Toggle principal */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800">Relances automatiques</h2>
            <p className="text-sm text-gray-500 mt-1">
              Activer l&apos;envoi automatique de templates WhatsApp lors des relances
            </p>
            {toggleError && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {toggleError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {toggleLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-label="Mise à jour en cours" />
            )}
            {toggleSaved && !toggleLoading && (
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                <CheckCircle className="w-3.5 h-3.5" />
                Sauvegardé
              </span>
            )}
            <Toggle
              enabled={autoRelanceEnabled}
              onChange={handleToggle}
              disabled={toggleLoading}
            />
            <span className="text-sm font-medium text-gray-700 w-6">
              {autoRelanceEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </section>

      {/* Section 2 — Tableau de mappings */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Mapping type de relance &rarr; template HSM</h2>
          {!autoRelanceEnabled && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Les relances auto sont désactivées — ce mapping sera utilisé dès l&apos;activation.
            </div>
          )}
        </div>

        {templates.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            Aucun template HSM approuvé disponible. Créez et soumettez des templates depuis la vue
            &quot;Templates HSM&quot; pour les assigner ici.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">Type de relance</th>
                  <th className="px-4 py-3 text-left font-medium">Template assigné</th>
                  <th className="px-4 py-3 text-left font-medium">Langue</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {FOLLOW_UP_TYPES.map((type) => (
                  <MappingRow
                    key={type}
                    followUpType={type}
                    mapping={mappings.find((m) => m.follow_up_type === type)}
                    templates={templates}
                    autoRelanceEnabled={autoRelanceEnabled}
                    onSaved={(updated) => handleMappingSaved(type, updated)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
