"use client";

import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw, Info, CheckCircle, AlertCircle } from 'lucide-react';
import { DispatchSettings, MessageRestrictionConfig, RestrictionConfig } from '@/app/lib/definitions';
import {
  getDispatchSettings, updateDispatchSettings,
  getRestrictionConfig, updateRestrictionConfig,
  getMessageRestrictionConfig, updateMessageRestrictionConfig,
} from '@/app/lib/api/dispatch.api';
import { useToast } from '@/app/ui/ToastProvider';

function SectionCard({
  title,
  description,
  saving,
  hasSettings,
  onSave,
  children,
}: {
  title: string;
  description: string;
  saving: boolean;
  hasSettings: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <button type="button" onClick={onSave} disabled={saving || !hasSettings}
          className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300">
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>
      {children}
    </div>
  );
}

const defaultRestrictionConfig: RestrictionConfig = {
  enabled: false,
  maxUnrespondedConvs: 1,
  minResponseChars: 50,
  requireLastMessageMine: false,
  minCharsSendEnabled: false,
};

const defaultMessageRestrictionConfig: MessageRestrictionConfig = {
  enabled: true,
  maxWordLength: 26,
  maxRepeatedChars: 3,
  minAudioDurationSeconds: 10,
};

export default function LectureSeuleView() {
  const [settings, setSettings] = useState<DispatchSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingReadOnly, setSavingReadOnly] = useState(false);
  const [savingRateLimit, setSavingRateLimit] = useState(false);
  const [savingCooldown, setSavingCooldown] = useState(false);
  const [savingIdle, setSavingIdle] = useState(false);

  const [restriction, setRestriction] = useState<RestrictionConfig>(defaultRestrictionConfig);
  const [restrictionLoading, setRestrictionLoading] = useState(false);
  const [savingRestriction, setSavingRestriction] = useState(false);
  const [restrictionStatus, setRestrictionStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const [messageRestriction, setMessageRestriction] = useState<MessageRestrictionConfig>(defaultMessageRestrictionConfig);
  const [messageRestrictionLoading, setMessageRestrictionLoading] = useState(false);
  const [savingMessageRestriction, setSavingMessageRestriction] = useState(false);
  const [messageRestrictionStatus, setMessageRestrictionStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const { addToast } = useToast();

  const load = async () => {
    try {
      setLoading(true);
      setSettings(await getDispatchSettings());
    } catch {
      addToast({ type: 'error', message: 'Erreur chargement des paramètres.' });
    } finally {
      setLoading(false);
    }
  };

  const loadRestriction = async () => {
    try {
      setRestrictionLoading(true);
      setRestriction(await getRestrictionConfig());
    } catch {
      // Config inaccessible → valeurs par défaut
    } finally {
      setRestrictionLoading(false);
    }
  };

  const loadMessageRestriction = async () => {
    try {
      setMessageRestrictionLoading(true);
      setMessageRestriction(await getMessageRestrictionConfig());
    } catch {
      // Config inaccessible → valeurs par défaut
    } finally {
      setMessageRestrictionLoading(false);
    }
  };

  const saveMessageRestriction = async () => {
    setSavingMessageRestriction(true);
    setMessageRestrictionStatus(null);
    try {
      const saved = await updateMessageRestrictionConfig(messageRestriction);
      setMessageRestriction(saved);
      setMessageRestrictionStatus({ ok: true, message: 'Configuration enregistrée.' });
    } catch (e) {
      setMessageRestrictionStatus({ ok: false, message: e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.' });
    } finally {
      setSavingMessageRestriction(false);
    }
  };

  const saveRestriction = async () => {
    setSavingRestriction(true);
    setRestrictionStatus(null);
    try {
      await updateRestrictionConfig(restriction);
      setRestrictionStatus({ ok: true, message: 'Configuration enregistrée.' });
    } catch (e) {
      setRestrictionStatus({ ok: false, message: e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.' });
    } finally {
      setSavingRestriction(false);
    }
  };

  useEffect(() => { void load(); void loadRestriction(); void loadMessageRestriction(); }, []);

  const save = async (patch: Partial<DispatchSettings>, setSaving: (v: boolean) => void, msg: string) => {
    if (!settings) return;
    try {
      setSaving(true);
      setSettings(await updateDispatchSettings(patch));
      addToast({ type: 'success', message: msg });
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Erreur sauvegarde.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Lecture seule</h2>
            <p className="text-sm text-gray-500">
              Contrôle du rythme de traitement des messages et de la déconnexion par inactivité.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => { void load(); }} disabled={loading} title="Rafraîchir" aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !settings && <p className="text-sm text-gray-500">Chargement...</p>}

      {settings && (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 mb-6">
            <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Règles commerciaux uniquement</p>
              <p className="mt-0.5 text-xs text-blue-600">
                Ces règles s&apos;appliquent exclusivement aux commerciaux affectés à des postes en <strong>mode pool</strong>.
                Les postes avec un <strong>canal dédié</strong> sont automatiquement exclus.
              </p>
            </div>
          </div>

          <SectionCard title="Messages avant lecture seule"
            description="Nombre de messages qu'un commercial peut envoyer avant que la conversation passe en lecture seule. 0 = désactivé."
            saving={savingReadOnly} hasSettings={!!settings}
            onSave={() => void save({ readOnlyMaxMessages: settings.readOnlyMaxMessages }, setSavingReadOnly, 'Paramètre lecture seule sauvegardé.')}>
            <div className="max-w-xs">
              <label htmlFor="readOnlyMaxMessages" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Messages avant lecture seule
              </label>
              <input id="readOnlyMaxMessages" type="number" min={0} max={100}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                value={settings.readOnlyMaxMessages ?? 1}
                onChange={(e) => setSettings({ ...settings, readOnlyMaxMessages: Number(e.target.value) })} />
              <p className="mt-1 text-[11px] text-gray-400">0 = désactivé — 1 = comportement actuel (défaut)</p>
            </div>
          </SectionCard>

          <SectionCard title="Lecture messages"
            description="Limite le nombre de messages qu'un commercial peut marquer comme lus par minute."
            saving={savingRateLimit} hasSettings={!!settings}
            onSave={() => void save({ maxReadMessagesPerMinute: settings.maxReadMessagesPerMinute }, setSavingRateLimit, 'Limite de lecture sauvegardée.')}>
            <div className="max-w-xs">
              <label htmlFor="maxReadMessagesPerMinute" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Messages lus max / minute
              </label>
              <input id="maxReadMessagesPerMinute" type="number" min={1} max={60}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                value={settings.maxReadMessagesPerMinute ?? 60}
                onChange={(e) => setSettings({ ...settings, maxReadMessagesPerMinute: Number(e.target.value) })} />
              <p className="mt-1 text-[11px] text-gray-400">Min: 1 — Max: 60 messages par minute</p>
            </div>
          </SectionCard>

          <SectionCard title="Cooldown entre lectures"
            description="Temps d'attente obligatoire entre deux ouvertures de conversations non lues."
            saving={savingCooldown} hasSettings={!!settings}
            onSave={() => void save({ readCooldownSeconds: settings.readCooldownSeconds }, setSavingCooldown, 'Cooldown lecture sauvegardé.')}>
            <div className="max-w-xs">
              <label htmlFor="readCooldownSeconds" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Cooldown entre lectures (secondes)
              </label>
              <input id="readCooldownSeconds" type="number" min={0} max={36000}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                value={settings.readCooldownSeconds ?? 120}
                onChange={(e) => setSettings({ ...settings, readCooldownSeconds: Number(e.target.value) })} />
              <p className="mt-1 text-[11px] text-gray-400">Min: 0 s (désactivé) — Max: 36000 s</p>
            </div>
          </SectionCard>

          <SectionCard title="Restriction de réponse"
            description="Bloque l'ouverture d'une nouvelle conversation si la commerciale n'a pas répondu aux précédentes."
            saving={savingRestriction} hasSettings={true}
            onSave={() => void saveRestriction()}>
            <div className="space-y-4">
              {restrictionLoading ? (
                <p className="text-xs text-gray-400">Chargement…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Activer la restriction</p>
                      <p className="mt-0.5 text-xs text-gray-500">Oblige la commerciale à répondre aux conversations consultées avant d&apos;en ouvrir une nouvelle.</p>
                    </div>
                    <button type="button" role="switch" aria-checked={restriction.enabled} aria-label="Activer la restriction de réponse"
                      onClick={() => setRestriction((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${restriction.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${restriction.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {restriction.enabled && (
                    <div className="grid gap-4 max-w-sm md:grid-cols-2">
                      <div>
                        <label htmlFor="restriction-max-convs" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Conversations avant blocage
                        </label>
                        <input id="restriction-max-convs" type="number" min={1}
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                          value={restriction.maxUnrespondedConvs}
                          onChange={(e) => setRestriction((prev) => ({ ...prev, maxUnrespondedConvs: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                        <p className="mt-1 text-[11px] text-gray-400">Nombre de conv. consultées sans réponse avant le modal bloquant</p>
                      </div>
                      <div>
                        <label htmlFor="restriction-min-chars" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Caractères min. par réponse
                        </label>
                        <input id="restriction-min-chars" type="number" min={1}
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                          value={restriction.minResponseChars}
                          onChange={(e) => setRestriction((prev) => ({ ...prev, minResponseChars: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                        <p className="mt-1 text-[11px] text-gray-400">Une réponse doit contenir au moins ce nombre de caractères</p>
                      </div>
                    </div>
                  )}
                  {restriction.enabled && (
                    <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                      <input id="restriction-last-mine" type="checkbox" checked={restriction.requireLastMessageMine}
                        onChange={(e) => setRestriction((prev) => ({ ...prev, requireLastMessageMine: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 cursor-pointer text-emerald-600 border-gray-300 rounded focus:ring-emerald-500" />
                      <label htmlFor="restriction-last-mine" className="text-sm text-gray-700 cursor-pointer">
                        La dernière réponse doit venir de la commerciale
                        <span className="block text-xs text-gray-400 mt-0.5">Si coché, la conversation n&apos;est considérée comme répondue que si la commerciale a écrit en dernier.</span>
                      </label>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Bloquer l&apos;envoi des messages trop courts</p>
                      <p className="mt-0.5 text-xs text-gray-500">Si activé, les commerciaux ne peuvent pas envoyer un message contenant moins de <strong>{restriction.minResponseChars}</strong> caractères.</p>
                    </div>
                    <button type="button" role="switch" aria-checked={restriction.minCharsSendEnabled} aria-label="Bloquer l'envoi des messages trop courts"
                      onClick={() => setRestriction((prev) => ({ ...prev, minCharsSendEnabled: !prev.minCharsSendEnabled }))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${restriction.minCharsSendEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${restriction.minCharsSendEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {restrictionStatus && (
                    <div className={`flex items-center gap-2 text-xs p-2 rounded-lg ${restrictionStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {restrictionStatus.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {restrictionStatus.message}
                    </div>
                  )}
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Restriction du contenu des messages"
            description="Contrôle la longueur des mots, les répétitions de caractères et la durée minimale des messages audio."
            saving={savingMessageRestriction} hasSettings={true}
            onSave={() => void saveMessageRestriction()}>
            <div className="space-y-4">
              {messageRestrictionLoading ? (
                <p className="text-xs text-gray-400">Chargement…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">Activer la restriction de contenu</p>
                      <p className="mt-0.5 text-xs text-gray-500">Si désactivé, les règles ci-dessous sont ignorées côté frontend commercial.</p>
                    </div>
                    <button type="button" role="switch" aria-checked={messageRestriction.enabled} aria-label="Activer la restriction de contenu des messages"
                      onClick={() => setMessageRestriction((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${messageRestriction.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${messageRestriction.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className={`grid gap-4 max-w-sm md:grid-cols-3 transition-opacity duration-200 ${messageRestriction.enabled ? '' : 'opacity-40'}`}>
                    <div>
                      <label htmlFor="msg-restriction-max-word-length" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Longueur max d&apos;un mot
                      </label>
                      <input id="msg-restriction-max-word-length" type="number" min={1} disabled={!messageRestriction.enabled}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed"
                        value={messageRestriction.maxWordLength}
                        onChange={(e) => setMessageRestriction((prev) => ({ ...prev, maxWordLength: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                      <p className="mt-1 text-[11px] text-gray-400">Défaut : 26</p>
                    </div>
                    <div>
                      <label htmlFor="msg-restriction-max-repeated-chars" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Répétitions max
                      </label>
                      <input id="msg-restriction-max-repeated-chars" type="number" min={1} disabled={!messageRestriction.enabled}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed"
                        value={messageRestriction.maxRepeatedChars}
                        onChange={(e) => setMessageRestriction((prev) => ({ ...prev, maxRepeatedChars: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                      <p className="mt-1 text-[11px] text-gray-400">Défaut : 3</p>
                    </div>
                    <div>
                      <label htmlFor="msg-restriction-min-audio-duration" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Durée min audio (s)
                      </label>
                      <input id="msg-restriction-min-audio-duration" type="number" min={1} disabled={!messageRestriction.enabled}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed"
                        value={messageRestriction.minAudioDurationSeconds}
                        onChange={(e) => setMessageRestriction((prev) => ({ ...prev, minAudioDurationSeconds: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                      <p className="mt-1 text-[11px] text-gray-400">Défaut : 10</p>
                    </div>
                  </div>
                  {messageRestrictionStatus && (
                    <div className={`flex items-center gap-2 text-xs p-2 rounded-lg ${messageRestrictionStatus.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {messageRestrictionStatus.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {messageRestrictionStatus.message}
                    </div>
                  )}
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Déconnexion automatique"
            description="Déconnecte automatiquement les commerciaux qui n'ont aucune activité pendant la durée configurée."
            saving={savingIdle} hasSettings={!!settings}
            onSave={() => void save({ idleDisconnectEnabled: settings.idleDisconnectEnabled, idleDisconnectMinutes: settings.idleDisconnectMinutes, idleWarningSeconds: settings.idleWarningSeconds }, setSavingIdle, 'Paramètres déconnexion inactivité sauvegardés.')}>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Déconnecter les commerciaux inactifs</p>
                  <p className="mt-0.5 text-xs text-gray-500">Lorsque activé, les commerciaux sans activité seront déconnectés automatiquement.</p>
                </div>
                <button type="button" role="switch" aria-checked={settings.idleDisconnectEnabled ?? false} aria-label="Activer la déconnexion automatique pour inactivité"
                  onClick={() => setSettings({ ...settings, idleDisconnectEnabled: !(settings.idleDisconnectEnabled ?? false) })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${(settings.idleDisconnectEnabled ?? false) ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${(settings.idleDisconnectEnabled ?? false) ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {(settings.idleDisconnectEnabled ?? false) && (
                <div className="grid gap-4 max-w-sm md:grid-cols-2">
                  <div>
                    <label htmlFor="idleDisconnectMinutes" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Durée d&apos;inactivité (minutes)
                    </label>
                    <input id="idleDisconnectMinutes" type="number" min={1} max={480}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                      value={settings.idleDisconnectMinutes ?? 15}
                      onChange={(e) => setSettings({ ...settings, idleDisconnectMinutes: Number(e.target.value) })} />
                    <p className="mt-1 text-[11px] text-gray-400">Min: 1 min — Max: 480 min (8 heures)</p>
                  </div>
                  <div>
                    <label htmlFor="idleWarningSeconds" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Avertissement avant déconnexion (s)
                    </label>
                    <input id="idleWarningSeconds" type="number" min={5} max={60}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                      value={settings.idleWarningSeconds ?? 10}
                      onChange={(e) => setSettings({ ...settings, idleWarningSeconds: Number(e.target.value) })} />
                    <p className="mt-1 text-[11px] text-gray-400">Min: 5 s — Max: 60 s</p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
