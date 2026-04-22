"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, RefreshCw, Image, Video, FileText, Music, Layers } from "lucide-react";
import { useToast } from "@/app/ui/ToastProvider";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type AssetCategory = "produit" | "service" | "promo" | "info";
type AssetMediaType = "image" | "video" | "document" | "audio";

interface Asset {
  id: string;
  category: AssetCategory;
  mediaType: AssetMediaType;
  title: string;
  description: string | null;
  mediaUrl: string;
  textTemplate: string | null;
  isActive: boolean;
  sortOrder: number;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  produit: "Produit", service: "Service", promo: "Promo", info: "Info",
};
const MEDIA_ICONS: Record<AssetMediaType, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  image: Image, video: Video, document: FileText, audio: Music,
};
const CATEGORY_COLORS: Record<AssetCategory, string> = {
  produit: "bg-blue-50 text-blue-700",
  service: "bg-purple-50 text-purple-700",
  promo:   "bg-orange-50 text-orange-700",
  info:    "bg-gray-50 text-gray-700",
};

const emptyForm = (): Partial<Asset> => ({
  category: "produit", mediaType: "image", title: "", mediaUrl: "",
  description: null, textTemplate: null, sortOrder: 0,
});

export default function CatalogManager() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState<Partial<Asset>>(emptyForm());
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/catalog?all=true`, { credentials: "include" });
      if (res.ok) setAssets(await res.json() as Asset[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (a: Asset) => { setEditing(a); setForm({ ...a }); setShowForm(true); };

  const saveForm = async () => {
    const url = editing ? `${API_BASE_URL}/catalog/${editing.id}` : `${API_BASE_URL}/catalog`;
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    });
    if (res.ok) {
      addToast({ message: editing ? "Asset mis à jour" : "Asset créé", type: "success" });
      setShowForm(false);
      void load();
    } else {
      addToast({ message: "Erreur lors de l'enregistrement", type: "error" });
    }
  };

  const toggle = async (a: Asset) => {
    const action = a.isActive ? "deactivate" : "activate";
    await fetch(`${API_BASE_URL}/catalog/${a.id}/${action}`, { method: "PATCH", credentials: "include" });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cet asset ?")) return;
    await fetch(`${API_BASE_URL}/catalog/${id}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-teal-600" />
          <h2 className="text-xl font-bold text-gray-900">Catalogue multimédia</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700">
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Titre</th>
              <th className="px-4 py-3 text-left">Catégorie</th>
              <th className="px-4 py-3 text-center">Statut</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {assets.map((a) => {
              const Icon = MEDIA_ICONS[a.mediaType];
              return (
                <tr key={a.id} className={a.isActive ? "bg-white" : "bg-gray-50 opacity-60"}>
                  <td className="px-4 py-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-500" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 truncate max-w-xs">{a.title}</p>
                    {a.description && <p className="text-xs text-gray-400 truncate max-w-xs">{a.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[a.category]}`}>
                      {CATEGORY_LABELS[a.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => void toggle(a)} title={a.isActive ? "Désactiver" : "Activer"}>
                      {a.isActive
                        ? <ToggleRight className="w-5 h-5 text-teal-500 mx-auto" />
                        : <ToggleLeft className="w-5 h-5 text-gray-400 mx-auto" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(a)} className="text-blue-500 hover:text-blue-700">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => void remove(a.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && !loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Aucun asset — cliquez sur Ajouter</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Formulaire modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">{editing ? "Modifier l'asset" : "Nouvel asset"}</h3>
            {(["title", "mediaUrl"] as const).map((field) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-gray-500 mb-1 capitalize">{field === "mediaUrl" ? "URL média" : "Titre"} *</label>
                <input value={(form[field] as string) ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Catégorie</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AssetCategory }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
                  {(Object.keys(CATEGORY_LABELS) as AssetCategory[]).map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Type média</label>
                <select value={form.mediaType} onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value as AssetMediaType }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
                  {(["image","video","document","audio"] as AssetMediaType[]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea value={form.description ?? ""} rows={2} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Message template</label>
              <textarea value={form.textTemplate ?? ""} rows={2} onChange={(e) => setForm((f) => ({ ...f, textTemplate: e.target.value || null }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none"
                placeholder="Message par défaut envoyé avec le média..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
              <button onClick={() => void saveForm()} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700">
                {editing ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
