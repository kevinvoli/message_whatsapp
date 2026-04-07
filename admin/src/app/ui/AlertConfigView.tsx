'use client';

import React, { useEffect, useState } from 'react';
import {
    AlertConfig,
    AlertRecipient,
    getAlertConfig,
    getAlertDefaultTemplate,
    updateAlertConfig,
} from '@/app/lib/api';
import { Bell, Plus, Trash2, RotateCcw, Save, Phone } from 'lucide-react';

export default function AlertConfigView() {
    const [config, setConfig] = useState<AlertConfig | null>(null);
    const [defaultTemplate, setDefaultTemplate] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Formulaire
    const [enabled, setEnabled] = useState(true);
    const [thresholdMin, setThresholdMin] = useState(60);
    const [retryMin, setRetryMin] = useState(15);
    const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
    const [messageTemplate, setMessageTemplate] = useState<string>('');
    const [useDefaultTemplate, setUseDefaultTemplate] = useState(true);

    // Nouveau destinataire
    const [newPhone, setNewPhone] = useState('');
    const [newName, setNewName] = useState('');

    useEffect(() => {
        Promise.all([getAlertConfig(), getAlertDefaultTemplate()])
            .then(([cfg, tpl]) => {
                setConfig(cfg);
                setDefaultTemplate(tpl);
                setEnabled(cfg.enabled);
                setThresholdMin(cfg.silenceThresholdMinutes);
                setRetryMin(cfg.retryAfterMinutes);
                setRecipients(cfg.recipients ?? []);
                if (cfg.messageTemplate) {
                    setMessageTemplate(cfg.messageTemplate);
                    setUseDefaultTemplate(false);
                } else {
                    setMessageTemplate(tpl);
                    setUseDefaultTemplate(true);
                }
            })
            .catch(() => setError('Erreur de chargement de la configuration'));
    }, []);

    const addRecipient = () => {
        const phone = newPhone.trim().replace(/\s/g, '');
        const name = newName.trim();
        if (!phone || !name) return;
        setRecipients((prev) => [...prev, { phone, name }]);
        setNewPhone('');
        setNewName('');
    };

    const removeRecipient = (index: number) => {
        setRecipients((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const updated = await updateAlertConfig({
                enabled,
                silenceThresholdMinutes: thresholdMin,
                retryAfterMinutes: retryMin,
                recipients,
                messageTemplate: useDefaultTemplate ? null : (messageTemplate || null),
            });
            setConfig(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
            setError('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return <div className="p-6 text-gray-500">Chargement…</div>;
    }

    return (
        <div className="p-6 space-y-6 max-w-2xl">
            <div className="flex items-center gap-3">
                <Bell className="w-6 h-6 text-orange-500" />
                <h2 className="text-xl font-semibold text-gray-900">Configuration des alertes système</h2>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {error}
                </div>
            )}
            {saved && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                    Configuration sauvegardée avec succès.
                </div>
            )}

            {/* Activation */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-gray-800">Activation</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm text-gray-700">
                        Activer les alertes système WhatsApp
                    </span>
                </label>
            </div>

            {/* Seuils */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-gray-800">Délais</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">
                            Durée de silence avant alerte (minutes)
                        </label>
                        <input
                            type="number"
                            min={5}
                            max={1440}
                            value={thresholdMin}
                            onChange={(e) => setThresholdMin(Number(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <p className="text-xs text-gray-400 mt-1">Recommandé : 60 min</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">
                            Délai avant retry si envoi échoué (minutes)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={120}
                            value={retryMin}
                            onChange={(e) => setRetryMin(Number(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <p className="text-xs text-gray-400 mt-1">Recommandé : 15 min</p>
                    </div>
                </div>
            </div>

            {/* Destinataires */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-gray-800">Destinataires</h3>
                <p className="text-xs text-gray-500">
                    Format du numéro : international sans <code className="bg-gray-100 px-1 rounded">+</code> ni <code className="bg-gray-100 px-1 rounded">00</code>.{' '}
                    Exemple Côte d&apos;Ivoire : <code className="bg-gray-100 px-1 rounded">225556789012</code>
                </p>

                {recipients.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Aucun destinataire configuré</p>
                )}

                <div className="space-y-2">
                    {recipients.map((r, i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                        >
                            <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-800">{r.name}</span>
                                <span className="text-sm text-gray-500">— {r.phone}</span>
                            </div>
                            <button
                                onClick={() => removeRecipient(i)}
                                className="text-red-400 hover:text-red-600 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Ajout */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Nom"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <input
                        type="text"
                        placeholder="225556789012"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <button
                        onClick={addRecipient}
                        disabled={!newPhone || !newName}
                        className="flex items-center gap-1 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-40 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Ajouter
                    </button>
                </div>
            </div>

            {/* Message */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-gray-800">Message d&apos;alerte</h3>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={useDefaultTemplate}
                        onChange={(e) => {
                            setUseDefaultTemplate(e.target.checked);
                            if (e.target.checked) setMessageTemplate(defaultTemplate);
                        }}
                        className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm text-gray-700">Utiliser le message par défaut</span>
                </label>

                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-gray-600">
                            Modèle du message{' '}
                            <span className="text-gray-400">
                                (placeholder : <code className="bg-gray-100 px-1 rounded">{'{silenceMin}'}</code>)
                            </span>
                        </label>
                        {!useDefaultTemplate && (
                            <button
                                onClick={() => setMessageTemplate(defaultTemplate)}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Réinitialiser
                            </button>
                        )}
                    </div>
                    <textarea
                        rows={4}
                        value={messageTemplate}
                        onChange={(e) => setMessageTemplate(e.target.value)}
                        disabled={useDefaultTemplate}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-50 disabled:text-gray-400 resize-none"
                    />
                </div>

                {/* Aperçu */}
                <div>
                    <p className="text-xs text-gray-500 mb-1">Aperçu du message :</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                        {(useDefaultTemplate ? defaultTemplate : messageTemplate).replace(/\{silenceMin\}/g, '42')}
                    </div>
                </div>
            </div>

            {/* Sauvegarde */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
            </div>
        </div>
    );
}
