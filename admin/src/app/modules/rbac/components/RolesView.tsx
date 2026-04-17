"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { PlusCircle, Trash2, Edit, ShieldCheck, LayoutGrid, List, Check } from 'lucide-react';
import { Role, Permission } from '@/app/lib/definitions';
import { getRoles, createRole, updateRole, deleteRole } from '@/app/lib/api/rbac.api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';
import { formatDateShort } from '@/app/lib/dateUtils';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'default';

const ALL_PERMISSIONS: { group: string; permissions: Permission[] }[] = [
  { group: 'Conversations', permissions: ['chat:view', 'chat:reply', 'chat:close', 'chat:transfer', 'chat:merge'] },
  { group: 'Contacts', permissions: ['contact:view', 'contact:edit', 'contact:delete', 'contact:export'] },
  { group: 'CRM', permissions: ['crm:view', 'crm:edit'] },
  { group: 'Labels', permissions: ['label:view', 'label:manage'] },
  { group: 'Analytics', permissions: ['analytics:view', 'analytics:export'] },
  { group: 'Réponses types', permissions: ['canned:view', 'canned:manage'] },
  { group: 'Administration', permissions: ['admin:panel', 'user:manage', 'channel:manage'] },
];

const PERM_LABELS: Record<Permission, string> = {
  'chat:view': 'Voir', 'chat:reply': 'Répondre', 'chat:close': 'Fermer', 'chat:transfer': 'Transférer', 'chat:merge': 'Fusionner',
  'contact:view': 'Voir', 'contact:edit': 'Modifier', 'contact:delete': 'Supprimer', 'contact:export': 'Exporter',
  'crm:view': 'Voir', 'crm:edit': 'Modifier',
  'label:view': 'Voir', 'label:manage': 'Gérer',
  'analytics:view': 'Voir', 'analytics:export': 'Exporter',
  'canned:view': 'Voir', 'canned:manage': 'Gérer',
  'admin:panel': 'Accès panel', 'user:manage': 'Gérer utilisateurs', 'channel:manage': 'Gérer canaux',
};

const DEFAULT_FORM = { name: '', description: '', permissions: [] as Permission[] };

export default function RolesView() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setRoles(await getRoles(TENANT_ID)); }
    catch { addToast({ message: 'Erreur chargement rôles', type: 'error' }); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({ name: r.name, description: r.description ?? '', permissions: [...r.permissions] });
    setShowForm(true);
  };

  const togglePerm = (p: Permission) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateRole(editing.id, TENANT_ID, { name: form.name, description: form.description || null, permissions: form.permissions });
        addToast({ message: 'Rôle mis à jour', type: 'success' });
      } else {
        await createRole({ tenant_id: TENANT_ID, name: form.name, description: form.description || undefined, permissions: form.permissions });
        addToast({ message: 'Rôle créé', type: 'success' });
      }
      setShowForm(false);
      void load();
    } catch (e: unknown) {
      addToast({ message: e instanceof Error ? e.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (r: Role) => {
    if (r.is_system) { addToast({ message: 'Impossible de supprimer un rôle système', type: 'error' }); return; }
    if (!confirm(`Supprimer le rôle "${r.name}" ?`)) return;
    try {
      await deleteRole(r.id, TENANT_ID);
      addToast({ message: 'Rôle supprimé', type: 'success' });
      void load();
    } catch { addToast({ message: 'Erreur suppression', type: 'error' }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Rôles & Permissions</h2>
          <p className="text-sm text-gray-500 mt-1">Contrôle d'accès basé sur les rôles (RBAC)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Vue liste"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`p-2 ${viewMode === 'matrix' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Vue matrice"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
            <PlusCircle className="w-4 h-4" /> Nouveau rôle
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">{editing ? 'Modifier le rôle' : 'Nouveau rôle'}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Superviseur" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Rôle pour..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
              <div className="space-y-3">
                {ALL_PERMISSIONS.map(group => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{group.group}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.permissions.map(p => (
                        <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(p)}
                            onChange={() => togglePerm(p)}
                            className="w-3.5 h-3.5"
                          />
                          <span className="text-xs text-gray-700">{p.split(':')[1] ? PERM_LABELS[p] : p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : roles.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 text-center py-12 text-gray-500">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Aucun rôle défini</p>
        </div>
      ) : viewMode === 'matrix' ? (
        /* ── Matrice permissions × rôles ── */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-48 sticky left-0 bg-white z-10">Permission</th>
                {roles.map(r => (
                  <th key={r.id} className="px-3 py-3 text-center text-xs font-semibold text-gray-700 min-w-[100px]">
                    <div>{r.name}</div>
                    {r.is_system && <div className="text-gray-400 font-normal normal-case text-[10px]">Système</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map(group => (
                <React.Fragment key={group.group}>
                  <tr className="bg-gray-50">
                    <td colSpan={roles.length + 1} className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase sticky left-0 bg-gray-50">
                      {group.group}
                    </td>
                  </tr>
                  {group.permissions.map(perm => (
                    <tr key={perm} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 sticky left-0 bg-white text-xs text-gray-700 font-mono">
                        {perm}
                      </td>
                      {roles.map(r => (
                        <td key={r.id} className="px-3 py-2.5 text-center">
                          {r.permissions.includes(perm) ? (
                            <Check className="w-4 h-4 text-green-500 mx-auto" />
                          ) : (
                            <span className="w-4 h-4 block mx-auto text-gray-200">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Vue liste ── */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="divide-y divide-gray-100">
            {roles.map(r => (
              <div key={r.id} className="p-5 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-gray-900">{r.name}</span>
                      {r.is_system && <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Système</span>}
                    </div>
                    {r.description && <p className="text-sm text-gray-500 mb-2">{r.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      {r.permissions.slice(0, 8).map(p => (
                        <span key={p} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{p}</span>
                      ))}
                      {r.permissions.length > 8 && (
                        <span className="text-xs text-gray-400">+{r.permissions.length - 8} de plus</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{formatDateShort(r.createdAt)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                    {!r.is_system && (
                      <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
