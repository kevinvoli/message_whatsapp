'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Edit,
  X,
} from 'lucide-react';
import {
  TemplateBaseModel,
  TemplateCategory,
  TemplateHeaderType,
  TemplateStatus,
  HsmTemplate,
  Channel,
} from '@/app/lib/definitions';
import {
  createHsmTemplate,
  deleteHsmTemplate,
  getHsmTemplates,
  getTemplateBaseModels,
  submitHsmTemplate,
  updateHsmTemplate,
} from '@/app/lib/api/hsm-templates.api';
import { fetchChannelWabaId, getChannels, updateChannel } from '@/app/lib/api/channels.api';
import { formatDate } from '@/app/lib/dateUtils';
import { useToast } from '@/app/ui/ToastProvider';
import TemplatePreview from './TemplatePreview';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

// ─── Badges ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<TemplateCategory, { label: string; className: string }> = {
  MARKETING:      { label: 'Marketing',      className: 'bg-purple-100 text-purple-700' },
  UTILITY:        { label: 'Utilitaire',     className: 'bg-blue-100 text-blue-700' },
  AUTHENTICATION: { label: 'Authentification', className: 'bg-orange-100 text-orange-700' },
};

const STATUS_CONFIG: Record<TemplateStatus, { label: string; className: string }> = {
  APPROVED:  { label: 'Approuve',    className: 'bg-green-100 text-green-700' },
  REJECTED:  { label: 'Rejete',      className: 'bg-red-100 text-red-700' },
  PENDING:   { label: 'En attente',  className: 'bg-gray-100 text-gray-600' },
  PAUSED:    { label: 'Pause',       className: 'bg-orange-100 text-orange-700' },
  DISABLED:  { label: 'Desactive',   className: 'bg-gray-200 text-gray-700' },
  IN_APPEAL: { label: 'En appel',    className: 'bg-yellow-100 text-yellow-700' },
  FLAGGED:   { label: 'Signale',     className: 'bg-red-50 text-red-600' },
  DELETED:   { label: 'Supprime',    className: 'bg-gray-100 text-gray-400' },
};

// ─── Modal de confirmation de soumission ──────────────────────────────────────

interface SubmitModalProps {
  template: HsmTemplate;
  onConfirm: () => void;
  onClose: () => void;
  submitting: boolean;
}

function SubmitModal({ template, onConfirm, onClose, submitting }: SubmitModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Soumettre a Meta</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600">
          Soumettre le template{' '}
          <span className="font-mono font-medium text-gray-900">{template.name}</span>{' '}
          a Meta pour validation ? Une fois soumis, il ne pourra plus etre modifie.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal d'apercu ───────────────────────────────────────────────────────────

interface PreviewModalProps {
  template: HsmTemplate;
  onClose: () => void;
}

function PreviewModal({ template, onClose }: PreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Apercu</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <TemplatePreview
          headerType={template.header_type}
          headerText={template.header_text}
          headerExample={template.header_example}
          bodyText={template.body_text}
          footerText={template.footer_text}
          buttons={template.buttons}
          exampleVariables={template.body_example_variables ?? []}
        />
        <p className="text-xs text-gray-400 font-mono">{template.name}</p>
      </div>
    </div>
  );
}

// ─── Formulaire — utilitaires ─────────────────────────────────────────────────

