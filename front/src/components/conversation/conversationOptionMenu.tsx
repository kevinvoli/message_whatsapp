import React, { useState, useEffect } from 'react';
import { Check, X, MoreVertical, Tag, AlertCircle, ArrowRight, Merge, ClipboardList } from 'lucide-react';
import { Conversation, ConversationStatus } from '@/types/chat';
import { TransferModal } from './TransferModal';
import { LabelMenu } from './LabelMenu';
import { MergeModal } from './MergeModal';

interface ConversationOptionsMenuProps {
  conversation: Conversation;
  onStatusChange: (conversationId: string, newStatus: ConversationStatus) => void;
  onClose?: () => void;
}

export const ConversationOptionsMenu: React.FC<ConversationOptionsMenuProps> = ({
  conversation,
  onStatusChange,
  onClose,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState<ConversationStatus | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [closeBlocked, setCloseBlocked]         = useState(false);
  const [dossierBlocked, setDossierBlocked]     = useState(false);

  useEffect(() => {
    const gicoHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ chatId?: string }>).detail;
      if (!detail?.chatId || detail.chatId === conversation.chat_id) {
        setCloseBlocked(true);
        setTimeout(() => setCloseBlocked(false), 5000);
      }
    };
    const dossierHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ chatId?: string }>).detail;
      if (!detail?.chatId || detail.chatId === conversation.chat_id) {
        setDossierBlocked(true);
        setTimeout(() => setDossierBlocked(false), 6000);
      }
    };
    window.addEventListener('gicop:close-blocked', gicoHandler);
    window.addEventListener('dossier:close-blocked', dossierHandler);
    return () => {
      window.removeEventListener('gicop:close-blocked', gicoHandler);
      window.removeEventListener('dossier:close-blocked', dossierHandler);
    };
  }, [conversation.chat_id]);

  const handleStatusChange = (newStatus: ConversationStatus) => {
    if (newStatus === 'fermé' || newStatus === 'converti') {
      setShowConfirmation(newStatus);
    } else {
      onStatusChange(conversation.id, newStatus);
      setIsOpen(false);
    }
  };

  const confirmStatusChange = () => {
    if (showConfirmation) {
      onStatusChange(conversation.id, showConfirmation);
      setShowConfirmation(null);
      setIsOpen(false);
      setCloseBlocked(false);
      onClose?.();
    }
  };

  const cancelConfirmation = () => {
    setShowConfirmation(null);
  };

  const getStatusIcon = (status: ConversationStatus) => {
    switch (status) {
      case 'fermé':
        return <X className="w-4 h-4" />;
      case 'converti':
        return <Check className="w-4 h-4" />;
      case 'attente':
        return <AlertCircle className="w-4 h-4" />;
      case 'actif':
        return <Tag className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: ConversationStatus) => {
    switch (status) {
      case 'fermé':
        return 'Marquer comme fermé';
      case 'converti':
        return 'Marquer comme converti';
      case 'attente':
        return 'Mettre en attente';
      case 'actif':
        return 'Marquer comme actif';
      default:
        return status;
    }
  };

  const getStatusColor = (status: ConversationStatus) => {
    switch (status) {
      case 'fermé':
        return 'text-red-600 hover:bg-red-50';
      case 'converti':
        return 'text-green-600 hover:bg-green-50';
      case 'attente':
        return 'text-orange-600 hover:bg-orange-50';
      case 'actif':
        return 'text-blue-600 hover:bg-blue-50';
      default:
        return 'text-gray-600 hover:bg-gray-50';
    }
  };

  const statusOptions: ConversationStatus[] = ['actif', 'attente', 'converti', 'fermé'];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Options de conversation"
      >
        <MoreVertical className="w-5 h-5 text-gray-600" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => { setIsOpen(false); setShowLabels(false); }}
          />
          <div className="absolute right-0 top-12 z-20 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
            {/* Statut */}
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Changer le statut
              </p>
            </div>
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                disabled={conversation.status === status}
                className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  conversation.status === status
                    ? 'bg-gray-50 cursor-not-allowed opacity-50'
                    : getStatusColor(status)
                }`}
              >
                {getStatusIcon(status)}
                <span className="flex-1 text-left text-sm font-medium">
                  {getStatusLabel(status)}
                </span>
                {conversation.status === status && (
                  <Check className="w-4 h-4 text-gray-400" />
                )}
              </button>
            ))}

            {/* Bannière rapport GICOP requis */}
            {closeBlocked && (
              <div className="mx-2 mb-1 mt-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
                <ClipboardList className="w-3.5 h-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700 leading-tight">
                  Rapport GICOP incomplet — remplissez le rapport avant de clôturer.
                </p>
              </div>
            )}

            {/* Bannière dossier client requis */}
            {dossierBlocked && (
              <div className="mx-2 mb-1 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 leading-tight">
                  Dossier client incomplet — renseignez le nom, le besoin et le score d&apos;intérêt avant de clôturer.
                </p>
              </div>
            )}

            {/* Actions supplémentaires */}
            <div className="px-3 py-2 border-t border-gray-100 mt-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </p>
            </div>

            {/* Transfert */}
            <button
              onClick={() => { setShowTransfer(true); setIsOpen(false); }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span className="flex-1 text-left text-sm font-medium">Transférer</span>
            </button>

            {/* Fusion */}
            <button
              onClick={() => { setShowMerge(true); setIsOpen(false); }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <Merge className="w-4 h-4" />
              <span className="flex-1 text-left text-sm font-medium">Fusionner</span>
            </button>

            {/* Labels */}
            <div className="relative">
              <button
                onClick={() => setShowLabels((v) => !v)}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-purple-600 hover:bg-purple-50 transition-colors"
              >
                <Tag className="w-4 h-4" />
                <span className="flex-1 text-left text-sm font-medium">Labels</span>
              </button>
              {showLabels && (
                <LabelMenu
                  chatId={conversation.chat_id}
                  onClose={() => setShowLabels(false)}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmation */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-full ${
                  showConfirmation === 'converti' ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                {showConfirmation === 'converti' ? (
                  <Check className="w-6 h-6 text-green-600" />
                ) : (
                  <X className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {showConfirmation === 'converti'
                    ? 'Marquer comme converti ?'
                    : 'Fermer la conversation ?'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {showConfirmation === 'converti'
                    ? 'Cette conversation sera marquée comme convertie. Vous pourrez toujours la consulter dans l\'historique.'
                    : 'Cette conversation sera fermée et archivée. Vous pourrez toujours la consulter dans l\'historique.'}
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-800">
                    <strong>Client:</strong> {conversation.clientName}
                    <br />
                    <strong>Téléphone:</strong> {conversation.clientPhone}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={cancelConfirmation}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={confirmStatusChange}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                      showConfirmation === 'converti'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTransfer && (
        <TransferModal
          chatId={conversation.chat_id}
          currentPosteId={conversation.poste_id}
          onClose={() => setShowTransfer(false)}
        />
      )}

      {showMerge && (
        <MergeModal
          sourceConversation={conversation}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
};