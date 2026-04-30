"use client";

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, AlertCircle, FileText, MessageSquare } from 'lucide-react';
import { Channel, WhatsappTemplate } from '../lib/definitions';
import { initiateOutboundConversation, getWhatsappTemplates } from '../lib/api';

interface OutboundMessageModalProps {
  channels: Channel[];
  onClose: () => void;
  onSuccess: (chatId: string) => void;
}

/**
 * Retourne un placeholder adaptatif selon le provider du canal sélectionné.
 */
function getRecipientPlaceholder(provider?: string | null): string {
  if (provider === 'whapi' || provider === 'meta') {
    return 'Numéro au format international sans + (ex: 2250700000000)';
  }
  if (provider === 'messenger') {
    return 'ID Messenger (PSID)';
  }
  if (provider === 'instagram') {
    return 'ID Instagram (IGSID)';
  }
  if (provider === 'telegram') {
    return 'Chat ID Telegram';
  }
  return 'Identifiant du destinataire';
}

/**
 * Valide le format du destinataire selon le provider.
 * Retourne un message d'erreur ou null si valide.
 */
function validateRecipient(recipient: string, provider?: string | null): string | null {
  if (!recipient.trim()) {
    return 'Le destinataire est requis.';
  }
  if (provider === 'whapi' || provider === 'meta') {
    if (!/^\d{7,15}$/.test(recipient.trim())) {
      return 'Format invalide : entrez uniquement les chiffres, sans le + (ex: 2250700000000).';
    }
  }
  return null;
}

/**
 * Badge de provider pour afficher dans le sélecteur de canal.
 */
