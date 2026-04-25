import React from 'react';
import { User, Image, Video, Mic, FileText, MapPin, Sparkles, Layers, Clock, Lock, CheckCircle, Star, Phone, AlertCircle, Send } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { TypingIndicator } from '../ui/typingIndicator';
import { ProviderBadge, getProviderFromChatId } from '../ui/ProviderBadge';
import { getStatusBadge } from '@/lib/utils';
import { formatConversationTime } from '@/lib/dateUtils';
import { useChatStore } from '@/store/chatStore';

type PlaceholderMeta = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const renderLastMessagePreview = (conversation: Conversation) => {
  const text = conversation.lastMessage?.text?.trim();
  if (!text) {
    return (
      <p className="text-sm text-gray-500 truncate">
        Aucun message pour le moment
      </p>
    );
  }

  const placeholder = getMediaPlaceholder(text);
  if (placeholder) {
    const Icon = placeholder.icon;
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <Icon className="w-3 h-3 text-gray-400" />
        <span className="font-medium text-gray-800">{placeholder.label}</span>
      </div>
    );
  }

  return (
    <p className="text-sm text-gray-500 truncate">
      {text}
    </p>
  );
};

const getMediaPlaceholder = (text: string): PlaceholderMeta | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }
  const content = trimmed.slice(1, -1).replace(/_/g, ' ').replace(/client/gi, '').trim();
  const normalized = content.toLowerCase();

  if (normalized.includes('photo')) {
    return { label: 'Photo', icon: Image };
  }
  if (/video|gif|short/.test(normalized)) {
    return { label: 'Vidéo', icon: Video };
  }
  if (normalized.includes('vocal') || normalized.includes('audio')) {
    return { label: 'Message vocal', icon: Mic };
  }
  if (normalized.includes('document')) {
    return { label: 'Document', icon: FileText };
  }
  if (normalized.includes('localisation') || normalized.includes('location')) {
    return { label: 'Localisation', icon: MapPin };
  }
  if (/interactive|bouton|button|liste|list|réponse|reponse/.test(normalized)) {
    return { label: 'Message interactif', icon: Sparkles };
  }

  if (content.length === 0) {
    return { label: 'Média', icon: Layers };
  }

  return { label: capitalize(content), icon: Layers };
};

