'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Music, Plus, Trash2, Upload, X, Clock } from 'lucide-react';
import { SubGroupBreakSchedule, MediaAsset } from '@/app/lib/definitions';
import { getBreakSchedules, upsertBreakSchedule, deleteBreakSchedule } from '@/app/lib/api/commercial-groups.api';
import { getMediaAssets, uploadMediaAsset } from '@/app/lib/api';

interface BreakScheduleFormProps {
  subGroupId: string;
  onClose?: () => void;
  /** Rendu inline sans overlay modal. Par défaut: false. */
  inline?: boolean;
}

type AudioMode = 'upload' | 'library';

interface FormState {
  startTime: string;
  endTime: string;
  reminderIntervalMinutes: number;
  popupMessageText: string;
  popupAudioAssetId: string;
  maxDurationMinutes: number;
}

const EMPTY_FORM: FormState = {
  startTime: '',
  endTime: '',
  reminderIntervalMinutes: 5,
  popupMessageText: '',
  popupAudioAssetId: '',
  maxDurationMinutes: 60,
};

export default function BreakScheduleForm({ subGroupId, onClose, inline = false }: BreakScheduleFormProps) {
  const [schedules, setSchedules]       = useState<SubGroupBreakSchedule[]>([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [error, setError]               = useState<string | null>(null);

  const [audioMode, setAudioMode]           = useState<AudioMode>('upload');
  const [previewFile, setPreviewFile]       = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [audioAssets, setAudioAssets]       = useState<MediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets]   = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioAssetName, setAudioAssetName] = useState('');
  const blobUrlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBreakSchedules(subGroupId);
      setSchedules(data);
    } catch {
      setError('Impossible de charger les plages de pause.');
    } finally {
      setLoading(false);
    }
  }, [subGroupId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const handleChange = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const raw = e.target.value;
    const value: string | number = e.target.type === 'number' ? Number(raw) : raw;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSwitchToLibrary = async () => {
    setAudioMode('library');
    if (audioAssets.length > 0) return;
    setLoadingAssets(true);
    try {
      const result = await getMediaAssets({ limit: 200 });
      const audios = result.items.filter((a) => a.mediaType === 'audio');
      setAudioAssets(audios);
      if (form.popupAudioAssetId && !audioAssetName) {
        const found = audios.find((a) => a.id === form.popupAudioAssetId);
        if (found) setAudioAssetName(found.name);
      }
    } catch { /* silencieux */ }
    finally { setLoadingAssets(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setPreviewFile(file);
    setPreviewUrl(url);
  };

  const handleUploadAudio = async () => {
    if (!previewFile) return;
    setUploadingAudio(true);
    try {
      const asset = await uploadMediaAsset({ file: previewFile, name: previewFile.name });
      setForm((prev) => ({ ...prev, popupAudioAssetId: asset.id }));
      setAudioAssetName(asset.name);
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
      setPreviewFile(null);
      setPreviewUrl(null);
    } catch { /* silencieux */ }
    finally { setUploadingAudio(false); }
  };

  const handleSelectAudioAsset = (asset: MediaAsset) => {
    setForm((prev) => ({ ...prev, popupAudioAssetId: asset.id }));
    setAudioAssetName(asset.name);
  };

  const handleRemoveAudio = () => {
    setForm((prev) => ({ ...prev, popupAudioAssetId: '' }));
    setAudioAssetName('');
  };

  const handleSubmit = async () => {
    if (!form.startTime || !form.endTime) {
      setError('Heure de début et de fin requises.');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertBreakSchedule(subGroupId, {
        startTime: form.startTime,
        endTime: form.endTime,
        reminderIntervalMinutes: form.reminderIntervalMinutes,
        popupMessageText: form.popupMessageText.trim() || null,
        popupAudioAssetId: form.popupAudioAssetId.trim() || null,
        maxDurationMinutes: form.maxDurationMinutes,
      });
      setForm(EMPTY_FORM);
      setAudioAssetName('');
      void load();
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteBreakSchedule(id);
      void load();
    } catch { /* silencieux */ }
    finally { setDeletingId(null); }
  };

  const selectedLibraryAsset = audioAssets.find((a) => a.id === form.popupAudioAssetId) ?? null;

  const audioSection = (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-700">Audio popup</label>

      {form.popupAudioAssetId && (
        <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <Music className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
            <span className="text-xs text-indigo-700 truncate">{audioAssetName || form.popupAudioAssetId}</span>
          </div>
          <button
            type="button"
            onClick={handleRemoveAudio}
            className="ml-2 text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0"
          >
            Retirer
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAudioMode('upload')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            audioMode === 'upload'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Importer un fichier
        </button>
        <button
          type="button"
          onClick={() => void handleSwitchToLibrary()}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            audioMode === 'library'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Médiathèque
        </button>
      </div>

      {audioMode === 'upload' && (
        <div className="space-y-2">
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            aria-label="Sélectionner un fichier audio"
            className="w-full text-xs text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {previewUrl && (
            <audio controls src={previewUrl} className="w-full" aria-label="Prévisualisation audio" />
          )}
          {previewFile && (
            <button
              type="button"
              onClick={() => void handleUploadAudio()}
              disabled={uploadingAudio}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploadingAudio
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}
              Ajouter à la médiathèque et utiliser
            </button>
          )}
        </div>
      )}

      {audioMode === 'library' && (
        <div className="space-y-2">
          {loadingAssets ? (
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…
            </div>
          ) : audioAssets.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun audio dans la médiathèque.</p>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-100 rounded-lg p-1">
              {audioAssets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelectAudioAsset(a)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                    form.popupAudioAssetId === a.id
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
          {selectedLibraryAsset && (
            <audio
              controls
              src={selectedLibraryAsset.publicUrl}
              className="w-full"
              aria-label="Écouter l'audio sélectionné"
            />
          )}
        </div>
      )}
    </div>
  );

  const content = (
    <>
      {loading ? (
        <div className="flex items-center justify-center h-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
        </div>
      ) : schedules.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plages configurées</p>
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-indigo-50 rounded-lg">
              <div>
                <span className="text-sm font-medium text-indigo-900">
                  {s.startTime} – {s.endTime}
                </span>
                <span className="ml-3 text-xs text-indigo-600">
                  durée max {s.maxDurationMinutes} min · rappel /{s.reminderIntervalMinutes} min
                </span>
                {s.popupMessageText && (
                  <p className="text-xs text-indigo-500 mt-0.5 truncate max-w-xs">{s.popupMessageText}</p>
                )}
                {s.popupAudioUrl && (
                  <p className="text-xs text-indigo-400 mt-0.5 flex items-center gap-1">
                    <Music className="w-3 h-3" /> Audio configuré
                  </p>
                )}
              </div>
              <button
                onClick={() => void handleDelete(s.id)}
                disabled={deletingId === s.id}
                aria-label="Supprimer cette plage"
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              >
                {deletingId === s.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-2">Aucune plage configurée.</p>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ajouter une plage</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Heure de début *</label>
            <input
              type="time"
              value={form.startTime}
              onChange={handleChange('startTime')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Heure de fin *</label>
            <input
              type="time"
              value={form.endTime}
              onChange={handleChange('endTime')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rappel toutes les (min)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={form.reminderIntervalMinutes}
              onChange={handleChange('reminderIntervalMinutes')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Durée max (min)</label>
            <input
              type="number"
              min={1}
              max={480}
              value={form.maxDurationMinutes}
              onChange={handleChange('maxDurationMinutes')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Message popup</label>
          <textarea
            value={form.popupMessageText}
            onChange={handleChange('popupMessageText')}
            rows={2}
            placeholder="Message affiché lors de la pause (optionnel)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
          />
        </div>

        {audioSection}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
        )}

        <button
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Ajouter la plage
        </button>
      </div>
    </>
  );

  if (inline) {
    return <div className="space-y-5">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-gray-900">Plages de pause</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {content}
        </div>
      </div>
    </div>
  );
}
