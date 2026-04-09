'use client';

import React, { useEffect, useState } from 'react';
import {
    AlertConfig,
    AlertRecipient,
    AlertSendResult,
    AlertStatus,
    LastAlertAttempt,
    getAlertConfig,
    getAlertDefaultTemplate,
    getChannels,
    getSystemHealthStatus,
    sendTestAlert,
    updateAlertConfig,
} from '@/app/lib/api';
import { Channel } from '@/app/lib/definitions';
import { Bell, Plus, Trash2, RotateCcw, Save, Phone, Send, CheckCircle, XCircle, AlertTriangle, Clock, Wifi, WifiOff } from 'lucide-react';
import { formatTime, formatDateShort } from '@/app/lib/dateUtils';

interface Props {
    onStatusRefresh?: () => void;
}

// ─── Bloc statut du dernier envoi ───────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
    pending: 'En attente (pending)',
    sent: 'Envoyé (sent)',
    delivered: 'Livré (delivered)',
    read: 'Lu (read)',
};

const STATUS_COLOR: Record<string, string> = {
    pending: 'text-orange-600',
    sent: 'text-blue-600',
    delivered: 'text-green-700',
    read: 'text-green-700',
};

function SendResultRow({ r }: { r: AlertSendResult }) {
    const isRealSuccess = r.success && !r.whapiFlagged;
    const isFlagged = r.success && r.whapiFlagged;

    return (
        <div className={`flex items-start gap-3 px-3 py-2 rounded-lg ${
            isRealSuccess ? 'bg-green-50' : isFlagged ? 'bg-orange-50' : 'bg-red-50'
        }`}>
            {isRealSuccess
                ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                : isFlagged
                    ? <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            }
            <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-gray-800">
                    {r.recipientName} — <span className="font-mono text-xs">{r.recipientPhone}</span>
                </p>
                {isRealSuccess && (
                    <>
                        <p className="text-xs text-green-700">
                            Canal : <span className="font-medium">{r.channelName || 'Canal sans nom'}</span>
                        </p>
                        {r.messageStatus && (
                            <p className={`text-xs font-medium ${STATUS_COLOR[r.messageStatus] ?? 'text-gray-600'}`}>
                                Statut Whapi : {STATUS_LABEL[r.messageStatus] ?? r.messageStatus}
                                {r.messageStatus === 'pending' && (
                                    <span className="font-normal text-gray-500 ml-1">
                                        — le canal est peut-être déconnecté de WhatsApp
                                    </span>
                                )}
                            </p>
                        )}
                        {r.providerMessageId && (
                            <p className="text-xs text-gray-400 font-mono">
                                ID Whapi : {r.providerMessageId}
                            </p>
                        )}
                    </>
                )}
                {isFlagged && (
                    <p className="text-xs text-orange-700">
                        Whapi a répondu HTTP 200 mais <strong>sent=false</strong> — message refusé.
                        Statut : {r.messageStatus ?? 'inconnu'}. Vérifiez que le canal est connecté à WhatsApp.
                    </p>
                )}
                {!r.success && (
                    <pre className="text-xs text-red-700 whitespace-pre-wrap font-sans">{r.error}</pre>
                )}
            </div>
        </div>
    );
}