function extractVarCount(body: string): number {
  const matches = body.match(/{{[0-9]+}}/g) ?? [];
  const nums = matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

function hasComponent(components: string[], needle: string): boolean {
  return components.some((c) => c === needle || c.startsWith(needle));
}

interface FormState {
  channel_id: string;
  name: string;
  language: string;
  header_text: string;
  header_example: string;
  body_text: string;
  body_example_variables: string[];
  footer_text: string;
  button_quick_replies: string[];
  button_url_label: string;
  button_url_value: string;
  button_call_label: string;
  button_call_value: string;
}

const EMPTY_FORM: FormState = {
  channel_id: '',
  name: '',
  language: 'fr',
  header_text: '',
  header_example: '',
  body_text: '',
  body_example_variables: [],
  footer_text: '',
  button_quick_replies: ['', '', ''],
  button_url_label: '',
  button_url_value: '',
  button_call_label: '',
  button_call_value: '',
};

function templateToForm(t: HsmTemplate): FormState {
  const qr: string[] = ['', '', ''];
  let urlLabel = '';
  let urlValue = '';
  let callLabel = '';
  let callValue = '';

  if (t.buttons) {
    let qrIdx = 0;
    for (const btn of t.buttons) {
      const type = btn['type'];
      if (type === 'QUICK_REPLY') {
        qr[qrIdx] = (btn['text'] as string) ?? '';
        qrIdx++;
      } else if (type === 'URL') {
        urlLabel = (btn['text'] as string) ?? '';
        urlValue = (btn['url'] as string) ?? '';
      } else if (type === 'PHONE_NUMBER') {
        callLabel = (btn['text'] as string) ?? '';
        callValue = (btn['phone_number'] as string) ?? '';
      }
    }
  }

  return {
    channel_id: t.channel_id ?? '',
    name: t.name,
    language: t.language,
    header_text: t.header_text ?? '',
    header_example: t.header_example ?? '',
    body_text: t.body_text,
    body_example_variables: t.body_example_variables ?? [],
    footer_text: t.footer_text ?? '',
    button_quick_replies: qr,
    button_url_label: urlLabel,
    button_url_value: urlValue,
    button_call_label: callLabel,
    button_call_value: callValue,
  };
}

function buildPayload(
  form: FormState,
  model: TemplateBaseModel,
): Partial<HsmTemplate> {
  const components = model.components;

  const headerTypeFromModel = (): TemplateHeaderType | null => {
    if (hasComponent(components, 'HEADER_IMAGE')) return 'IMAGE';
    if (hasComponent(components, 'HEADER_VIDEO')) return 'VIDEO';
    if (hasComponent(components, 'HEADER_DOCUMENT')) return 'DOCUMENT';
    if (hasComponent(components, 'HEADER_TEXT')) return 'TEXT';
    return null;
  };

  const header_type = headerTypeFromModel();

  const varCount = extractVarCount(form.body_text);
  const exVars = form.body_example_variables.slice(0, varCount);

  const buttons: Record<string, unknown>[] = [];
  if (hasComponent(components, 'BUTTONS_URL') && form.button_url_label) {
    buttons.push({ type: 'URL', text: form.button_url_label, url: form.button_url_value });
  }
  if (hasComponent(components, 'BUTTONS_CALL') && form.button_call_label) {
    buttons.push({ type: 'PHONE_NUMBER', text: form.button_call_label, phone_number: form.button_call_value });
  }
  if (hasComponent(components, 'BUTTONS_QUICK_REPLY')) {
    form.button_quick_replies
      .filter((qr) => qr.trim().length > 0)
      .forEach((qr) => buttons.push({ type: 'QUICK_REPLY', text: qr }));
  }

  return {
    tenant_id: TENANT_ID,
    channel_id: form.channel_id || null,
    name: form.name.trim(),
    language: form.language,
    category: model.category,
    base_model: model.key,
    header_type,
    header_text: header_type === 'TEXT' ? form.header_text.trim() || null : null,
    header_example:
      header_type && header_type !== 'TEXT' ? form.header_example.trim() || null : null,
    body_text: form.body_text,
    body_example_variables: exVars.length > 0 ? exVars : null,
    footer_text: hasComponent(components, 'FOOTER') ? form.footer_text.trim() || null : null,
    buttons: buttons.length > 0 ? buttons : null,
  };
}

// ─── Etape 1 — Choix du modele ────────────────────────────────────────────────

interface Step1Props {
  models: TemplateBaseModel[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onNext: () => void;
  loading: boolean;
}

function Step1ModelSelect({ models, selectedKey, onSelect, onNext, loading }: Step1Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Etape 1 — Choisir un modele de base</h2>
        <p className="text-sm text-gray-500 mt-1">
          Selectionnez le type de template a creer.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => {
            const catCfg = CATEGORY_CONFIG[model.category];
            const isSelected = selectedKey === model.key;
            return (
              <button
                key={model.key}
                onClick={() => onSelect(model.key)}
                className={`text-left rounded-xl border-2 p-4 space-y-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900 text-sm">{model.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catCfg.className}`}>
                    {catCfg.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {model.components.map((c) => (
                    <span key={c} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!selectedKey}
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}

// ─── Mise à jour inline du WABA ID ───────────────────────────────────────────

interface WabaIdInlineUpdaterProps {
  channel: Channel;
  onUpdated: (updated: Channel) => void;
}

function WabaIdInlineUpdater({ channel, onUpdated }: WabaIdInlineUpdaterProps) {
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  const handleFetch = async () => {
    setFetching(true);
    setError(null);
    setDone(false);
    try {
      const updated = await fetchChannelWabaId(channel.id);
      onUpdated(updated);
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur Meta';
      setError(msg);
      setShowManual(true);
    } finally {
      setFetching(false);
    }
  };

  const handleManualSave = async () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChannel(channel.id, { waba_id: trimmed } as Partial<Channel>);
      onUpdated(updated);
      setDone(true);
      setShowManual(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        Ce canal n&apos;a pas de WABA ID — requis pour soumettre des templates à Meta.
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleFetch}
          disabled={fetching || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-60 transition-colors"
        >
          {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Récupérer depuis Meta
        </button>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs text-amber-700 underline hover:no-underline"
        >
          Saisir manuellement
        </button>
        {done && !fetching && (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            WABA ID enregistré
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600">
          {error}
          {!showManual && (
            <> — <button type="button" onClick={() => setShowManual(true)} className="underline">Saisir manuellement</button></>
          )}
        </p>
      )}

      {showManual && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Ex: 987654321098765"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          <button
            type="button"
            onClick={handleManualSave}
            disabled={saving || !manualInput.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Sauvegarder
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Etape 2 — Remplir le contenu ─────────────────────────────────────────────

interface Step2FormProps {
  model: TemplateBaseModel;
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  onSave: () => void;
  onCancel: () => void;
  onBack?: () => void;
  saving: boolean;
  isEdit: boolean;
  metaChannels: Channel[];
  onChannelUpdated: (updated: Channel) => void;
}

function Step2Form({
  model,
  form,
  onChange,
  onSave,
  onCancel,
  onBack,
  saving,
  isEdit,
  metaChannels,
  onChannelUpdated,
}: Step2FormProps) {
  const components = model.components;
  const selectedChannel = metaChannels.find((c) => c.id === form.channel_id) ?? null;
  const varCount = extractVarCount(form.body_text);

  const previewHeaderType = (): TemplateHeaderType | null => {
    if (hasComponent(components, 'HEADER_IMAGE')) return 'IMAGE';
    if (hasComponent(components, 'HEADER_VIDEO')) return 'VIDEO';
    if (hasComponent(components, 'HEADER_DOCUMENT')) return 'DOCUMENT';
    if (hasComponent(components, 'HEADER_TEXT')) return 'TEXT';
    return null;
  };

  const previewButtons = (): Record<string, unknown>[] => {
    const btns: Record<string, unknown>[] = [];
    if (hasComponent(components, 'BUTTONS_URL') && form.button_url_label) {
      btns.push({ type: 'URL', text: form.button_url_label });
    }
    if (hasComponent(components, 'BUTTONS_CALL') && form.button_call_label) {
      btns.push({ type: 'PHONE_NUMBER', text: form.button_call_label });
    }
    if (hasComponent(components, 'BUTTONS_QUICK_REPLY')) {
      form.button_quick_replies
        .filter((qr) => qr.trim().length > 0)
        .forEach((qr) => btns.push({ type: 'QUICK_REPLY', text: qr }));
    }
    return btns;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {!isEdit && onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Retour"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Modifier le template' : 'Etape 2 — Contenu du template'}
          </h2>
          <p className="text-sm text-gray-500">
            Modele : <span className="font-medium">{model.label}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Formulaire — 60% */}
        <div className="flex-[3] space-y-5 min-w-0">
          {/* Canal Meta */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Canal Meta <span className="text-gray-400 font-normal">(requis pour soumettre)</span>
            </label>
            {metaChannels.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Aucun canal Meta configur&eacute;. Ajoutez un canal Meta dans &quot;Canaux&quot; avant de soumettre.
              </p>
            ) : (
              <>
                <select
                  value={form.channel_id}
                  onChange={(e) => onChange({ channel_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">— Aucun canal s&eacute;lectionn&eacute; —</option>
                  {metaChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label ?? c.channel_id}{c.waba_id ? '' : ' ⚠ sans WABA ID'}
                    </option>
                  ))}
                </select>
                {selectedChannel && !selectedChannel.waba_id && (
                  <WabaIdInlineUpdater
                    channel={selectedChannel}
                    onUpdated={onChannelUpdated}
                  />
                )}
                {selectedChannel?.waba_id && (
                  <p className="mt-1 text-xs text-green-700">
                    WABA ID&nbsp;: <span className="font-mono">{selectedChannel.waba_id}</span>
                  </p>
                )}
              </>
            )}
          </div>

          {/* Nom */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nom du template <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="ex: confirmation_commande"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">snake_case uniquement, sans espaces ni accents.</p>
          </div>

          {/* Langue */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Langue</label>
            <select
              value={form.language}
              onChange={(e) => onChange({ language: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              <option value="fr">Francais (fr)</option>
              <option value="en_US">Anglais (en_US)</option>
              <option value="ar">Arabe (ar)</option>
            </select>
          </div>

          {/* Header TEXT */}
          {hasComponent(components, 'HEADER_TEXT') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Texte du header
              </label>
              <input
                type="text"
                maxLength={60}
                value={form.header_text}
                onChange={(e) => onChange({ header_text: e.target.value })}
                placeholder="Titre du message"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">{form.header_text.length}/60 caracteres</p>
            </div>
          )}

          {/* Header media (IMAGE / VIDEO / DOCUMENT) */}
          {(hasComponent(components, 'HEADER_IMAGE') ||
            hasComponent(components, 'HEADER_VIDEO') ||
            hasComponent(components, 'HEADER_DOCUMENT')) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                URL exemple du media
              </label>
              <input
                type="text"
                value={form.header_example}
                onChange={(e) => onChange({ header_example: e.target.value })}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Corps du message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.body_text}
              onChange={(e) => {
                const next = e.target.value;
                const nextCount = extractVarCount(next);
                const currentVars = form.body_example_variables;
                const newVars = Array.from({ length: nextCount }, (_, i) => currentVars[i] ?? '');
                onChange({ body_text: next, body_example_variables: newVars });
              }}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Bonjour {{1}}, votre commande {{2}} est confirmee."
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.body_text.length} caracteres — Variables : {`{{1}}`}, {`{{2}}`}...
            </p>
          </div>

          {/* Variables exemples */}
          {varCount > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Valeurs d'exemple des variables</p>
              {Array.from({ length: varCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-blue-600 w-8 flex-shrink-0">
                    {`{{${i + 1}}}`}
                  </span>
                  <input
                    type="text"
                    value={form.body_example_variables[i] ?? ''}
                    onChange={(e) => {
                      const updated = [...form.body_example_variables];
                      updated[i] = e.target.value;
                      onChange({ body_example_variables: updated });
                    }}
                    placeholder={`Exemple variable ${i + 1}`}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {hasComponent(components, 'FOOTER') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Texte du footer
              </label>
              <input
                type="text"
                maxLength={60}
                value={form.footer_text}
                onChange={(e) => onChange({ footer_text: e.target.value })}
                placeholder="ex: Ne pas repondre a ce message"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">{form.footer_text.length}/60 caracteres</p>
            </div>
          )}

          {/* Bouton URL */}
          {hasComponent(components, 'BUTTONS_URL') && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-gray-700">Bouton URL</p>
              <input
                type="text"
                value={form.button_url_label}
                onChange={(e) => onChange({ button_url_label: e.target.value })}
                placeholder="Libelle du bouton"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="text"
                value={form.button_url_value}
                onChange={(e) => onChange({ button_url_value: e.target.value })}
                placeholder="https://exemple.com/{{1}}"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Bouton Appel */}
          {hasComponent(components, 'BUTTONS_CALL') && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-gray-700">Bouton Appel</p>
              <input
                type="text"
                value={form.button_call_label}
                onChange={(e) => onChange({ button_call_label: e.target.value })}
                placeholder="Libelle du bouton"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="tel"
                value={form.button_call_value}
                onChange={(e) => onChange({ button_call_value: e.target.value })}
                placeholder="+33 6 00 00 00 00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Boutons Quick Reply */}
          {hasComponent(components, 'BUTTONS_QUICK_REPLY') && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-gray-700">Boutons de reponse rapide (max 3)</p>
              {form.button_quick_replies.map((qr, i) => (
                <input
                  key={i}
                  type="text"
                  value={qr}
                  onChange={(e) => {
                    const updated = [...form.button_quick_replies];
                    updated[i] = e.target.value;
                    onChange({ button_quick_replies: updated });
                  }}
                  placeholder={`Bouton ${i + 1}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              ))}
            </div>
          )}
        </div>

        {/* Apercu — 40% */}
        <div className="flex-[2] min-w-0">
          <p className="text-xs font-medium text-gray-700 mb-3">Apercu en direct</p>
          <TemplatePreview
            headerType={previewHeaderType()}
            headerText={form.header_text || null}
            headerExample={form.header_example || null}
            bodyText={form.body_text || ''}
            footerText={form.footer_text || null}
            buttons={previewButtons()}
            exampleVariables={form.body_example_variables}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          Annuler
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.name.trim() || !form.body_text.trim()}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}

// ─── Vue principale ────────────────────────────────────────────────────────────

type ViewState = 'list' | 'create-step1' | 'create-step2' | 'edit';

export default function TemplatesView() {
  const [viewState, setViewState] = useState<ViewState>('list');
  const [templates, setTemplates] = useState<HsmTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [baseModels, setBaseModels] = useState<TemplateBaseModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [metaChannels, setMetaChannels] = useState<Channel[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<HsmTemplate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<HsmTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<HsmTemplate | null>(null);
  const { addToast } = useToast();

  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    try {
      const [data, channels] = await Promise.all([
        getHsmTemplates(TENANT_ID),
        getChannels(),
      ]);
      setTemplates(data);
      setMetaChannels(channels.filter((c) => c.provider === 'meta'));
    } catch {
      addToast({ type: 'error', message: 'Impossible de charger les templates.' });
    } finally {
      setLoadingList(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const loadBaseModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const data = await getTemplateBaseModels();
      setBaseModels(data);
    } catch {
      addToast({ type: 'error', message: 'Impossible de charger les modeles de base.' });
    } finally {
      setLoadingModels(false);
    }
  }, [addToast]);

  const handleStartCreate = () => {
    setSelectedModelKey(null);
    setForm(EMPTY_FORM);
    setViewState('create-step1');
    if (baseModels.length === 0) void loadBaseModels();
  };

  const handleStartEdit = (template: HsmTemplate) => {
    const modelForEdit: TemplateBaseModel = {
      key: template.base_model ?? 'custom',
      label: template.base_model ?? 'Personnalise',
      category: template.category,
      components: inferComponentsFromTemplate(template),
    };
    const existing = baseModels.find((m) => m.key === template.base_model);
    const resolvedModel = existing ?? modelForEdit;

    setEditingTemplate(template);
    setForm(templateToForm(template));
    setSelectedModelKey(resolvedModel.key);
    if (baseModels.length === 0) {
      loadBaseModels().then(() => setViewState('edit'));
    } else {
      setViewState('edit');
    }
  };

  const inferComponentsFromTemplate = (t: HsmTemplate): string[] => {
    const comps: string[] = [];
    if (t.header_type === 'TEXT') comps.push('HEADER_TEXT');
    else if (t.header_type === 'IMAGE') comps.push('HEADER_IMAGE');
    else if (t.header_type === 'VIDEO') comps.push('HEADER_VIDEO');
    else if (t.header_type === 'DOCUMENT') comps.push('HEADER_DOCUMENT');
    comps.push('BODY');
    if (t.footer_text) comps.push('FOOTER');
    if (t.buttons?.some((b) => b['type'] === 'URL')) comps.push('BUTTONS_URL');
    if (t.buttons?.some((b) => b['type'] === 'PHONE_NUMBER')) comps.push('BUTTONS_CALL');
    if (t.buttons?.some((b) => b['type'] === 'QUICK_REPLY')) comps.push('BUTTONS_QUICK_REPLY');
    return comps;
  };

  const selectedModel =
    viewState === 'edit' && editingTemplate
      ? (baseModels.find((m) => m.key === editingTemplate.base_model) ?? {
          key: editingTemplate.base_model ?? 'custom',
          label: editingTemplate.base_model ?? 'Personnalise',
          category: editingTemplate.category,
          components: inferComponentsFromTemplate(editingTemplate),
        })
      : baseModels.find((m) => m.key === selectedModelKey);

  const handleSave = async () => {
    if (!selectedModel) return;
    setSaving(true);
    try {
      const payload = buildPayload(form, selectedModel);
      if (viewState === 'edit' && editingTemplate) {
        await updateHsmTemplate(editingTemplate.id, payload);
        addToast({ type: 'success', message: 'Template mis a jour.' });
      } else {
        await createHsmTemplate(payload);
        addToast({ type: 'success', message: 'Template cree avec succes.' });
      }
      setViewState('list');
      setEditingTemplate(null);
      void loadTemplates();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!submitTarget) return;
    setSubmitting(true);
    try {
      await submitHsmTemplate(submitTarget.id, TENANT_ID);
      addToast({ type: 'success', message: 'Template soumis a Meta.' });
      setSubmitTarget(null);
      void loadTemplates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la soumission.';
      addToast({ type: 'error', message: msg });
      if (submitTarget.submission_error) {
        addToast({ type: 'error', message: submitTarget.submission_error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (template: HsmTemplate) => {
    if (!window.confirm(`Desactiver le template "${template.name}" ?`)) return;
    try {
      await deleteHsmTemplate(template.id, TENANT_ID);
      addToast({ type: 'success', message: 'Template desactive.' });
      void loadTemplates();
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de la desactivation.' });
    }
  };

  const canEdit = (t: HsmTemplate): boolean =>
    (t.status === 'PENDING' && t.submitted_at == null) || t.status === 'REJECTED';

  const canSubmit = (t: HsmTemplate): boolean => t.submitted_at == null && t.status !== 'DELETED';

  const rejectedCount = templates.filter((t) => t.status === 'REJECTED').length;

  // ── Rendu selon l'etat ──

  if (viewState === 'create-step1') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewState('list')}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Retour a la liste"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Nouveau template</h1>
        </div>
        <Step1ModelSelect
          models={baseModels}
          selectedKey={selectedModelKey}
          onSelect={setSelectedModelKey}
          onNext={() => {
            if (selectedModelKey) setViewState('create-step2');
          }}
          loading={loadingModels}
        />
      </div>
    );
  }

  if (viewState === 'create-step2' && selectedModel) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Nouveau template</h1>
        </div>
        <Step2Form
          model={selectedModel}
          form={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onSave={handleSave}
          onCancel={() => setViewState('list')}
          onBack={() => setViewState('create-step1')}
          saving={saving}
          isEdit={false}
          metaChannels={metaChannels}
          onChannelUpdated={(updated) =>
            setMetaChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
          }
        />
      </div>
    );
  }

  if (viewState === 'edit' && selectedModel) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setViewState('list'); setEditingTemplate(null); }}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Retour a la liste"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Modifier le template</h1>
        </div>
        <Step2Form
          model={selectedModel}
          form={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onSave={handleSave}
          onCancel={() => { setViewState('list'); setEditingTemplate(null); }}
          saving={saving}
          isEdit={true}
          metaChannels={metaChannels}
          onChannelUpdated={(updated) =>
            setMetaChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
          }
        />
      </div>
    );
  }

  // ── Liste ──

  return (
    <div className="space-y-6">
      {/* Modales */}
      {submitTarget && (
        <SubmitModal
          template={submitTarget}
          onConfirm={handleConfirmSubmit}
          onClose={() => setSubmitTarget(null)}
          submitting={submitting}
        />
      )}
      {previewTarget && (
        <PreviewModal
          template={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* En-tete */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates HSM</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadTemplates}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
            aria-label="Actualiser la liste"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
          <button
            onClick={handleStartCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Nouveau template
          </button>
        </div>
      </div>

      {/* Alerte rejetés */}
      {rejectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            {rejectedCount} template{rejectedCount > 1 ? 's' : ''} rejete{rejectedCount > 1 ? 's' : ''} par Meta. Corrigez-les avant de les soumettre a nouveau.
          </span>
        </div>
      )}

      {/* Tableau */}
      {loadingList ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Aucun template. Creez votre premier template HSM.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Categorie</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Langue</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Soumis le</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const catCfg = CATEGORY_CONFIG[t.category];
                const statusCfg = STATUS_CONFIG[t.status];
                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-800 text-xs">{t.name}</span>
                      {t.rejected_reason && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate">{t.rejected_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${catCfg.className}`}>
                        {catCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.language}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDate(t.submitted_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit(t) && (
                          <button
                            onClick={() => handleStartEdit(t)}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            aria-label={`Modifier ${t.name}`}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {canSubmit(t) && (
                          <button
                            onClick={() => setSubmitTarget(t)}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-green-50 hover:text-green-600 transition-colors"
                            aria-label={`Soumettre ${t.name} a Meta`}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setPreviewTarget(t)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                          aria-label={`Apercu de ${t.name}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                          aria-label={`Desactiver ${t.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