const capitalize = (value: string) => {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  isTyping?: boolean;
  onClick: () => void;
  bulkMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (chatId: string) => void;
}

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  whatsapp:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  messenger: { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  instagram: { bg: 'bg-purple-100', text: 'text-purple-600' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-600'    },
};

const SLA_WARNING_MS = 30 * 60 * 1000; // 30 minutes

function hasSlaWarning(conv: Conversation): boolean {
  if (conv.status !== 'actif') return false;
  const clientAt = conv.last_client_message_at ? new Date(conv.last_client_message_at).getTime() : 0;
  if (!clientAt) return false;
  const posteAt = conv.last_poste_message_at ? new Date(conv.last_poste_message_at).getTime() : 0;
  if (posteAt >= clientAt) return false;
  return Date.now() - clientAt > SLA_WARNING_MS;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation, isSelected, isTyping, onClick,
  bulkMode = false, isChecked = false, onToggleCheck,
}) => {

  const provider = getProviderFromChatId(conversation.chat_id);
  const avatarColor = AVATAR_COLORS[provider] ?? AVATAR_COLORS.whatsapp;
  const slaAlert = hasSlaWarning(conversation);
  const windowStatus = conversation.window_status;
  const isLocked = windowStatus === 'locked' || (windowStatus == null && conversation.is_locked === true);
  const isValidated = windowStatus === 'validated';

  // S1-006 — badge affinité (contact propriétaire)
  const affinityChats    = useChatStore((s) => s.affinityChats);
  const obligationStatus = useChatStore((s) => s.obligationStatus);
  const blockProgress    = useChatStore((s) => s.blockProgress);
  const isAffinity = affinityChats?.has(conversation.chat_id) ?? false;

  // Poste permanent hors-ligne : conversation en attente de reconnexion de l'agent
  const isWaitingOnAgent = conversation.status === 'attente' && !isLocked;

  const handleClick = (e: React.MouseEvent) => {
    if (isLocked) return;
    if (bulkMode && onToggleCheck) {
      e.preventDefault();
      onToggleCheck(conversation.chat_id);
    } else {
      onClick();
    }
  };

  // ── Calculs pour l'info-bulle des conversations verrouillées ────────────
  const remainingCalls = isLocked && obligationStatus && !obligationStatus.readyForRotation
    ? (['annulee', 'livree', 'sansCommande'] as const)
        .reduce((sum, k) => sum + Math.max(0, obligationStatus[k].required - obligationStatus[k].done), 0)
    : 0;
  const remainingConvs = isLocked
    ? Math.max(0, blockProgress.total - blockProgress.validated)
    : 0;

  return (
    <div
      onClick={handleClick}
      className={`group/item relative p-4 border-b border-gray-100 transition-colors ${
        isLocked
          ? 'opacity-50 cursor-not-allowed bg-gray-50'
          : isValidated
          ? 'bg-green-50/60 border-l-4 border-l-green-400 cursor-pointer'
          : isChecked
          ? 'bg-blue-50 border-l-4 border-l-blue-500 cursor-pointer'
          : isSelected
          ? 'bg-green-50 border-l-4 border-l-green-600 cursor-pointer'
          : 'hover:bg-gray-50 cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-3">
        {bulkMode ? (
          <div className="flex items-center justify-center w-12 h-12 flex-shrink-0">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleCheck?.(conversation.chat_id)}
              onClick={(e) => e.stopPropagation()}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        ) : (
        <div className={`w-12 h-12 ${avatarColor.bg} rounded-full flex items-center justify-center flex-shrink-0 relative`}>
          <User className={`w-6 h-6 ${avatarColor.text}`} />
          {conversation.priority === 'haute' && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
          )}
        </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-800 truncate">{
            conversation.clientName }</h3>
            <span className="text-xs text-gray-500">
              {isLocked? "": conversation.lastMessage ? formatConversationTime(conversation.lastMessage.timestamp) : "NA"}
            </span>
          </div>
          <p className="text-sm text-gray-600 truncate">{
          isLocked ? "" : conversation.clientPhone}</p>
          <div className="mt-1">
            {isTyping ? (
              <TypingIndicator />
            ) : (
              renderLastMessagePreview(conversation)
            )}
          </div>


          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(conversation.status)}`}>
              {conversation.status.replace('_', ' ')}
            </span>
            {isLocked && (
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">
                <Lock className="w-3 h-3" /> Verrouillée
              </span>
            )}
            {isWaitingOnAgent && (
              <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full" title="Agent hors-ligne — message reçu dès la reconnexion">
                <Clock className="w-3 h-3" /> Agent hors-ligne
              </span>
            )}
            {isValidated && (
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                <CheckCircle className="w-3 h-3" /> Validée
              </span>
            )}
            {/* S2-003 — numéro de slot x/10 */}
            {conversation.window_slot != null && !isLocked && (
              <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full font-medium">
                #{conversation.window_slot}
              </span>
            )}
            {/* S1-006 — badge propriétaire (affinité active) */}
            {isAffinity && !isLocked && (
              <span
                className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium"
                title="Contact fidèle — réaffecté à votre poste"
              >
                <Star className="w-3 h-3" /> Fidèle
              </span>
            )}
            {slaAlert && !isLocked && (
              <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full" title="Client en attente depuis plus de 30 min">
                <Clock className="w-3 h-3" /> SLA
              </span>
            )}
            {conversation.report_submission_status === 'sent' && !isLocked && (
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full" title="Rapport soumis et synchronisé sur la plateforme GICOP">
                <Send className="w-3 h-3" /> Rapport GICOP
              </span>
            )}
            {conversation.report_submission_status === 'pending' && !isLocked && (
              <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full" title="Rapport soumis — synchronisation en cours">
                <Send className="w-3 h-3" /> Rapport soumis
              </span>
            )}
            {conversation.report_submission_status === 'failed' && !isLocked && (
              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full" title="Échec de soumission du rapport — relancer depuis l'onglet Dossier">
                <AlertCircle className="w-3 h-3" /> Rapport KO
              </span>
            )}
            <ProviderBadge chatId={conversation.chat_id} showLabel={true} />
            {conversation?.tags?.map((tag, idx) => (
              <span key={idx} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>

        </div>
        {conversation.unreadCount > 0 && (
          <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
             <span className="text-xs text-white font-bold">{conversation.unreadCount}</span>
          </div>
        )}
      </div>

      {/* Info-bulle CSS pur — visible uniquement au survol d'une conversation verrouillée */}
      {isLocked && (remainingCalls > 0 || remainingConvs > 0) && (
        <div className="absolute left-2 right-2 bottom-full mb-1 z-50 pointer-events-none
                        opacity-0 group-hover/item:opacity-100 transition-opacity duration-150">
          <div className="bg-red-700 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl space-y-1.5">
            <p className="font-semibold text-green-400 flex items-center gap-1.5 mb-1">
              <Lock className="w-3 h-3 text-green-400" />
              Conversation verrouillée
            </p>

            {remainingCalls > 0 && (
              <div className="flex items-start gap-1.5">
                <Phone className="w-3 h-3 text-orange-400 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="font-bold text-orange-500">{remainingCalls}</span>
                  {' '}appel{remainingCalls > 1 ? 's' : ''} à effectuer
                  {obligationStatus && (
                    <span className="text-blue-500 ml-1">
                      ({[
                        obligationStatus.annulee.required - obligationStatus.annulee.done > 0
                          && `${obligationStatus.annulee.required - obligationStatus.annulee.done} annulées`,
                        obligationStatus.livree.required - obligationStatus.livree.done > 0
                          && `${obligationStatus.livree.required - obligationStatus.livree.done} livrées`,
                        obligationStatus.sansCommande.required - obligationStatus.sansCommande.done > 0
                          && `${obligationStatus.sansCommande.required - obligationStatus.sansCommande.done} sans cmd`,
                      ].filter(Boolean).join(', ')})
                    </span>
                  )}
                </span>
              </div>
            )}

            {remainingConvs > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-blue-400 flex-shrink-0" />
                <span>
                  <span className="font-bold text-blue-300">{remainingConvs}</span>
                  {' '}conversation{remainingConvs > 1 ? 's' : ''} à finaliser
                  {' '}({blockProgress.validated}/{blockProgress.total} validées)
                </span>
              </div>
            )}

            {obligationStatus && !obligationStatus.qualityCheckPassed && (
              <div className="flex items-center gap-1.5 text-yellow-300">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>Répondre au dernier message de chaque conversation</span>
              </div>
            )}

            <div className="absolute left-4 bottom-0 translate-y-full w-0 h-0
                            border-x-4 border-x-transparent border-t-4 border-t-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationItem;