function LastAttemptPanel({ attempt }: { attempt: LastAlertAttempt }) {
    const at = formatTime(new Date(attempt.triggeredAt));
    const date = formatDateShort(new Date(attempt.triggeredAt));
    return (
        <div className={`border rounded-xl p-4 space-y-3 ${attempt.overallSuccess ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <div className="flex items-center gap-2">
                {attempt.overallSuccess
                    ? <Send className="w-4 h-4 text-green-600" />
                    : <AlertTriangle className="w-4 h-4 text-red-500" />
                }
                <span className="font-medium text-sm text-gray-800">
                    {attempt.overallSuccess ? 'Dernier envoi réussi' : 'Dernier envoi échoué'}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                    {date} à {at} — silence {attempt.silenceMinutes} min
                </span>
            </div>
            {attempt.results.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Aucun destinataire configuré au moment de l&apos;envoi</p>
            ) : (
                <div className="space-y-1.5">
                    {attempt.results.map((r, i) => <SendResultRow key={i} r={r} />)}
                </div>
            )}
        </div>
    );
}

// ─── Vue principale ──────────────────────────────────────────────────────────

export default function AlertConfigView({ onStatusRefresh }: Props) {
    const [config, setConfig] = useState<AlertConfig | null>(null);
    const [status, setStatus] = useState<AlertStatus | null>(null);
    const [defaultTemplate, setDefaultTemplate] = useState<string>('');
    const [whapiChannels, setWhapiChannels] = useState<Channel[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ results: AlertSendResult[]; message: string } | null>(null);

    // Formulaire
    const [enabled, setEnabled] = useState(true);
    const [thresholdMin, setThresholdMin] = useState(60);
    const [retryMin, setRetryMin] = useState(15);
    const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
    const [messageTemplate, setMessageTemplate] = useState<string>('');
    const [useDefaultTemplate, setUseDefaultTemplate] = useState(true);
    const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);

    // Nouveau destinataire
    const [newPhone, setNewPhone] = useState('');
    const [newName, setNewName] = useState('');

    const loadAll = async () => {
        try {
            const [cfg, tpl, st, channels] = await Promise.all([
                getAlertConfig(),
                getAlertDefaultTemplate(),
                getSystemHealthStatus(),
                getChannels(),
            ]);
            setConfig(cfg);
            setDefaultTemplate(tpl);
            setStatus(st);
            // Garder seulement les canaux Whapi (provider null ou 'whapi')
            setWhapiChannels(channels.filter((c) => !c.provider || c.provider === 'whapi'));
            setEnabled(cfg.enabled);
            setThresholdMin(cfg.silenceThresholdMinutes);
            setRetryMin(cfg.retryAfterMinutes);
            setRecipients(cfg.recipients ?? []);
            setDefaultChannelId(cfg.defaultChannelId ?? null);
            if (cfg.messageTemplate) {
                setMessageTemplate(cfg.messageTemplate);
                setUseDefaultTemplate(false);
            } else {
                setMessageTemplate(tpl);
                setUseDefaultTemplate(true);
            }
        } catch {
            setError('Erreur de chargement de la configuration');
        }
    };

    useEffect(() => { void loadAll(); }, []);

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
                defaultChannelId: defaultChannelId || null,
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

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        setError(null);
        try {
            const result = await sendTestAlert();
            setTestResult(result);
            // Rafraîchir le statut pour voir le dernier envoi
            const st = await getSystemHealthStatus();
            setStatus(st);
            onStatusRefresh?.();
        } catch (e) {
            setError(`Erreur lors du test : ${(e as Error).message}`);
        } finally {
            setTesting(false);
        }
    };

    if (!config) {
        return <div className="p-6 text-gray-500">Chargement…</div>;
    }

    const silenceMin = status?.silenceMinutes ?? 0;
    const timerActive = status?.timerActive ?? false;

    return (
        <div className="p-6 space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Bell className="w-6 h-6 text-orange-500" />
                    <h2 className="text-xl font-semibold text-gray-900">Alertes système</h2>
                </div>
                {/* Statut live */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                    status?.alerting
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-green-50 border-green-200 text-green-700'
                }`}>
                    {status?.alerting
                        ? <><AlertTriangle className="w-3.5 h-3.5" /> Alerte active</>
                        : <><CheckCircle className="w-3.5 h-3.5" /> Système OK</>
                    }
                </div>
            </div>

            {/* Statut du timer */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600">Silence actuel :</span>
                    <strong className={silenceMin >= thresholdMin ? 'text-red-600' : 'text-gray-800'}>
                        {silenceMin} min
                    </strong>
                    <span className="text-gray-400">/ seuil {thresholdMin} min</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    {timerActive
                        ? <><Wifi className="w-4 h-4 text-green-500" /><span className="text-green-600">Timer actif</span></>
                        : <><WifiOff className="w-4 h-4 text-orange-500" /><span className="text-orange-600">Timer inactif (socket non prêt)</span></>
                    }
                </div>
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

            {/* Dernier envoi */}
            {status?.lastAlertAttempt && (
                <LastAttemptPanel attempt={status.lastAlertAttempt} />
            )}

            {/* Résultat du test */}
            {testResult && (
                <div className={`border rounded-xl p-4 space-y-3 ${
                    testResult.results.every(r => r.success) ? 'border-green-200 bg-green-50/50' : 'border-orange-200 bg-orange-50/50'
                }`}>
                    <div className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-sm text-gray-800">Résultat du test</span>
                        <span className="ml-auto text-xs text-gray-500">{testResult.message}</span>
                    </div>
                    {testResult.results.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">Aucun destinataire configuré</p>
                    ) : (
                        <div className="space-y-1.5">
                            {testResult.results.map((r, i) => <SendResultRow key={i} r={r} />)}
                        </div>
                    )}
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

            {/* Canal d'envoi */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-gray-800">Canal d&apos;envoi</h3>
                <p className="text-xs text-gray-500">
                    Choisissez le canal Whapi utilisé pour envoyer les alertes.
                    Si le canal choisi échoue, le système essaie les autres canaux Whapi automatiquement.
                </p>
                <select
                    value={defaultChannelId ?? ''}
                    onChange={(e) => setDefaultChannelId(e.target.value || null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                >
                    <option value="">Automatique — essaie tous les canaux dans l&apos;ordre</option>
                    {whapiChannels.map((c) => (
                        <option key={c.channel_id} value={c.channel_id}>
                            {c.label || 'Canal sans nom'}
                        </option>
                    ))}
                </select>
                {whapiChannels.length === 0 && (
                    <p className="text-xs text-orange-600">
                        Aucun canal Whapi trouvé. Les canaux Meta, Messenger, Instagram et Telegram
                        ne peuvent pas envoyer d&apos;alertes WhatsApp.
                    </p>
                )}
                {defaultChannelId && (
                    <p className="text-xs text-blue-600">
                        Canal sélectionné en priorité. Les autres canaux Whapi serviront de fallback si celui-ci échoue.
                    </p>
                )}
            </div>

            {/* Destinataires */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h3 className="font-medium text-gray-800">Destinataires</h3>
                <p className="text-xs text-gray-500">
                    Format : international sans <code className="bg-gray-100 px-1 rounded">+</code> ni <code className="bg-gray-100 px-1 rounded">00</code>.{' '}
                    Côte d&apos;Ivoire : <code className="bg-gray-100 px-1 rounded">225556789012</code> (sans le 0 local).
                    Le système normalise automatiquement.
                </p>

                {recipients.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Aucun destinataire — les alertes ne seront pas envoyées par WhatsApp.</p>
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
                                <span className="text-sm text-gray-500 font-mono">+{r.phone}</span>
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

                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Nom"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <input
                        type="text"
                        placeholder="225556789012"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
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
                            Modèle{' '}
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

                <div>
                    <p className="text-xs text-gray-500 mb-1">Aperçu :</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                        {(useDefaultTemplate ? defaultTemplate : messageTemplate).replace(/\{silenceMin\}/g, String(silenceMin || 42))}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 justify-between">
                <button
                    onClick={handleTest}
                    disabled={testing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    <Send className="w-4 h-4" />
                    {testing ? 'Envoi en cours…' : 'Envoyer un test maintenant'}
                </button>

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
