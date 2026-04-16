"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, Trash2, FileText, EyeOff } from 'lucide-react';
import { WhatsappTemplate, TemplateStatus, TemplateCategory } from '@/app/lib/definitions';
import { getTemplates, createTemplate, disableTemplate, deleteTemplate } from '@/app/lib/api/templates.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const STATUS_CONFIG: Record<TemplateStatus, { label: string; className: string }> = {
  PENDING:    { label: 'En attente',   className: 'bg-yellow-100 text-yellow-700' },
  APPROVED:   { label: 'Approuvé',     className: 'bg-green-100 text-green-700' },
  REJECTED:   { label: 'Rejeté',       className: 'bg-red-100 text-red-700' },
  PAUSED:     { label: 'Pausé',        className: 'bg-orange-100 text-orange-700' },
  DISABLED:   { label: 'Désactivé',    className: 'bg-gray-100 text-gray-500' },
  IN_APPEAL:  { label: 'En appel',     className: 'bg-blue-100 text-blue-700' },
  FLAGGED:    { label: 'Signalé',      className: 'bg-red-100 text-red-600' },
  DELETED:    { label: 'Supprimé',     className: 'bg-gray-100 text-gray-400' },
};

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  MARKETING:      'Marketing',
  UTILITY:        'Utilitaire',
  AUTHENTICATION: 'Authentification',
};

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'ar', label: 'Arabe' },
  { value: 'es', label: 'Espagnol' },
];

const DEFAULT_FORM = {
  channel_id: '',
  name: '',
  category: 'UTILITY' as TemplateCategory,
  language: 'fr',
  body_text: '',
  header_type: '',
  header_content: '',
  footer_text: '',
};

export default function TemplatesView() {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<TemplateStatus | ''>('');
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await getTemplates(TENANT_ID)); }
    catch { addToast({ message: 'Erreur chargement templates', type: 'error' }); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createTemplate({
        tenant_id: TENANT_ID,
        channel_id: form.channel_id,
        name: form.name.toLowerCase().replace(/\s+/g, '_'),
        category: form.category,
        language: form.language,
        body_text: form.body_text,
        header_type: form.header_type || undefined,
        header_content: form.header_content || undefined,
        footer_text: form.footer_text || undefined,
      });
      addToast({ message: 'Template créé', type: 'success' });
      setShowForm(false);
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleDisable = async (t: WhatsappTemplate) => {
    try {
      await disableTemplate(t.id, TENANT_ID);
      addToast({ message: 'Template désactivé', type: 'success' });
      void load();
    } catch { addToast({ message: 'Erreur désactivation', type: 'error' }); }
  };

  const handleDelete = async (t: WhatsappTemplate) => {
    if (!confirm(`Supprimer le template "${t.name}" ?`)) return;
    try {
      await deleteTemplate(t.id, TENANT_ID);
      addToast({ message: 'Template supprimé', type: 'success' });
      void load();
    } catch { addToast({ message: 'Erreur suppression', type: 'error' }); }
  };

  const displayed = filter ? templates.filter(t => t.status === filter) : templates;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Templates HSM</h2>
          <p className="text-sm text-gray-500 mt-1">Modèles de messages approuvés par Meta pour l'envoi proactif</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <PlusCircle className="w-4 h-4" /> Nouveau template
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === '' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          Tous ({templates.length})
        </button>
        {(['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as TemplateStatus[]).map(s => {
          const count = templates.filter(t => t.status === s).length;
          if (count === 0) return null;
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">Nouveau template HSM</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Canal *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} placeholder="UUID du canal" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promo Ramadan (converti en snake_case)" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as TemplateCategory }))}>
                  {(Object.entries(CATEGORY_LABELS) as [TemplateCategory, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Langue</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Corps du message *</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} value={form.body_text} onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))} placeholder="Bonjour {{1}}, votre commande {{2}} est prête..." />
              <p className="text-xs text-gray-400 mt-1">Utilisez {`{{1}}`}, {`{{2}}`}... pour les variables dynamiques</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type entête</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.header_type} onChange={e => setForm(f => ({ ...f, header_type: e.target.value }))}>
                  <option value="">Aucun</option>
                  <option value="TEXT">Texte</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Vidéo</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
              {form.header_type && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenu entête</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.header_content} onChange={e => setForm(f => ({ ...f, header_content: e.target.value }))} placeholder={form.header_type === 'TEXT' ? 'Titre...' : 'URL...'} />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pied de page</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.footer_text} onChange={e => setForm(f => ({ ...f, footer_text: e.target.value }))} placeholder="Répondez STOP pour vous désabonner" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={handleCreate} disabled={saving || !form.name || !form.body_text} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Aucun template</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayed.map(t => {
              const sc = STATUS_CONFIG[t.status];
              return (
                <div key={t.id} className="p-5 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-semibold text-gray-900 font-mono">{t.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${sc.className}`}>{sc.label}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{CATEGORY_LABELS[t.category]}</span>
                        <span className="text-xs text-gray-400">{t.language.toUpperCase()}</span>
                      </div>
                      {t.header_type && (
                        <p className="text-xs text-gray-400 mb-1">Entête: {t.header_type} {t.header_content ? `— ${t.header_content.slice(0, 40)}` : ''}</p>
                      )}
                      <p className="text-sm text-gray-600 line-clamp-2 mb-1">{t.body_text}</p>
                      {t.footer_text && <p className="text-xs text-gray-400 italic">{t.footer_text}</p>}
                      {t.rejection_reason && <p className="text-xs text-red-500 mt-1">Motif rejet: {t.rejection_reason}</p>}
                      <p className="text-xs text-gray-400 mt-2">{formatDateShort(t.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.status === 'APPROVED' && (
                        <button onClick={() => handleDisable(t)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 px-2 py-1 rounded hover:bg-orange-50">
                          <EyeOff className="w-3.5 h-3.5" /> Désactiver
                        </button>
                      )}
                      <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