function ProviderBadgeInline({ provider }: { provider?: string | null }) {
  const colorMap: Record<string, string> = {
    whapi: 'bg-emerald-100 text-emerald-700',
    meta: 'bg-blue-100 text-blue-700',
    messenger: 'bg-indigo-100 text-indigo-700',
    instagram: 'bg-pink-100 text-pink-700',
    telegram: 'bg-sky-100 text-sky-700',
  };
  const label = provider ?? 'inconnu';
  const colorClass = colorMap[label] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`ml-1 inline-block px-1.5 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

/**
 * Badge indiquant le mode d'envoi : Template requis vs Texte libre
 */
function ModeBadge({ isTemplate }: { isTemplate: boolean }) {
  if (isTemplate) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
        <FileText className="w-3 h-3" />
        Template requis
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
      <MessageSquare className="w-3 h-3" />
      Texte libre
    </span>
  );
}

/**
 * Extrait le nombre de paramètres {{N}} depuis le body d'un template.
 * Retourne le nombre maximal de paramètres trouvés.
 */
function extractBodyParamCount(template: WhatsappTemplate | null): number {
  if (!template?.components) return 0;

  const components = Array.isArray(template.components)
    ? template.components
    : [];

  const bodyComponent = components.find(
    (c: any) => c?.type?.toLowerCase() === 'body',
  );

  if (!bodyComponent?.text) return 0;

  const matches = (bodyComponent.text as string).match(/\{\{(\d+)\}\}/g);
  if (!matches) return 0;

  const indices = matches.map((m: string) => parseInt(m.replace(/\{\{|\}\}/g, ''), 10));
  return Math.max(...indices);
}

export default function OutboundMessageModal({
  channels,
  onClose,
  onSuccess,
}: OutboundMessageModalProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string>(channels[0]?.channel_id ?? '');
  const [recipient, setRecipient] = useState('');
  const [contactName, setContactName] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  // State templates
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus sur le sélecteur de canal à l'ouverture
  useEffect(() => {
    if (channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].channel_id);
    }
  }, [channels, selectedChannelId]);

  const selectedChannel = channels.find((c) => c.channel_id === selectedChannelId) ?? null;

  // Le mode template est obligatoire uniquement pour Meta
  const isTemplateMode = selectedChannel?.provider === 'meta';

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null;

  const bodyParamCount = extractBodyParamCount(selectedTemplate);

  // Charger les templates APPROVED quand le canal change et que c'est Meta
  useEffect(() => {
    if (!selectedChannel?.id || selectedChannel.provider !== 'meta') {
      setTemplates([]);
      setSelectedTemplateId('');
      setTemplateParams([]);
      return;
    }

    let cancelled = false;
    setTemplatesLoading(true);
    setTemplates([]);
    setSelectedTemplateId('');
    setTemplateParams([]);

    getWhatsappTemplates(selectedChannel.id, 'APPROVED')
      .then((data) => {
        if (!cancelled) {
          setTemplates(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
        }
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChannel?.id, selectedChannel?.provider]);

  // Réinitialiser les params quand le template change
  useEffect(() => {
    if (selectedTemplate) {
      const count = extractBodyParamCount(selectedTemplate);
      setTemplateParams(Array(count).fill(''));
    } else {
      setTemplateParams([]);
    }
  }, [selectedTemplateId]);

  // Réinitialiser l'erreur destinataire quand le canal ou le recipient change
  useEffect(() => {
    setRecipientError(null);
  }, [selectedChannelId, recipient]);

  // Réinitialiser les champs template/texte quand le mode change
  useEffect(() => {
    setSelectedTemplateId('');
    setTemplateParams([]);
    setText('');
    setErrorMessage(null);
  }, [isTemplateMode]);

  const isFormValid = (() => {
    if (!selectedChannelId || recipient.trim().length === 0 || sending) return false;
    if (isTemplateMode) {
      // Mode template : un template doit être sélectionné et tous les params renseignés
      if (!selectedTemplateId) return false;
      if (templateParams.some((p) => !p.trim())) return false;
    } else {
      // Mode texte libre : le texte doit être renseigné
      if (text.trim().length === 0) return false;
    }
    return true;
  })();

  const handleTemplateParamChange = (index: number, value: string) => {
    setTemplateParams((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleSend = async () => {
    // Valider le destinataire avant envoi
    const err = validateRecipient(recipient, selectedChannel?.provider);
    if (err) {
      setRecipientError(err);
      return;
    }

    setErrorMessage(null);
    setSending(true);

    try {
      const payload: Parameters<typeof initiateOutboundConversation>[0] = {
        channel_id: selectedChannelId,
        recipient: recipient.trim(),
        contact_name: contactName.trim() || undefined,
      };

      if (isTemplateMode && selectedTemplateId) {
        payload.template_id = selectedTemplateId;
        payload.template_params = templateParams.map((p) => p.trim());
      } else {
        payload.text = text.trim();
      }

      const result = await initiateOutboundConversation(payload);
      onSuccess(result.chatId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue lors de l\'envoi du message.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isFormValid) {
        void handleSend();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* En-tete */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-semibold text-slate-800">Nouveau message sortant</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps du formulaire */}
        <div className="px-6 py-5 space-y-4">
          {/* Sélecteur de canal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="outbound-channel">
              Canal d'envoi
            </label>
            <select
              id="outbound-channel"
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              disabled={sending}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60 bg-white"
            >
              {channels.length === 0 && (
                <option value="">Aucun canal disponible</option>
              )}
              {channels.map((ch) => (
                <option key={ch.channel_id} value={ch.channel_id}>
                  {ch.label ?? ch.channel_id} — {ch.provider ?? 'inconnu'}
                </option>
              ))}
            </select>
            {selectedChannel?.provider && (
              <div className="mt-1.5 flex items-center gap-2">
                <p className="text-xs text-gray-500">
                  Provider : <ProviderBadgeInline provider={selectedChannel.provider} />
                </p>
                <ModeBadge isTemplate={isTemplateMode} />
              </div>
            )}
          </div>

          {/* Destinataire */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="outbound-recipient">
              Destinataire
            </label>
            <input
              id="outbound-recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={sending}
              placeholder={getRecipientPlaceholder(selectedChannel?.provider)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60 ${
                recipientError ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {recipientError && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {recipientError}
              </p>
            )}
          </div>

          {/* Nom du contact (optionnel) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="outbound-contact-name">
              Nom du contact
              <span className="ml-1 text-gray-400 font-normal">(optionnel)</span>
            </label>
            <input
              id="outbound-contact-name"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={sending}
              placeholder="Nom affiche dans la plateforme"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60"
            />
          </div>

          {/* Zone de message : template (Meta) ou texte libre (autres) */}
          {isTemplateMode ? (
            /* ── MODE TEMPLATE META ───────────────────────────────────────── */
            <div className="space-y-3">
              {/* Sélecteur de template */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="outbound-template">
                  Template HSM
                </label>
                {templatesLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                    <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Chargement des templates...
                  </div>
                ) : templates.length === 0 ? (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Aucun template approuve pour ce canal.
                      Ajoutez des templates via la configuration ou approuvez-les dans votre compte Meta Business.
                    </span>
                  </div>
                ) : (
                  <select
                    id="outbound-template"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={sending}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60 bg-white"
                  >
                    <option value="">Sélectionner un template...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.language})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Apercu du body du template sélectionné */}
              {selectedTemplate && (() => {
                const comps = Array.isArray(selectedTemplate.components)
                  ? selectedTemplate.components
                  : [];
                const bodyComp = comps.find((c: any) => c?.type?.toLowerCase() === 'body');
                return bodyComp?.text ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-mono whitespace-pre-wrap">
                    {bodyComp.text}
                  </div>
                ) : null;
              })()}

              {/* Champs dynamiques pour les paramètres du template */}
              {bodyParamCount > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Paramètres du template
                  </p>
                  {Array.from({ length: bodyParamCount }).map((_, i) => (
                    <div key={i}>
                      <label
                        className="block text-xs text-gray-500 mb-1"
                        htmlFor={`template-param-${i}`}
                      >
                        {`{{${i + 1}}}`}
                      </label>
                      <input
                        id={`template-param-${i}`}
                        type="text"
                        value={templateParams[i] ?? ''}
                        onChange={(e) => handleTemplateParamChange(i, e.target.value)}
                        disabled={sending}
                        placeholder={`Valeur pour {{${i + 1}}}`}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Info : template imposé pour Meta */}
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                Ce canal utilise l'API Meta WhatsApp Cloud. Un template HSM approuve est requis
                pour les contacts n'ayant pas ecrit dans les 24 dernieres heures.
              </p>
            </div>
          ) : (
            /* ── MODE TEXTE LIBRE (Whapi, Messenger, Instagram, Telegram) ── */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="outbound-text">
                Message
              </label>
              <textarea
                id="outbound-text"
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                rows={4}
                placeholder="Votre message... (Ctrl+Entree pour envoyer)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-60 resize-none"
              />
              {selectedChannel?.provider === 'whapi' && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Note : pour les contacts n'ayant jamais ecrit, WhatsApp peut necessiter un template approuve.
                  Whapi permet l'envoi en texte libre dans la plupart des cas.
                </p>
              )}
            </div>
          )}

          {/* Message d'erreur global */}
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!isFormValid}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Envoyer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
