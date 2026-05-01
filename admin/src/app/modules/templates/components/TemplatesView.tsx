"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, Trash2, FileText, Eye, X, RefreshCw } from 'lucide-react';
import { WhatsappTemplate, WhatsappTemplateStatus } from '@/app/lib/definitions';
import { getWhatsappTemplates, createWhatsappTemplate, resubmitWhatsappTemplate } from '@/app/lib/api/templates.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const STATUS_CONFIG: Record<WhatsappTemplateStatus, { label: string; className: string }> = {
  PENDING:  { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Approuvé',   className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rejeté',     className: 'bg-red-100 text-red-700' },
};

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'ar', label: 'Arabe' },
  { value: 'es', label: 'Espagnol' },
];

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];

const DEFAULT_FORM = {
  channelId: '',
  name: '',
  category: 'UTILITY',
  language: 'fr',
  bodyText: '',
  headerType: '',
  headerContent: '',
  footerText: '',
};

function buildComponents(bodyText: string, headerType: string, headerContent: string, footerText: string): any[] {
  const components: any[] = [];
  if (headerType) {
    const header: any = { type: 'HEADER', format: headerType };
    if (headerType === 'TEXT') header.text = headerContent;
    else if (headerContent) header.example = { header_url: [headerContent] };
    components.push(header);
  }
  if (bodyText) components.push({ type: 'BODY', text: bodyText });
  if (footerText) components.push({ type: 'FOOTER', text: footerText });
  return components;
}

function getBodyText(components: any): string {
  if (!Array.isArray(components)) return '';
  const body = components.find((c: any) => c.type === 'BODY');
  return body?.text ?? '';
}

function getHeader(components: any): { format: string; text?: string } | null {
  if (!Array.isArray(components)) return null;
  const h = components.find((c: any) => c.type === 'HEADER');
  return h ? { format: h.format ?? 'TEXT', text: h.text } : null;
}

function getFooterText(components: any): string {
  if (!Array.isArray(components)) return '';
  const f = components.find((c: any) => c.type === 'FOOTER');
  return f?.text ?? '';
}

