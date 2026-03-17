"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { User, Lock, Save, Settings, Eye, EyeOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { SystemConfigEntry } from '@/app/lib/definitions';
import { bulkUpdateSystemConfig, getSystemConfigs } from '@/app/lib/api';

interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

interface SettingsViewProps {
  adminProfile: AdminProfile | null;
  onProfileUpdated?: (profile: AdminProfile) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type Tab = 'profile' | 'password' | 'system';

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Général',
  whapi: 'WhatsApp / Whapi',
  meta: 'Meta / WhatsApp Business',
  messenger: 'Facebook Messenger',
  instagram: 'Instagram Direct',
  telegram: 'Telegram',
  feature_flags: 'Feature Flags',
  cron: 'Cron & Timers',
};

const CATEGORY_ORDER = ['general', 'whapi', 'meta', 'messenger', 'instagram', 'telegram', 'feature_flags', 'cron'];

function groupByCategory(entries: SystemConfigEntry[]): Record<string, SystemConfigEntry[]> {
  const groups: Record<string, SystemConfigEntry[]> = {};
  for (const entry of entries) {
    if (!groups[entry.category]) groups[entry.category] = [];
    groups[entry.category].push(entry);
  }
  return groups;
}

// ─── SystemConfig Tab ─────────────────────────────────────────────────────────

function SystemConfigTab() {
  const [configs, setConfigs] = useState<SystemConfigEntry[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('general');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSystemConfigs();
      setConfigs(data);
      // Initialize edits with current (possibly masked) values — keep empty for secrets
      const initial: Record<string, string> = {};
      for (const c of data) {
        initial[c.configKey] = c.isSecret ? '' : (c.configValue ?? '');
      }
      setEdits(initial);
    } catch {
      setStatus({ ok: false, message: 'Erreur lors du chargement des configurations.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      // Only send keys that were actually changed (non-empty value in edits)
      const toSave = configs
        .filter((c) => !c.isReadonly)
        .filter((c) => {
          const editedValue = edits[c.configKey];
          if (c.isSecret) {
            // For secrets: only save if user typed something (non-empty)
            return editedValue !== undefined && editedValue !== '';
          }
          // For non-secrets: save if value changed from original
          return editedValue !== undefined && editedValue !== (c.configValue ?? '');
        })
        .map((c) => ({ key: c.configKey, value: edits[c.configKey] ?? '' }));

      if (toSave.length === 0) {
        setStatus({ ok: true, message: 'Aucune modification à enregistrer.' });
        return;
      }

      await bulkUpdateSystemConfig(toSave);
      setStatus({ ok: true, message: `${toSave.length} paramètre(s) enregistré(s) avec succès.` });
      await load();
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.' });
    } finally {
      setSaving(false);
    }
  };

  const grouped = groupByCategory(configs);
  const presentCategories = CATEGORY_ORDER.filter((cat) => grouped[cat]?.length);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Chargement des configurations…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {presentCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Fields */}
      {presentCategories
        .filter((cat) => cat === activeCategory)
        .map((cat) => (
          <div key={cat} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">{CATEGORY_LABELS[cat] ?? cat}</h3>
            {grouped[cat].map((cfg) => (
              <div key={cfg.configKey}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {cfg.label ?? cfg.configKey}
                  {cfg.isSecret && (
                    <span className="ml-2 text-xs text-orange-500 font-normal">secret</span>
                  )}
                  {cfg.isReadonly && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">lecture seule</span>
                  )}
                </label>
                {cfg.description && (
                  <p className="text-xs text-gray-400 mb-1">{cfg.description}</p>
                )}
                <div className="relative">
                  <input
                    type={cfg.isSecret && !revealed[cfg.configKey] ? 'password' : 'text'}
                    disabled={cfg.isReadonly}
                    placeholder={cfg.isSecret ? 'Laisser vide pour conserver la valeur actuelle' : ''}
                    value={edits[cfg.configKey] ?? ''}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [cfg.configKey]: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      cfg.isReadonly
                        ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'border-gray-300'
                    } ${cfg.isSecret ? 'pr-10' : ''}`}
                  />
                  {cfg.isSecret && (
                    <button
                      type="button"
                      onClick={() => setRevealed((prev) => ({ ...prev, [cfg.configKey]: !prev[cfg.configKey] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {revealed[cfg.configKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Status */}
      {status && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
          status.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {status.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {status.message}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={() => void handleSave()}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsView({ adminProfile, onProfileUpdated }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [name, setName] = useState(adminProfile?.name ?? '');
  const [email, setEmail] = useState(adminProfile?.email ?? '');
  const [profileStatus, setProfileStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur inconnue' }));
        setProfileStatus({ ok: false, message: (err as { message?: string }).message ?? 'Erreur lors de la mise à jour' });
        return;
      }
      const updated = await res.json() as AdminProfile;
      setProfileStatus({ ok: true, message: 'Profil mis à jour avec succès.' });
      onProfileUpdated?.(updated);
    } catch {
      setProfileStatus({ ok: false, message: 'Erreur réseau.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ ok: false, message: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    setPasswordLoading(true);
    setPasswordStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/admin/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Erreur inconnue' }));
        setPasswordStatus({ ok: false, message: (err as { message?: string }).message ?? 'Erreur lors du changement de mot de passe' });
        return;
      }
      setPasswordStatus({ ok: true, message: 'Mot de passe modifié avec succès.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordStatus({ ok: false, message: 'Erreur réseau.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profil', icon: <User className="w-4 h-4" /> },
    { id: 'password', label: 'Mot de passe', icon: <Lock className="w-4 h-4" /> },
    { id: 'system', label: 'Configuration système', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Informations du profil</h2>
          </div>

          <form onSubmit={(e) => void handleProfileSave(e)} className="space-y-4">
            <div>
              <label htmlFor="settings-name" className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="settings-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {profileStatus && (
              <p className={`text-sm ${profileStatus.ok ? 'text-green-600' : 'text-red-600'}`}>
                {profileStatus.message}
              </p>
            )}

            <button
              type="submit"
              disabled={profileLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {profileLoading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        </div>
      )}

      {/* Password tab */}
      {activeTab === 'password' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Lock className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Changer le mot de passe</h2>
          </div>

          <form onSubmit={(e) => void handlePasswordSave(e)} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">Mot de passe actuel</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirmer le nouveau mot de passe</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {passwordStatus && (
              <p className={`text-sm ${passwordStatus.ok ? 'text-green-600' : 'text-red-600'}`}>
                {passwordStatus.message}
              </p>
            )}

            <button
              type="submit"
              disabled={passwordLoading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              {passwordLoading ? 'Modification...' : 'Modifier le mot de passe'}
            </button>
          </form>
        </div>
      )}

      {/* System config tab */}
      {activeTab === 'system' && <SystemConfigTab />}
    </div>
  );
}
