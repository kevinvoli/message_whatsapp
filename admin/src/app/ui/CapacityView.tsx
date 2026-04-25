'use client';

import { useEffect, useState } from 'react';
import {
  CapacitySummaryEntry,
  CapacityConfig,
  WindowModeConfig,
  getCapacitySummary,
  getCapacityConfig,
  setCapacityConfig,
  getWindowMode,
  setWindowMode,
} from '../lib/api/capacity.api';
import {
  ValidationCriterion,
  CallEventEntry,
  getValidationCriteria,
  getCallEvents,
  updateValidationCriterion,
  forceWindowRotation,
  triggerRotationCheck,
  rebuildWindow,
  forceValidateConversation,
} from '../lib/api/window.api';

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

export default function CapacityView() {
  const [summary, setSummary] = useState<CapacitySummaryEntry[]>([]);
  const [config, setConfig] = useState<CapacityConfig>({ quotaActive: 10, quotaTotal: 50 });
  const [criteria, setCriteria] = useState<ValidationCriterion[]>([]);
  const [savingCriterion, setSavingCriterion] = useState<string | null>(null);
  const [actionPoste, setActionPoste] = useState<string | null>(null);
  const [windowModeEnabled, setWindowModeEnabled] = useState(true);
  const [validationThreshold, setValidationThreshold] = useState(0);
  const [externalTimeout, setExternalTimeout] = useState(0);
  const [togglingMode, setTogglingMode] = useState(false);
  const [callEvents, setCallEvents] = useState<CallEventEntry[]>([]);
  const [forceValidateChatId, setForceValidateChatId] = useState('');
  const [forcingValidation, setForcingValidation] = useState(false);
  const [forceValidateResult, setForceValidateResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'quotas' | 'criteria' | 'calls'>('quotas');

  useEffect(() => {
    Promise.all([
      getCapacitySummary(),
      getCapacityConfig(),
      getValidationCriteria(),
      getCallEvents(20),
      getWindowMode(),
    ])
      .then(([s, c, cr, ce, wm]) => {
        setSummary(s);
        setConfig(c);
        setCriteria(cr);
        setCallEvents(ce.data);
        setWindowModeEnabled(wm.enabled);
        setValidationThreshold(wm.threshold ?? 0);
        setExternalTimeout(wm.externalTimeoutHours ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleToggleWindowMode = async () => {
    setTogglingMode(true);
    const next = !windowModeEnabled;
    try {
      const result = await setWindowMode({ enabled: next });
      setWindowModeEnabled(result.enabled);
      setValidationThreshold(result.threshold);
      setExternalTimeout(result.externalTimeoutHours);
    } finally {
      setTogglingMode(false);
    }
  };

  const handleSaveWindowConfig = async (patch: Partial<WindowModeConfig>) => {
    setTogglingMode(true);
    try {
      const result = await setWindowMode(patch);
      setValidationThreshold(result.threshold);
      setExternalTimeout(result.externalTimeoutHours);
    } finally {
      setTogglingMode(false);
    }
  };

  const handleRotationCheck = async (posteId: string) => {
    setActionPoste(posteId);
    try {
      await triggerRotationCheck(posteId);
      const s = await getCapacitySummary();
      setSummary(s);
    } finally {
      setActionPoste(null);
    }
  };

  const handleForceRotation = async (posteId: string) => {
    setActionPoste(posteId);
    try {
      const r = await forceWindowRotation(posteId);
      alert(`Rotation effectuée : ${r.releasedChatIds.length} libérées, ${r.promotedChatIds.length} promues`);
      const [s] = await Promise.all([getCapacitySummary()]);
      setSummary(s);
    } finally {
      setActionPoste(null);
    }
  };

  const handleRebuildWindow = async (posteId: string) => {
    setActionPoste(posteId);
    try {
      await rebuildWindow(posteId);
      const [s] = await Promise.all([getCapacitySummary()]);
      setSummary(s);
    } finally {
      setActionPoste(null);
    }
  };

  const handleForceValidate = async () => {
    const chatId = forceValidateChatId.trim();
    if (!chatId) return;
    setForcingValidation(true);
    setForceValidateResult(null);
    try {
      const r = await forceValidateConversation(chatId);
      setForceValidateResult(r.allRequiredMet ? 'Conversation validée — rotation déclenchée si applicable.' : 'Critères marqués mais validation incomplète.');
      setForceValidateChatId('');
      const s = await getCapacitySummary();
      setSummary(s);
    } catch {
      setForceValidateResult('Erreur : conversation introuvable ou déjà fermée.');
    } finally {
      setForcingValidation(false);
    }
  };

  const handleToggleCriterion = async (id: string, field: 'is_required' | 'is_active', value: boolean) => {
    setSavingCriterion(id);
    try {
      const updated = await updateValidationCriterion(id, { [field]: value });
      setCriteria((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } finally {
      setSavingCriterion(null);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await setCapacityConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  const TAB_CLASS = (t: typeof activeTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === t
        ? 'bg-blue-100 text-blue-700'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Fenêtre glissante de conversations</h2>
        <p className="text-sm text-gray-500 mt-1">
          Gestion des quotas, critères de validation et historique des appels externes.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button className={TAB_CLASS('quotas')} onClick={() => setActiveTab('quotas')}>
          Quotas & postes
        </button>
        <button className={TAB_CLASS('criteria')} onClick={() => setActiveTab('criteria')}>
          Critères de validation
        </button>
        <button className={TAB_CLASS('calls')} onClick={() => setActiveTab('calls')}>
          Historique appels
        </button>
      </div>

      {/* ── Onglet : Quotas ── */}
      {activeTab === 'quotas' && (
        <div className="space-y-5">

          {/* Toggle mode glissant */}
          <div className={`rounded-xl border p-5 flex items-start justify-between gap-4 ${
            windowModeEnabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
          }`}>
            <div>
              <p className="font-medium text-gray-900">Mode fenêtre glissante</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {windowModeEnabled
                  ? 'Activé — rotation par bloc de 10, validation métier requise pour progresser.'
                  : 'Désactivé — déverrouillage unitaire à chaque qualification (comportement classique).'}
              </p>
            </div>
            <button
              onClick={handleToggleWindowMode}
              disabled={togglingMode}
              className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                windowModeEnabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={windowModeEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform duration-200 ${
                  windowModeEnabled ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Seuil de validation */}
          {windowModeEnabled && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-gray-800 text-sm">Seuil de validation du bloc</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Nombre minimum de conversations à valider pour déclencher la rotation.
                  0 = toutes requises ({config.quotaActive}/{config.quotaActive}).
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={config.quotaActive}
                  value={validationThreshold}
                  onChange={(e) => setValidationThreshold(parseInt(e.target.value) || 0)}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center"
                />
                <span className="text-xs text-gray-400">/ {config.quotaActive}</span>
                <button
                  onClick={() => handleSaveWindowConfig({ threshold: validationThreshold })}
                  disabled={togglingMode}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          {/* Timeout webhook absent */}
          {windowModeEnabled && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-gray-800 text-sm">Timeout sans réponse externe</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Si le webhook d&apos;appel n&apos;arrive pas dans ce délai, le critère est validé automatiquement.
                  0 = désactivé (attente infinie).
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={externalTimeout}
                  onChange={(e) => setExternalTimeout(parseInt(e.target.value) || 0)}
                  className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-center"
                />
                <span className="text-xs text-gray-400">heures</span>
                <button
                  onClick={() => handleSaveWindowConfig({ externalTimeoutHours: externalTimeout })}
                  disabled={togglingMode}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          {/* Config quotas */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-medium text-gray-800">Configuration de la fenêtre</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm font-medium text-gray-700">
                Conversations actives (groupe 1)
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={config.quotaActive}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, quotaActive: parseInt(e.target.value) || 10 }))
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Conversations totales (fenêtre complète)
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={config.quotaTotal}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, quotaTotal: parseInt(e.target.value) || 50 }))
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
              {saved && <span className="text-sm text-green-600">Sauvegardé</span>}
            </div>
          </div>

          {/* Explication */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
            <p className="font-medium">Logique de fenêtre glissante</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-700">
              <li>
                Le commercial voit au maximum {config.quotaTotal} conversations : {config.quotaActive} actives +{' '}
                {config.quotaTotal - config.quotaActive} verrouillées.
              </li>
              <li>
                Le bloc suivant se déverrouille uniquement quand les {config.quotaActive} conversations
                actives ont toutes atteint les critères requis.
              </li>
              <li>La rotation se fait par bloc de {config.quotaActive} : sortie → promotion → injection.</li>
            </ul>
          </div>

          {/* Résumé par poste */}
          {summary.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
              Aucune conversation active pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Poste</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Actives</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Validées</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Verrouillées</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summary.map((entry) => {
                    const blockTotal = entry.activeCount + entry.validatedCount;
                    const allValidated = blockTotal > 0 && entry.activeCount === 0 && entry.validatedCount >= blockTotal;
                    const isActing = actionPoste === entry.posteId;
                    return (
                      <tr key={entry.posteId} className={`hover:bg-gray-50 ${isActing ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{entry.posteName}</td>
                        <td className="px-4 py-3 w-40">
                          <ProgressBar
                            value={entry.activeCount}
                            max={entry.quotaActive}
                            color={entry.activeCount >= entry.quotaActive ? 'bg-orange-400' : 'bg-blue-500'}
                          />
                        </td>
                        <td className="px-4 py-3 w-32">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            allValidated ? 'bg-green-100 text-green-700' :
                            entry.validatedCount > 0 ? 'bg-green-50 text-green-600' :
                            'bg-gray-100 text-gray-400'
                          }`}>
                            {entry.validatedCount} / {entry.quotaActive}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-40">
                          <ProgressBar
                            value={entry.lockedCount}
                            max={Math.max(entry.quotaTotal - entry.quotaActive, 1)}
                            color="bg-gray-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 font-medium">
                          {entry.totalCount}/{entry.quotaTotal}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRotationCheck(entry.posteId)}
                              disabled={isActing}
                              title="Vérifier les conditions et déclencher la rotation si elles sont remplies"
                              className="text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors disabled:opacity-50"
                            >
                              ✓ Vérifier
                            </button>
                            <button
                              onClick={() => handleForceRotation(entry.posteId)}
                              disabled={isActing}
                              title="Forcer la rotation du bloc"
                              className="text-xs px-2 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-md transition-colors disabled:opacity-50"
                            >
                              ↻ Rotation
                            </button>
                            <button
                              onClick={() => handleRebuildWindow(entry.posteId)}
                              disabled={isActing}
                              title="Reconstruire la fenêtre"
                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md transition-colors disabled:opacity-50"
                            >
                              ⟳ Rebuild
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

          {/* Force-valider une conversation */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div>
              <p className="font-medium text-gray-800 text-sm">Force-valider une conversation</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Marque tous les critères comme remplis pour une conversation bloquée (usage admin uniquement).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Chat ID (ex: 33612345678@s.whatsapp.net)"
                value={forceValidateChatId}
                onChange={(e) => { setForceValidateChatId(e.target.value); setForceValidateResult(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleForceValidate()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={handleForceValidate}
                disabled={forcingValidation || !forceValidateChatId.trim()}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
              >
                {forcingValidation ? '…' : 'Force-valider'}
              </button>
            </div>
            {forceValidateResult && (
              <p className={`text-xs px-3 py-2 rounded-lg ${
                forceValidateResult.startsWith('Erreur')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-green-50 text-green-700'
              }`}>
                {forceValidateResult}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet : Critères ── */}
      {activeTab === 'criteria' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Les critères sont configurés en base de données. La modification se fait via migration.
          </p>
          {criteria.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
              Aucun critère configuré.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Libellé</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Requis</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Actif</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Ordre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {criteria.map((c) => (
                    <tr key={c.id} className={`hover:bg-gray-50 ${savingCriterion === c.id ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.criterion_type}</td>
                      <td className="px-4 py-3 text-gray-900">{c.label}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleCriterion(c.id, 'is_required', !c.is_required)}
                          disabled={savingCriterion === c.id}
                          title={c.is_required ? 'Cliquer pour rendre optionnel' : 'Cliquer pour rendre requis'}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                            c.is_required
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {c.is_required ? 'Requis' : 'Optionnel'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleCriterion(c.id, 'is_active', !c.is_active)}
                          disabled={savingCriterion === c.id}
                          title={c.is_active ? 'Désactiver ce critère' : 'Activer ce critère'}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                            c.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {c.is_active ? 'Actif' : 'Inactif'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{c.sort_order}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Critères disponibles</p>
            <ul className="list-disc list-inside text-amber-700 space-y-0.5">
              <li><code className="font-mono text-xs">result_set</code> — résultat conversationnel renseigné par le commercial</li>
              <li><code className="font-mono text-xs">call_confirmed</code> — appel confirmé par webhook de la plateforme externe</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Onglet : Historique appels ── */}
      {activeTab === 'calls' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Événements d&apos;appel reçus via webhook depuis la plateforme de gestion des commandes.
          </p>
          {callEvents.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
              Aucun événement d&apos;appel reçu pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Commercial</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Client</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Durée</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Conv. corrélée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {callEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {new Date(ev.event_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{ev.commercial_phone}</td>
                      <td className="px-4 py-3 font-mono text-xs">{ev.client_phone}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ev.call_status === 'answered'
                            ? 'bg-green-100 text-green-700'
                            : ev.call_status === 'no_answer' || ev.call_status === 'voicemail'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {ev.call_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {ev.duration_seconds != null ? `${ev.duration_seconds}s` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {ev.chat_id ?? <span className="text-gray-300">non corrélé</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
