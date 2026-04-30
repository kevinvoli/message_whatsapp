"use client";

import React, { useState } from 'react';
import { X, Send, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { Channel } from '../lib/definitions';
import { createWhatsappTemplate } from '../lib/api';

interface TemplateFormModalProps {
  channels: Channel[];
  onClose: () => void;
  onSuccess: () => void;
}

type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilitaire',
  AUTHENTICATION: 'Authentification',
};

const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'Francais (fr)' },
  { value: 'en', label: 'Anglais (en)' },
  { value: 'en_US', label: 'Anglais US (en_US)' },
  { value: 'pt_BR', label: 'Portugais BR (pt_BR)' },
  { value: 'es', label: 'Espagnol (es)' },
  { value: 'ar', label: 'Arabe (ar)' },
];

/**
 * Valide le nom du template selon les contraintes Meta :
 * uniquement lettres minuscules, chiffres et underscores, 1-512 caracteres.
 */
function validateTemplateName(name: string): string | null {
  if (!name.trim()) return 'Le nom est requis.';
  if (!/^[a-z0-9_]{1,512}$/.test(name.trim())) {
    return 'Nom invalide : uniquement lettres minuscules, chiffres et underscores (ex: confirmation_commande).';
  }
  return null;
}

export default function TemplateFormModal({
  channels,
  onClose,
  onSuccess,
}: TemplateFormModalProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    channels[0]?.id ?? '',
  );
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('UTILITY');
  const [language, setLanguage] = useState('fr');
  const [bodyText, setBodyText] = useState('');
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);
  const isMetaChannel = selectedChannel?.provider === 'meta';

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateTemplateName(value));
  };

  /**
   * Construit le tableau de composants Meta a partir des champs du formulaire.
   */
  function buildComponents(): any[] {
    const components: any[] = [];

    if (headerText.trim()) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      });
    }

    if (bodyText.trim()) {
      components.push({
        type: 'BODY',
        text: bodyText.trim(),
      });
    }

    if (footerText.trim()) {
      components.push({
        type: 'FOOTER',
        text: footerText.trim(),
      });
    }

    return components;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameValidation = validateTemplateName(name);
    if (nameValidation) {
      setNameError(nameValidation);
      return;
    }

    if (!bodyText.trim()) {
      setError('Le corps (BODY) du template est requis.');
      return;
    }

    if (!selectedChannelId) {
      setError('Veuillez selectionner un canal.');
      return;
    }

    setSubmitting(true);
    try {
      await createWhatsappTemplate({
        channelId: selectedChannelId,
        name: name.trim(),
        language,
        category,
        components: buildComponents(),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Echec de la creation du template.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            Creer un template HSM
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Selecteur de canal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Canal <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.label ?? ch.channel_id} ({ch.provider ?? 'inconnu'})
                </option>
              ))}
            </select>
            {isMetaChannel && (
              <p className="mt-1 text-xs text-blue-600">
                Canal Meta : le template sera soumis a Meta pour validation. Statut initial : EN ATTENTE.
              </p>
            )}
            {!isMetaChannel && selectedChannel && (
              <p className="mt-1 text-xs text-emerald-600">
                Canal {selectedChannel.provider ?? 'non Meta'} : le template sera approuve directement.
              </p>
            )}
          </div>

          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du template <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="ex: confirmation_commande"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                nameError ? 'border-red-400' : 'border-gray-300'
              }`}
              disabled={submitting}
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-600">{nameError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Uniquement lettres minuscules, chiffres et underscores.
            </p>
          </div>

          {/* Categorie + Langue en ligne */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categorie <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={submitting}
              >
                {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Langue <span className="text-red-500">*</span>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={submitting}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Header (optionnel) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              En-tete (HEADER) <span className="text-gray-400 font-normal">— optionnel</span>
            </label>
            <input
              type="text"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="Texte d'en-tete (max 60 caracteres)"
              maxLength={60}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Corps (BODY) <span className="text-red-500">*</span>
            </label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={"Bonjour {{1}}, votre commande {{2}} a ete confirmee."}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              Utilisez {"{{1}}"}, {"{{2}}"}... pour les variables dynamiques.
            </p>
          </div>

          {/* Footer (optionnel) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pied de page (FOOTER) <span className="text-gray-400 font-normal">— optionnel</span>
            </label>
            <input
              type="text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Ex: Ne pas repondre a ce message"
              maxLength={60}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting}
            />
          </div>

          {/* Erreur globale */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </form>

        {/* Footer avec boutons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={submitting || !!nameError}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {submitting
              ? 'Soumission...'
              : isMetaChannel
              ? 'Soumettre a Meta'
              : 'Creer le template'}
          </button>
        </div>
      </div>
    </div>
  );
}
