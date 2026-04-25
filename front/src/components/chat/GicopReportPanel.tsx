"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, ClipboardList, Loader2, Phone, Plus, Save, Send, Star, Trash2, X } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

type SubmissionStatus = 'pending' | 'sent' | 'failed' | null;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type NextAction = 'rappeler' | 'envoyer_devis' | 'relancer' | 'fermer' | 'archiver';

interface Dossier {
  fullName:            string | null;
  ville:               string | null;
  commune:             string | null;
  quartier:            string | null;
  productCategory:     string | null;
  clientNeed:          string | null;
  interestScore:       number | null;
  isMaleNotInterested: boolean;
  followUpAt:          string | null;
  nextAction:          NextAction | null;
  notes:               string | null;
}

interface PhoneEntry {
  id: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

interface CallLogEntry {
  id: string;
  called_at: string;
  call_status: string;
  outcome?: string | null;
  duration_sec?: number | null;
  commercial_name: string;
  notes?: string | null;
}

interface ContactInfo {
  id: string;
  name: string;
  phone: string;
  call_count: number;
  conversion_status?: string;
}

const PRODUCT_CATEGORIES = [
  'Teint clair', 'Teint moyen', 'Teint foncé', 'Teint très foncé',
  'Crème', 'Sérum', 'Savon', 'Huile', 'Lotion', 'Masque',
  'Soin visage', 'Soin corps', 'Autre',
];

const ACTION_LABELS: Record<NextAction, string> = {
  rappeler: 'Rappeler', envoyer_devis: 'Devis',
  relancer: 'Relancer', fermer: 'Fermer', archiver: 'Archiver',
};

const OUTCOME_LABELS: Record<string, string> = {
  répondu: '✅ Répondu', messagerie: '📬 Messagerie',
  pas_de_réponse: '📵 Sans réponse', occupé: '🔴 Occupé',
};

const INTEREST_LABELS = ['', 'Pas intéressée', 'Peu intéressée', 'Intéressée', 'Très intéressée', 'Passionnée'];

const EMPTY_DOSSIER: Dossier = {
  fullName: null, ville: null, commune: null, quartier: null,
  productCategory: null, clientNeed: null,
  interestScore: null, isMaleNotInterested: false,
  followUpAt: null, nextAction: null, notes: null,
};

// Extrait uniquement les champs du DTO pour éviter que des champs internes
// (id, contactId, createdAt…) soient renvoyés au backend et rejetés par la ValidationPipe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toDossier = (raw: any): Dossier => ({
  fullName:            raw?.fullName            ?? null,
  ville:               raw?.ville               ?? null,
  commune:             raw?.commune             ?? null,
  quartier:            raw?.quartier            ?? null,
  productCategory:     raw?.productCategory     ?? null,
  clientNeed:          raw?.clientNeed          ?? null,
  interestScore:       raw?.interestScore       ?? null,
  isMaleNotInterested: raw?.isMaleNotInterested ?? false,
  followUpAt:          raw?.followUpAt          ?? null,
  nextAction:          raw?.nextAction          ?? null,
  notes:               raw?.notes               ?? null,
});

interface Props { chatId: string; onClose: () => void; }

