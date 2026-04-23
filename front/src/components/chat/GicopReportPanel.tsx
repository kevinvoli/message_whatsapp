"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, ClipboardList, Phone, Star, X } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type NextAction = 'rappeler' | 'envoyer_devis' | 'relancer' | 'fermer' | 'archiver';

interface Dossier {
  id?: string;
  fullName:            string | null;
  ville:               string | null;
  commune:             string | null;
  quartier:            string | null;
  otherPhones:         string | null;
  productCategory:     string | null;
  clientNeed:          string | null;
  interestScore:       number | null;
  isMaleNotInterested: boolean;
  followUpAt:          string | null;
  nextAction:          NextAction | null;
  notes:               string | null;
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
  last_call_date?: string | null;
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

interface Props { chatId: string; onClose: () => void; }

export default function GicopReportPanel({ chatId, onClose }: Props) {
  const [dossier, setDossier] = useState<Dossier>({
    fullName: null, ville: null, commune: null, quartier: null,
    otherPhones: null, productCategory: null, clientNeed: null,
    interestScore: null, isMaleNotInterested: false,
    followUpAt: null, nextAction: null, notes: null,
  });
  const [contact, setContact]     = useState<ContactInfo | null>(null);
  const [callLogs, setCallLogs]   = useState<CallLogEntry[]>([]);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/clients/by-chat/${chatId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { dossier: Dossier | null; contact: ContactInfo | null; callLogs: CallLogEntry[] } | null) => {
        if (!data) return;
        if (data.dossier) setDossier(data.dossier);
        if (data.contact) setContact(data.contact);
        setCallLogs(data.callLogs ?? []);
        if (data.dossier?.productCategory && !PRODUCT_CATEGORIES.includes(data.dossier.productCategory)) {
          setCustomCategory(data.dossier.productCategory);
        }
      })
      .catch(() => {});
  }, [chatId]);

  const save = useCallback(async (patch: Partial<Dossier>) => {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch(`${API_URL}/clients/by-chat/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json() as { dossier: Dossier };
        if (updated.dossier) setDossier(updated.dossier);
        setSaved(true);
      }
    } finally { setSaving(false); }
  }, [chatId]);

  const debouncedSave = useCallback((patch: Partial<Dossier>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(patch), 700);
  }, [save]);

  const set = <K extends keyof Dossier>(key: K, val: Dossier[K]) => {
    const updated = { ...dossier, [key]: val };
    setDossier(updated);
    debouncedSave({ [key]: val });
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

      {/* Résumé contact */}
      {contact && (
        <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
          <p className="font-semibold">{contact.name}</p>
          <p className="text-blue-600">{contact.phone} · {contact.call_count} appel{contact.call_count !== 1 ? 's' : ''}</p>
          {contact.conversion_status && (
            <p className="capitalize text-blue-500">{contact.conversion_status}</p>
          )}
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
            value={PRODUCT_CATEGORIES.includes(dossier.productCategory ?? '') ? (dossier.productCategory ?? '') : 'Autre'}
            onChange={(e) => {
              if (e.target.value !== 'Autre') { set('productCategory', e.target.value || null); setCustomCategory(''); }
              else set('productCategory', customCategory || null);
            }}
            className={inp}
          >
            <option value="">— Sélectionner —</option>
            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(!PRODUCT_CATEGORIES.includes(dossier.productCategory ?? '') || dossier.productCategory === 'Autre') && (
            <input type="text" placeholder="Préciser..."
              value={customCategory}
              onChange={(e) => { setCustomCategory(e.target.value); debouncedSave({ productCategory: e.target.value || null }); }}
              className={`${inp} mt-1.5`} />
          )}
        </div>

        {/* Autres téléphones */}
        <div>
          <label className={lbl}>Autres numéros de téléphone</label>
          <input type="text" placeholder="+225 07 00 00 00 00, ..."
            value={dossier.otherPhones ?? ''}
            onChange={(e) => set('otherPhones', e.target.value || null)}
            className={inp} />
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
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${dossier.isMaleNotInterested ? 'bg-orange-500' : 'bg-gray-300'}`}
          >
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
                }`}
              >{label}</button>
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
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              Historique d'appels ({callLogs.length})
            </span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showHistory && (
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {callLogs.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">Aucun appel enregistré</p>
              ) : callLogs.map((log) => (
                <div key={log.id} className="px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-gray-800">
                      {log.outcome ? OUTCOME_LABELS[log.outcome] ?? log.outcome : '📞 Appel'}
                    </span>
                    <span className="text-gray-400">{formatDate(log.called_at)}</span>
                  </div>
                  <p className="text-gray-500">{log.commercial_name}
                    {log.duration_sec ? ` · ${Math.round(log.duration_sec / 60)}min` : ''}
                  </p>
                  {log.notes && <p className="text-gray-600 mt-0.5 italic">{log.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Sauvegarde auto'}
        </span>
        {isComplete && (
          <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">Dossier complet</span>
        )}
      </div>
    </div>
  );
}
