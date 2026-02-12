import React, { useState } from 'react';
import { Phone, PhoneCall, PhoneMissed, Clock, Check } from 'lucide-react';
import { CallStatus, Conversation } from '@/types/chat';

interface CallButtonProps {
  conversation: Conversation;
  onCallStatusChange: (conversationId: string, callStatus: CallStatus, notes?: string) => void;
}

export const CallButton: React.FC<CallButtonProps> = ({
  conversation,
  onCallStatusChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CallStatus>('appelé');
  const [callNotes, setCallNotes] = useState('');

  const handleCallClick = () => {
    setShowModal(true);
    setCallNotes(conversation.last_call_notes || '');
  };

  const handleConfirm = () => {
    onCallStatusChange(conversation.id, selectedStatus, callNotes);
    setShowModal(false);
    setCallNotes('');
  };

  const getCallStatusIcon = (status: CallStatus) => {
    switch (status) {
      case 'appelé':
        return <PhoneCall className="w-4 h-4" />;
      case 'à_appeler':
        return <Phone className="w-4 h-4" />;
      case 'rappeler':
        return <Clock className="w-4 h-4" />;
      case 'non_joignable':
        return <PhoneMissed className="w-4 h-4" />;
      default:
        return <Phone className="w-4 h-4" />;
    }
  };

  const getCallButtonColor = () => {
    if (!conversation.call_status || conversation.call_status === 'à_appeler') {
      return 'bg-blue-500 hover:bg-blue-600';
    }
    if (conversation.call_status === 'appelé') {
      return 'bg-green-500 hover:bg-green-600';
    }
    if (conversation.call_status === 'rappeler') {
      return 'bg-orange-500 hover:bg-orange-600';
    }
    return 'bg-gray-500 hover:bg-gray-600';
  };

  const formatLastCallDate = (date: Date | null | undefined) => {
    if (!date) return null;
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <>
      <button
        onClick={handleCallClick}
        className={`p-2 rounded-lg text-white transition-colors ${getCallButtonColor()}`}
        title={
          conversation.last_call_date
            ? `Dernier appel: ${formatLastCallDate(conversation.last_call_date)}`
            : 'Marquer comme appelé'
        }
      >
        <Phone className="w-5 h-5" />
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
               ` Marquer l&apos;appel`
              </h3>
              <p className="text-sm text-gray-600">
                Client: <strong>{conversation.clientName}</strong>
              </p>
              <p className="text-sm text-gray-600">
                Téléphone: <strong>{conversation.clientPhone}</strong>
              </p>
              {conversation.last_call_date && (
                <p className="text-xs text-gray-500 mt-2">
                  Dernier appel: {formatLastCallDate(conversation.last_call_date)}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Statut de l&apos;appel
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedStatus('appelé')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedStatus === 'appelé'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PhoneCall className={`w-5 h-5 ${
                      selectedStatus === 'appelé' ? 'text-green-600' : 'text-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      selectedStatus === 'appelé' ? 'text-green-700' : 'text-gray-700'
                    }`}>
                      Appelé
                    </span>
                  </div>
                  {selectedStatus === 'appelé' && (
                    <Check className="w-4 h-4 text-green-600 ml-auto" />
                  )}
                </button>

                <button
                  onClick={() => setSelectedStatus('rappeler')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedStatus === 'rappeler'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className={`w-5 h-5 ${
                      selectedStatus === 'rappeler' ? 'text-orange-600' : 'text-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      selectedStatus === 'rappeler' ? 'text-orange-700' : 'text-gray-700'
                    }`}>
                      À rappeler
                    </span>
                  </div>
                  {selectedStatus === 'rappeler' && (
                    <Check className="w-4 h-4 text-orange-600 ml-auto" />
                  )}
                </button>

                <button
                  onClick={() => setSelectedStatus('non_joignable')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedStatus === 'non_joignable'
                      ? 'border-gray-500 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PhoneMissed className={`w-5 h-5 ${
                      selectedStatus === 'non_joignable' ? 'text-gray-600' : 'text-gray-400'
                    }`} />
                    <span className={`text-sm font-medium ${
                      selectedStatus === 'non_joignable' ? 'text-gray-700' : 'text-gray-600'
                    }`}>
                      Non joignable
                    </span>
                  </div>
                  {selectedStatus === 'non_joignable' && (
                    <Check className="w-4 h-4 text-gray-600 ml-auto" />
                  )}
                </button>

                <button
                  onClick={() => setSelectedStatus('à_appeler')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedStatus === 'à_appeler'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Phone className={`w-5 h-5 ${
                      selectedStatus === 'à_appeler' ? 'text-blue-600' : 'text-gray-600'
                    }`} />
                    <span className={`text-sm font-medium ${
                      selectedStatus === 'à_appeler' ? 'text-blue-700' : 'text-gray-700'
                    }`}>
                      À appeler
                    </span>
                  </div>
                  {selectedStatus === 'à_appeler' && (
                    <Check className="w-4 h-4 text-blue-600 ml-auto" />
                  )}
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optionnel)
              </label>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Ajouter des notes sur cet appel..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};