export default function GicopReportPanel({ chatId, onClose }: Props) {
  const [dossier, setDossier]   = useState<Dossier>(EMPTY_DOSSIER);
  const [contact, setContact]   = useState<ContactInfo | null>(null);
  const [phones, setPhones]     = useState<PhoneEntry[]>([]);
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [newPhone, setNewPhone]       = useState('');
  const [newPhoneLabel, setNewPhoneLabel] = useState('');
  const [addingPhone, setAddingPhone]           = useState(false);
  const [submitting, setSubmitting]             = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>(null);
  const [submissionError, setSubmissionError]   = useState<string | null>(null);

  // Charger le statut de soumission
  const loadSubmissionStatus = useCallback(() => {
    fetch(`${API_URL}/gicop-report/${chatId}/submission-status`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<{ status: SubmissionStatus; error: string | null }> : null)
      .then((data) => {
        if (data) {
          setSubmissionStatus(data.status);
          setSubmissionError(data.error);
        }
      })
      .catch(() => {});
  }, [chatId]);

  useEffect(() => {
    loadSubmissionStatus();
    setSaved(false);
    setDirty(false);
    fetch(`${API_URL}/clients/by-chat/${chatId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { dossier: Dossier | null; contact: ContactInfo | null; phones: PhoneEntry[]; callLogs: CallLogEntry[] } | null) => {
        if (!data) return;
        setDossier(data.dossier ? toDossier(data.dossier) : EMPTY_DOSSIER);
        setContact(data.contact ?? null);
        setPhones(data.phones ?? []);
        setCallLogs(data.callLogs ?? []);
        if (data.dossier?.productCategory && !PRODUCT_CATEGORIES.includes(data.dossier.productCategory)) {
          setCustomCategory(data.dossier.productCategory);
        }
      })
      .catch(() => {});
  }, [chatId, loadSubmissionStatus]);

  // ── Soumission rapport vers la plateforme commandes ──────────────────────

  const handleSubmitReport = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/gicop-report/${chatId}/submit`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { status: SubmissionStatus; error: string | null };
      setSubmissionStatus(data.status);
      setSubmissionError(data.error ?? null);
    } catch {
      setSubmissionStatus('failed');
      setSubmissionError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Sauvegarde explicite ─────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API_URL}/clients/by-chat/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(toDossier(dossier)),
      });
      if (res.ok) {
        const updated = await res.json() as { dossier: unknown };
        if (updated.dossier) setDossier(toDossier(updated.dossier));
        setSaved(true);
        setDirty(false);
      }
    } finally { setSaving(false); }
  };

  // ── Mise à jour état local uniquement ────────────────────────────────────

  const set = <K extends keyof Dossier>(key: K, val: Dossier[K]) => {
    setDossier((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
    setSaved(false);
  };

  // ── Téléphones (sauvegarde immédiate car actions atomiques) ───────────────

  const handleAddPhone = async () => {
    if (!newPhone.trim()) return;
    setAddingPhone(true);
    try {
      const res = await fetch(`${API_URL}/clients/by-chat/${chatId}/phones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: newPhone.trim(), label: newPhoneLabel.trim() || null }),
      });
      if (res.ok) {
        const entry = await res.json() as PhoneEntry;
        setPhones((prev) => [...prev, entry]);
        setNewPhone('');
        setNewPhoneLabel('');
      }
    } finally { setAddingPhone(false); }
  };

  const handleRemovePhone = async (phoneId: string) => {
    await fetch(`${API_URL}/clients/phones/${phoneId}`, { method: 'DELETE', credentials: 'include' });
    setPhones((prev) => prev.filter((p) => p.id !== phoneId));
  };

  const isComplete = !!(dossier.fullName?.trim() && dossier.clientNeed?.trim() && dossier.interestScore !== null);
  const inp = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400";
  const lbl = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-80 flex-shrink-0">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-sm text-gray-800">Dossier client</span>
          {isComplete
            ? <span className="flex items-center gap-0.5 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Complet</span>
            : <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">Incomplet</span>
          }
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      {/* Soumission rapport */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {submissionStatus === 'sent' && (
            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              <CheckCircle className="w-3 h-3" /> Soumis
            </span>
          )}
          {submissionStatus === 'failed' && (
            <span className="text-xs text-red-600 truncate" title={submissionError ?? ''}>
              Échec soumission
            </span>
          )}
          {submissionStatus === 'pending' && (
            <span className="text-xs text-orange-600">En cours…</span>
          )}
        </div>
        <button
          onClick={handleSubmitReport}
          disabled={!isComplete || submitting || submissionStatus === 'sent'}
          title={!isComplete ? 'Complétez le dossier avant de soumettre' : submissionStatus === 'sent' ? 'Déjà soumis' : 'Soumettre le rapport vers la plateforme commandes'}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          {submissionStatus === 'sent' ? 'Soumis' : 'Soumettre'}
        </button>
      </div>

      {/* Résumé contact */}
      {contact && (
        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
          <p className="font-semibold">{contact.name}</p>
          <p className="text-blue-600">{contact.phone} · {contact.call_count} appel{contact.call_count !== 1 ? 's' : ''}</p>
          {contact.conversion_status && <p className="capitalize text-blue-500">{contact.conversion_status}</p>}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">

        {/* Nom */}
        <div>
          <label className={lbl}>Nom et/ou prénoms <span className="text-red-500">*</span></label>
          <input type="text" placeholder="Nom complet de la cliente"
            value={dossier.fullName ?? ''}
            onChange={(e) => set('fullName', e.target.value || null)}
            className={inp} />
        </div>

        {/* Localisation */}
        <div>
          <label className={lbl}>Localisation</label>
          <div className="space-y-1.5">
            <input type="text" placeholder="Ville" value={dossier.ville ?? ''}
              onChange={(e) => set('ville', e.target.value || null)} className={inp} />
            <input type="text" placeholder="Commune" value={dossier.commune ?? ''}
              onChange={(e) => set('commune', e.target.value || null)} className={inp} />
            <input type="text" placeholder="Quartier" value={dossier.quartier ?? ''}
              onChange={(e) => set('quartier', e.target.value || null)} className={inp} />
          </div>
        </div>

        {/* Catégorie produit */}
        <div>
          <label className={lbl}>Catégorie produit (teint / forme)</label>
          <select
            value={PRODUCT_CATEGORIES.includes(dossier.productCategory ?? '') ? (dossier.productCategory ?? '') : (dossier.productCategory ? 'Autre' : '')}
            onChange={(e) => {
              if (e.target.value === 'Autre' || e.target.value === '') {
                set('productCategory', customCategory || null);
              } else {
                set('productCategory', e.target.value);
                setCustomCategory('');
              }
            }}
            className={inp}
          >
            <option value="">— Sélectionner —</option>
            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(!PRODUCT_CATEGORIES.includes(dossier.productCategory ?? '') || dossier.productCategory === 'Autre') && (
            <input type="text" placeholder="Préciser..."
              value={customCategory}
              onChange={(e) => { setCustomCategory(e.target.value); set('productCategory', e.target.value || null); }}
              className={`${inp} mt-1.5`} />
          )}
        </div>

        {/* Numéros de téléphone */}
        <div>
          <label className={lbl}>Numéros de téléphone associés</label>
          {phones.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {phones.map((p) => (
                <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                  <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="flex-1 text-xs font-mono text-gray-800">{p.phone}</span>
                  {p.label && <span className="text-xs text-gray-400 italic">{p.label}</span>}
                  <button onClick={() => void handleRemovePhone(p.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <input type="tel" placeholder="Numéro (+225 07 ...)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddPhone(); }}
              className={inp} />
            <div className="flex gap-1.5">
              <input type="text" placeholder="Libellé (Commande, Domicile…)"
                value={newPhoneLabel}
                onChange={(e) => setNewPhoneLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddPhone(); }}
                className={`${inp} flex-1`} />
              <button onClick={() => void handleAddPhone()}
                disabled={!newPhone.trim() || addingPhone}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 flex-shrink-0">
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
          </div>
        </div>

        {/* Besoin */}
        <div>
          <label className={lbl}>Besoin / recherche de la cliente <span className="text-red-500">*</span></label>
          <textarea placeholder="Ce que la cliente recherche, son besoin précis..."
            value={dossier.clientNeed ?? ''} rows={3}
            onChange={(e) => set('clientNeed', e.target.value || null)}
            className={`${inp} resize-none`} />
        </div>

        {/* Score intérêt */}
        <div>
          <label className={lbl}>Intérêt de la cliente <span className="text-red-500">*</span></label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n}
                onClick={() => set('interestScore', dossier.interestScore === n ? null : n)}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg border text-xs transition-colors ${
                  (dossier.interestScore ?? 0) >= n
                    ? 'bg-amber-400 border-amber-400 text-white'
                    : 'bg-white border-gray-200 text-gray-400 hover:border-amber-300'
                }`}
              >
                <Star className="w-3.5 h-3.5 mb-0.5" />{n}
              </button>
            ))}
          </div>
          {dossier.interestScore && (
            <p className="text-xs text-gray-500 mt-1 text-center">{INTEREST_LABELS[dossier.interestScore]}</p>
          )}
        </div>

        {/* Toggle homme non intéressé */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <button onClick={() => set('isMaleNotInterested', !dossier.isMaleNotInterested)}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${dossier.isMaleNotInterested ? 'bg-orange-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${dossier.isMaleNotInterested ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-xs text-gray-700">
            Interlocuteur masculin non intéressé
            <br /><span className="text-gray-400">(à rattacher au vrai dossier client)</span>
          </span>
        </div>

        {/* Date de relance */}
        <div>
          <label className={lbl}>Date et heure de relance</label>
          <input type="datetime-local"
            value={dossier.followUpAt?.slice(0, 16) ?? ''}
            onChange={(e) => set('followUpAt', e.target.value || null)}
            className={inp} />
        </div>

        {/* Prochaine action */}
        <div>
          <label className={lbl}>Prochaine action</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.entries(ACTION_LABELS) as [NextAction, string][]).map(([val, label]) => (
              <button key={val}
                onClick={() => set('nextAction', dossier.nextAction === val ? null : val)}
                className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  dossier.nextAction === val
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                }`}>{label}</button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={lbl}>Notes</label>
          <textarea placeholder="Observations, contexte..."
            value={dossier.notes ?? ''} rows={3}
            onChange={(e) => set('notes', e.target.value || null)}
            className={`${inp} resize-none`} />
        </div>

        {/* Historique d'appels */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 text-xs font-semibold text-gray-700 hover:bg-gray-100">
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              Historique d'appels ({callLogs.length})
            </span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showHistory && (
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {callLogs.length === 0
                ? <p className="px-3 py-4 text-xs text-gray-400 text-center">Aucun appel enregistré</p>
                : callLogs.map((log) => (
                  <div key={log.id} className="px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-gray-800">
                        {log.outcome ? (OUTCOME_LABELS[log.outcome] ?? log.outcome) : '📞 Appel'}
                      </span>
                      <span className="text-gray-400">{formatDate(log.called_at)}</span>
                    </div>
                    <p className="text-gray-500">{log.commercial_name}
                      {log.duration_sec ? ` · ${Math.round(log.duration_sec / 60)}min` : ''}
                    </p>
                    {log.notes && <p className="text-gray-600 mt-0.5 italic">{log.notes}</p>}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Footer — bouton enregistrer explicite */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">
          {saved && !dirty ? '✓ Enregistré' : dirty ? 'Modifications non sauvegardées' : ''}
        </span>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
