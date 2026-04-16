"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, Trash2, Edit, GripVertical } from 'lucide-react';
import { ContactFieldDefinition, FieldType } from '@/app/lib/definitions';
import { getCrmFields, createCrmField, updateCrmField, deleteCrmField } from '@/app/lib/api/crm.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texte',
  number: 'Nombre',
  date: 'Date',
  boolean: 'Oui / Non',
  select: 'Liste (choix unique)',
  multiselect: 'Liste (choix multiples)',
};

const FIELD_TYPE_COLORS: Record<FieldType, string> = {
  text: 'bg-gray-100 text-gray-700',
  number: 'bg-blue-100 text-blue-700',
  date: 'bg-purple-100 text-purple-700',
  boolean: 'bg-green-100 text-green-700',
  select: 'bg-orange-100 text-orange-700',
  multiselect: 'bg-yellow-100 text-yellow-700',
};

export default function CrmView() {
  const [fields, setFields] = useState<ContactFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactFieldDefinition | null>(null);
  const [form, setForm] = useState({ name: '', field_key: '', field_type: 'text' as FieldType, options: '', required: false, position: 0 });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFields(await getCrmFields(TENANT_ID));
    } catch { addToast({ message: 'Erreur chargement champs CRM', type: 'error' }); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', field_key: '', field_type: 'text', options: '', required: false, position: fields.length });
    setShowForm(true);
  };

  const openEdit = (f: ContactFieldDefinition) => {
    setEditing(f);
    setForm({ name: f.name, field_key: f.field_key, field_type: f.field_type, options: (f.options ?? []).join(', '), required: f.required, position: f.position });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const options = ['select', 'multiselect'].includes(form.field_type)
        ? form.options.split(',').map(o => o.trim()).filter(Boolean)
        : null;

      if (editing) {
        await updateCrmField(editing.id, TENANT_ID, { name: form.name, options, required: form.required, position: form.position });
        addToast({ message: 'Champ mis à jour', type: 'success' });
      } else {
        await createCrmField({ tenant_id: TENANT_ID, name: form.name, field_key: form.field_key, field_type: form.field_type, options, required: form.required, position: form.position });
        addToast({ message: 'Champ créé', type: 'success' });
      }
      setShowForm(false);
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (f: ContactFieldDefinition) => {
    if (!confirm(`Supprimer le champ "${f.name}" ? Toutes les valeurs seront perdues.`)) return;
    try {
      await deleteCrmField(f.id, TENANT_ID);
      addToast({ message: 'Champ supprimé', type: 'success' });
      void load();
    } catch { addToast({ message: 'Erreur suppression', type: 'error' }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Champs CRM personnalisés</h2>
          <p className="text-sm text-gray-500 mt-1">Définissez les champs affichés sur chaque fiche contact</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <PlusCircle className="w-4 h-4" /> Nouveau champ
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">{editing ? 'Modifier le champ' : 'Nouveau champ CRM'}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Libellé *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Numéro client" />
            </div>

            {!editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clé technique *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={form.field_key} onChange={e => setForm(f => ({ ...f, field_key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="Ex: numero_client" />
              </div>
            )}

            {!editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.field_type} onChange={e => setForm(f => ({ ...f, field_type: e.target.value as FieldType }))}>
                  {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}

            {['select', 'multiselect'].includes(form.field_type) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Options (séparées par virgule)</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.options} onChange={e => setForm(f => ({ ...f, options: e.target.value }))} placeholder="Bronze, Silver, Gold" />
              </div>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" id="required" checked={form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} />
              <label htmlFor="required" className="text-sm text-gray-700">Champ obligatoire</label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : fields.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="font-medium">Aucun champ CRM défini</p>
            <p className="text-sm mt-1">Créez votre premier champ pour enrichir les fiches contact</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Libellé</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Clé</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Options</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Requis</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fields.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-sm"><GripVertical className="w-4 h-4" /></td>
                    <td className="px-4 py-3 font-medium text-gray-900 text-sm">{f.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm font-mono">{f.field_key}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${FIELD_TYPE_COLORS[f.field_type]}`}>
                        {FIELD_TYPE_LABELS[f.field_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{f.options?.join(', ') ?? '—'}</td>
                    <td className="px-4 py-3">
                      {f.required ? <span className="text-xs text-red-600 font-medium">Oui</span> : <span className="text-xs text-gray-400">Non</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(f)} className="text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(f)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
