"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { initiateOutboundConversation } from '@/app/lib/api/conversations.api';
import { getWhatsappTemplates } from '@/app/lib/api/templates.api';
import { Channel, WhatsappTemplate } from '@/app/lib/definitions';

interface OutboundMessageModalProps {
  onClose: () => void;
  onSuccess?: (chatId: string) => void;
  channels?: Channel[];
}

const E164_REGEX = /^\d{7,15}$/;

function extractPlaceholderCount(components: any): number {
  if (!components) return 0;
  const body = Array.isArray(components) ? components.find((c: any) => c.type === 'BODY') : null;
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g) ?? [];
  return matches.length;
}

function getBodyText(components: any): string {
  if (!components) return '';
  const body = Array.isArray(components) ? components.find((c: any) => c.type === 'BODY') : null;
  return body?.text ?? '';
}

export default function OutboundMessageModal({ onClose, onSuccess, channels = [] }: OutboundMessageModalProps) {
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0]?.channel_id ?? '');
  const [recipient, setRecipient] = useState('');
  const [contactName, setContactName] = useState('');
  const [text, setText] = useState('');
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChannel = channels.find(c => c.channel_id === selectedChannelId);
  const isTemplateMode = selectedChannel?.provider === 'meta';
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;
  const paramCount = selectedTemplate ? extractPlaceholderCount(selectedTemplate.components) : 0;

  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].channel_id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    setSelectedTemplateId('');
    setTemplates([]);
    setTemplateParams([]);
    setText('');
    if (isTemplateMode && selectedChannel?.id) {
      setLoadingTemplates(true);
      getWhatsappTemplates(selectedChannel.id, 'APPROVED')
        .then(setTemplates)
        .catch(() => setTemplates([]))
        .finally(() => setLoadingTemplates(false));
    }
  }, [selectedChannelId, isTemplateMode, selectedChannel?.id]);

  useEffect(() => {
    setTemplateParams(prev => {
      const arr = [...prev];
      while (arr.length < paramCount) arr.push('');
      return arr.slice(0, paramCount);
    });
  }, [paramCount]);

  const validateRecipient = useCallback((): string | null => {
    const clean = recipient.replace(/[\s+\-()]/g, '');
    if (['whapi', 'meta'].includes(selectedChannel?.provider ?? '')) {
      return E164_REGEX.test(clean) ? clean : null;
    }
    return clean || null;
  }, [recipient, selectedChannel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanRecipient = validateRecipient();
    if (!cleanRecipient) {
      setError('Numéro invalide — format E.164 requis (7-15 chiffres sans +)');
      return;
    }
    if (isTemplateMode && !selectedTemplateId) {
      setError('Sélectionner un template');
      return;
    }
    if (!isTemplateMode && !text.trim()) {
      setError('Le message est requis');
      return;
    }

    setLoading(true);
    try {
      const result = await initiateOutboundConversation({
        channel_id: selectedChannelId,
        recipient: cleanRecipient,
        text: isTemplateMode ? undefined : text.trim(),
        template_id: isTemplateMode ? selectedTemplateId : undefined,
        template_params: isTemplateMode && templateParams.length > 0 ? templateParams : undefined,
        contact_name: contactName.trim() || undefined,
      });
      onSuccess?.(result.chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  const placeholderPhone = isTemplateMode ? 'ex: 2250712345678' : 'ex: +225 07 12 34 56 78';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-800 mb-4">Nouveau message sortant</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {channels.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
              <select
                value={selectedChannelId}
                onChange={e => setSelectedChannelId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {channels.map(ch => (
                  <option key={ch.channel_id} value={ch.channel_id}>
                    {ch.label ?? ch.channel_id} ({ch.provider ?? 'whapi'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de téléphone</label>
            <input
              type="tel"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder={placeholderPhone}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {isTemplateMode && (
              <p className="text-xs text-gray-500 mt-1">Chiffres uniquement, sans +</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du contact (optionnel)</label>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="Jean Dupont"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isTemplateMode ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
                {loadingTemplates ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
                  </div>
                ) : (
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Sélectionner un template --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                )}
              </div>

              {selectedTemplate && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">Aperçu du corps</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{getBodyText(selectedTemplate.components)}</p>
                </div>
              )}

              {paramCount > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Paramètres</label>
                  {Array.from({ length: paramCount }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-8">{`{{${i + 1}}}`}</span>
                      <input
                        type="text"
                        value={templateParams[i] ?? ''}
                        onChange={e => {
                          const arr = [...templateParams];
                          arr[i] = e.target.value;
                          setTemplateParams(arr);
                        }}
                        placeholder={`Valeur ${i + 1}`}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { void handleSubmit(e as unknown as React.FormEvent); } }}
                rows={4}
                placeholder="Votre message... (Ctrl+Entrée pour envoyer)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