function renderBodyPreview(body: string): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[var${n}]`);
}

function TemplatePreviewModal({ template, onClose }: { template: WhatsappTemplate; onClose: () => void }) {
  const bodyText = getBodyText(template.components);
  const header = getHeader(template.components);
  const footerText = getFooterText(template.components);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Aperçu — <span className="font-mono text-sm text-blue-600">{template.name}</span></h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_CONFIG[template.status].className}`}>
                {STATUS_CONFIG[template.status].label}
              </span>
              <span className="text-xs text-gray-400">{template.category ?? '—'} · {template.language.toUpperCase()}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#ECE5DD] px-6 py-8 min-h-[200px] flex items-start justify-end">
          <div className="bg-white rounded-xl rounded-tr-none shadow-sm max-w-[85%] overflow-hidden">
            {header && (
              <div className="bg-gray-100">
                {header.format === 'TEXT' ? (
                  <div className="px-3 pt-3 pb-1 font-semibold text-sm text-gray-900">{header.text ?? 'Entête'}</div>
                ) : (
                  <div className="flex items-center justify-center h-24 bg-gray-200 text-gray-400 text-xs">
                    [{header.format}]
                  </div>
                )}
              </div>
            )}
            <div className="px-3 py-2.5">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{renderBodyPreview(bodyText)}</p>
            </div>
            {footerText && (
              <div className="px-3 pb-2.5">
                <p className="text-xs text-gray-400 italic">{footerText}</p>
              </div>
            )}
            <div className="px-3 pb-2 text-right">
              <span className="text-[10px] text-gray-400">10:30</span>
            </div>
          </div>
        </div>

        {template.rejectionReason && (
          <div className="px-5 py-3 bg-red-50 border-t border-red-100">
            <p className="text-xs text-red-700"><strong>Motif de rejet :</strong> {template.rejectionReason}</p>
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex justify-between">
          <span>Créé le {formatDateShort(template.createdAt)}</span>
          <span className="font-mono">{template.externalId ? `Meta ID: ${template.externalId}` : 'Non soumis à Meta'}</span>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesView() {
  const [channelId, setChannelId] = useState('');
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<WhatsappTemplateStatus | ''>('');
  const [previewTemplate, setPreviewTemplate] = useState<WhatsappTemplate | null>(null);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try { setTemplates(await getWhatsappTemplates(channelId)); }
    catch { addToast({ message: 'Erreur chargement templates', type: 'error' }); }
    finally { setLoading(false); }
  }, [channelId, addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!form.channelId || !form.name || !form.bodyText) {
      addToast({ message: 'Canal, nom et corps du message requis', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await createWhatsappTemplate({
        channelId: form.channelId,
        name: form.name.toLowerCase().replace(/\s+/g, '_'),
        language: form.language,
        category: form.category || undefined,
        components: buildComponents(form.bodyText, form.headerType, form.headerContent, form.footerText),
      });
      addToast({ message: 'Template créé', type: 'success' });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      if (channelId === form.channelId) void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleResubmit = async (t: WhatsappTemplate) => {
    try {
      await resubmitWhatsappTemplate(t.id);
      addToast({ message: 'Template resoumis à Meta', type: 'success' });
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur resoumission', type: 'error' });
    }
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

      {/* Filtre par canal */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Canal (UUID) :</label>
        <input
          className="border rounded-lg px-3 py-1.5 text-sm font-mono w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={channelId}
          onChange={e => setChannelId(e.target.value)}
          placeholder="UUID du canal WhapiChannel"
        />
      </div>

      {/* Filtre par statut */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === '' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          Tous ({templates.length})
        </button>
        {(Object.keys(STATUS_CONFIG) as WhatsappTemplateStatus[]).map(s => {
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

      {/* Formulaire de création */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">Nouveau template HSM</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Canal (UUID) *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={form.channelId} onChange={e => setForm(f => ({ ...f, channelId: e.target.value }))} placeholder="UUID du canal" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Promo Ramadan → converti en snake_case" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} value={form.bodyText} onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))} placeholder="Bonjour {{1}}, votre commande {{2}} est prête..." />
              <p className="text-xs text-gray-400 mt-1">Utilisez {`{{1}}`}, {`{{2}}`}... pour les variables dynamiques</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type entête</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.headerType} onChange={e => setForm(f => ({ ...f, headerType: e.target.value }))}>
                  <option value="">Aucun</option>
                  <option value="TEXT">Texte</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Vidéo</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
              {form.headerType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenu entête</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.headerContent} onChange={e => setForm(f => ({ ...f, headerContent: e.target.value }))} placeholder={form.headerType === 'TEXT' ? 'Titre...' : 'URL...'} />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pied de page</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="Répondez STOP pour vous désabonner" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowForm(false); setForm(DEFAULT_FORM); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={handleCreate} disabled={saving || !form.name || !form.bodyText || !form.channelId} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des templates */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {!channelId ? (
          <div className="text-center py-12 text-gray-400 text-sm">Entrez un UUID de canal pour charger les templates</div>
        ) : loading ? (
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
              const bodyText = getBodyText(t.components);
              return (
                <div key={t.id} className="p-5 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-semibold text-gray-900 font-mono">{t.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${sc.className}`}>{sc.label}</span>
                        {t.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.category}</span>}
                        <span className="text-xs text-gray-400">{t.language.toUpperCase()}</span>
                      </div>
                      {bodyText && <p className="text-sm text-gray-600 line-clamp-2 mb-1">{bodyText}</p>}
                      {t.rejectionReason && <p className="text-xs text-red-500 mt-1">Motif rejet: {t.rejectionReason}</p>}
                      <p className="text-xs text-gray-400 mt-2">{formatDateShort(t.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setPreviewTemplate(t)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
                        title="Aperçu"
                      >
                        <Eye className="w-3.5 h-3.5" /> Aperçu
                      </button>
                      {t.status === 'REJECTED' && (
                        <button
                          onClick={() => handleResubmit(t)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-green-50"
                          title="Resoumettre à Meta"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Resoumettre
                        </button>
                      )}
                      <button onClick={() => { /* delete non disponible */ }} className="text-gray-300 cursor-not-allowed" title="Suppression non disponible">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewTemplate && (
        <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      )}
    </div>
  );
}
