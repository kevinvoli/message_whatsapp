"use client";

import React, { useEffect, useState } from 'react';
import { X, Send } from 'lucide-react';
import { getApprovedTemplates, sendTemplate, FrontHsmTemplate } from '@/lib/templateApi';

interface TemplateSelectorModalProps {
  chatId: string;
  channelId: string;
  onClose: () => void;
  onSent: () => void;
}

function extractVariableCount(bodyText: string): number {
  const matches = bodyText.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

const TemplateSelectorModal: React.FC<TemplateSelectorModalProps> = ({
  chatId,
  channelId,
  onClose,
  onSent,
}) => {
  const [templates, setTemplates] = useState<FrontHsmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FrontHsmTemplate | null>(null);
  const [variables, setVariables] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getApprovedTemplates()
      .then(setTemplates)
      .catch(() => setError('Impossible de charger les templates.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (tpl: FrontHsmTemplate) => {
    setSelected(tpl);
    const count = extractVariableCount(tpl.body_text);
    setVariables(Array(count).fill(''));
    setError(null);
  };

  const handleVariableChange = (index: number, value: string) => {
    setVariables((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      await sendTemplate({
        chatId,
        channelId,
        templateName: selected.name,
        languageCode: selected.language,
        bodyParameters: variables.length > 0 ? variables : undefined,
      });
      onSent();
      onClose();
    } catch {
      setError("Echec de l'envoi. Veuillez reessayer.");
    } finally {
      setSending(false);
    }
  };

  const categoryColors: Record<string, string> = {
    MARKETING: 'bg-purple-100 text-purple-700',
    UTILITY: 'bg-blue-100 text-blue-700',
    AUTHENTICATION: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Choisir un template</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Aucun template approuve disponible.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelect(tpl)}
                  className={`text-left border rounded-lg p-3 transition-colors ${
                    selected?.id === tpl.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold text-gray-800">{tpl.name}</span>
                    {tpl.category && (
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          categoryColors[tpl.category] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {tpl.category}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">{tpl.language}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{tpl.body_text}</p>
                </button>
              ))}
            </div>
          )}

          {selected && variables.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Variables du template
              </p>
              <div className="flex flex-col gap-2">
                {variables.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8 flex-shrink-0">
                      {`{{${idx + 1}}}`}
                    </span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => handleVariableChange(idx, e.target.value)}
                      placeholder={`Variable ${idx + 1}`}
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!selected || sending}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelectorModal;
