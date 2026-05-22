"use client";

import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { DispatchSettings } from '@/app/lib/definitions';
import { getDispatchSettings, updateDispatchSettings } from '@/app/lib/api';
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
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !hasSettings}
          className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function LectureSeuleView() {
  const [settings, setSettings] = useState<DispatchSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingReadOnly, setSavingReadOnly] = useState(false);
  const [savingRateLimit, setSavingRateLimit] = useState(false);
  const [savingCooldown, setSavingCooldown] = useState(false);
  const [savingIdle, setSavingIdle] = useState(false);
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

  useEffect(() => { void load(); }, []);

  const save = async (
    patch: Partial<DispatchSettings>,
    setSaving: (v: boolean) => void,
    msg: string,
  ) => {
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

      {/* En-tête */}
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
        <button
          type="button"
          onClick={() => { void load(); }}
          disabled={loading}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !settings && (
        <p className="text-sm text-gray-500">Chargement...</p>
      )}

      {settings && (
        <>
          {/* ── Messages avant lecture seule ── */}
          <SectionCard
            title="Messages avant lecture seule"
            description="Nombre de messages qu'un commercial peut envoyer avant que la conversation passe en lecture seule. 0 = désactivé. Peut être surchargé par canal."
            saving={savingReadOnly}
            hasSettings={!!settings}
            onSave={() =>
              save(
                { readOnlyMaxMessages: settings.readOnlyMaxMessages },
                setSavingReadOnly,
                'Paramètre lecture seule sauvegardé.',
              )
            }
          >
            <div className="max-w-xs">
              <label
                htmlFor="readOnlyMaxMessages"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Messages avant lecture seule
              </label>
              <input
                id="readOnlyMaxMessages"
                type="number"
                min={0}
                max={100}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                value={settings.readOnlyMaxMessages ?? 1}
                onChange={(e) =>
                  setSettings({ ...settings, readOnlyMaxMessages: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-[11px] text-gray-400">
                0 = désactivé — 1 = comportement actuel (défaut) — N = N messages autorisés
              </p>
            </div>
          </SectionCard>

          {/* ── Lecture messages (rate limit) ── */}
          <SectionCard
            title="Lecture messages"
            description="Limite le nombre de messages qu'un commercial peut marquer comme lus par minute. Permet de freiner le traitement automatique trop rapide."
            saving={savingRateLimit}
            hasSettings={!!settings}
            onSave={() =>
              save(
                { maxReadMessagesPerMinute: settings.maxReadMessagesPerMinute },
                setSavingRateLimit,
                'Limite de lecture sauvegardée.',
              )
            }
          >
            <div className="max-w-xs">
              <label
                htmlFor="maxReadMessagesPerMinute"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Messages lus max / minute
              </label>
              <input
                id="maxReadMessagesPerMinute"
                type="number"
                min={1}
                max={60}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                value={settings.maxReadMessagesPerMinute ?? 60}
                onChange={(e) =>
                  setSettings({ ...settings, maxReadMessagesPerMinute: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-[11px] text-gray-400">Min: 1 — Max: 60 messages par minute</p>
            </div>
          </SectionCard>

          {/* ── Cooldown entre lectures ── */}
          <SectionCard
            title="Cooldown entre lectures"
            description="Temps d'attente obligatoire entre deux ouvertures de conversations non lues. Évite qu'un commercial traite plusieurs messages non lus en rafale."
            saving={savingCooldown}
            hasSettings={!!settings}
            onSave={() =>
              save(
                { readCooldownSeconds: settings.readCooldownSeconds },
                setSavingCooldown,
                'Cooldown lecture sauvegardé.',
              )
            }
          >
            <div className="max-w-xs">
              <label
                htmlFor="readCooldownSeconds"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Cooldown entre lectures (secondes)
              </label>
              <input
                id="readCooldownSeconds"
                type="number"
                min={30}
                max={3600}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                value={settings.readCooldownSeconds ?? 120}
                onChange={(e) =>
                  setSettings({ ...settings, readCooldownSeconds: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Temps d&apos;attente entre deux ouvertures de conv non lues. Min: 30 s — Max: 3600 s
              </p>
            </div>
          </SectionCard>

          {/* ── Déconnexion automatique ── */}
          <SectionCard
            title="Déconnexion automatique"
            description="Déconnecte automatiquement les commerciaux qui n'ont aucune activité pendant la durée configurée."
            saving={savingIdle}
            hasSettings={!!settings}
            onSave={() =>
              save(
                {
                  idleDisconnectEnabled: settings.idleDisconnectEnabled,
                  idleDisconnectMinutes: settings.idleDisconnectMinutes,
                  idleWarningSeconds: settings.idleWarningSeconds,
                },
                setSavingIdle,
                'Paramètres déconnexion inactivité sauvegardés.',
              )
            }
          >
            <div className="space-y-4">
              {/* Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Déconnecter les commerciaux inactifs</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Lorsque activé, les commerciaux sans activité seront déconnectés automatiquement.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.idleDisconnectEnabled ?? false}
                  aria-label="Activer la déconnexion automatique pour inactivité"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      idleDisconnectEnabled: !(settings.idleDisconnectEnabled ?? false),
                    })
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    (settings.idleDisconnectEnabled ?? false) ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                      (settings.idleDisconnectEnabled ?? false) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {(settings.idleDisconnectEnabled ?? false) && (
                <div className="grid gap-4 max-w-sm md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="idleDisconnectMinutes"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Durée d&apos;inactivité (minutes)
                    </label>
                    <input
                      id="idleDisconnectMinutes"
                      type="number"
                      min={1}
                      max={480}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                      value={settings.idleDisconnectMinutes ?? 15}
                      onChange={(e) =>
                        setSettings({ ...settings, idleDisconnectMinutes: Number(e.target.value) })
                      }
                    />
                    <p className="mt-1 text-[11px] text-gray-400">Min: 1 min — Max: 480 min (8 heures)</p>
                  </div>

                  <div>
                    <label
                      htmlFor="idleWarningSeconds"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      Avertissement avant déconnexion (s)
                    </label>
                    <input
                      id="idleWarningSeconds"
                      type="number"
                      min={5}
                      max={60}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                      value={settings.idleWarningSeconds ?? 10}
                      onChange={(e) =>
                        setSettings({ ...settings, idleWarningSeconds: Number(e.target.value) })
                      }
                    />
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
