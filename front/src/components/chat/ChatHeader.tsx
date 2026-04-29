import React, { useState, useEffect } from 'react';
import { MessageCircle, User, Clock, Sparkles, X, CheckCircle, Circle, ClipboardList, Layers, Bell } from 'lucide-react';
import {
  Conversation,
  ConversationStatus,
} from '@/types/chat';
import dynamic from 'next/dynamic';

const GicopReportPanel = dynamic(() => import('./GicopReportPanel'), { ssr: false });
const CatalogModal = dynamic(() => import('./CatalogModal'), { ssr: false });
const CreateFollowUpModal = dynamic(() => import('./CreateFollowUpModal'), { ssr: false });
import { getStatusBadge } from '@/lib/utils';
import { ConversationOptionsMenu } from '../conversation/conversationOptionMenu';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { ProviderBadge, getProviderFromChatId } from '../ui/ProviderBadge';

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  whatsapp:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  messenger: { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  instagram: { bg: 'bg-purple-100', text: 'text-purple-600' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-600'    },
};

interface ChatHeaderProps {
    currentConv: Conversation;
    totalMessages: number;
    onOpenContact?: () => void;
    onCatalogSend?: (mediaUrl: string, text: string) => void;
    showReportPanel?: boolean;
    onToggleReport?: () => void;
}

function SlaCountdown({ deadline }: { deadline: Date }) {
    const [remaining, setRemaining] = useState(() => deadline.getTime() - Date.now());

    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(deadline.getTime() - Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, [deadline]);

    if (remaining <= 0) {
        return (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                <Clock className="w-3 h-3" />
                SLA depasse
            </span>
        );
    }

    const totalSec = Math.floor(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const label = min > 0 ? `${min}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;

    let colorClass = 'bg-green-100 text-green-700';
    if (min < 1) colorClass = 'bg-red-100 text-red-700';
    else if (min < 5) colorClass = 'bg-orange-100 text-orange-700';

    return (
        <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${colorClass}`}>
            <Clock className="w-3 h-3" />
            {label}
        </span>
    );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface AiSummaryData {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  keyPoints: string[];
  suggestedActions: string[];
}

const SENTIMENT_MAP: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positif', color: 'text-emerald-700 bg-emerald-50' },
  neutral:  { label: 'Neutre',  color: 'text-gray-600 bg-gray-100' },
  negative: { label: 'Négatif', color: 'text-red-700 bg-red-50' },
  mixed:    { label: 'Mixte',   color: 'text-orange-700 bg-orange-50' },
};

export default function ChatHeader({ currentConv, totalMessages, onOpenContact, onCatalogSend, showReportPanel, onToggleReport }: ChatHeaderProps) {
    const { updateConversation, changeConversationStatus } = useChatStore();
    const { selectContactByChatId } = useContactStore();
    const provider = getProviderFromChatId(currentConv.chat_id);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summary, setSummary] = useState<AiSummaryData | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [showCatalog, setShowCatalog] = useState(false);
    const [showFollowUp, setShowFollowUp] = useState(false);

    const handleFetchSummary = async () => {
      setShowSummaryModal(true);
      if (summary) return;
      setLoadingSummary(true);
      try {
        const res = await fetch(`${API_URL}/ai/summary/${currentConv.chat_id}`, { credentials: 'include' });
        if (res.ok) setSummary(await res.json() as AiSummaryData);
      } catch { /* silencieux */ } finally {
        setLoadingSummary(false);
      }
    };

    function handleOpenContact() {
        selectContactByChatId(currentConv.chat_id);
        onOpenContact?.();
    }
    const avatarColor = AVATAR_COLORS[provider] ?? AVATAR_COLORS.whatsapp;

    const handleConversationStatusChange = (
      _conversationId: string,
      newStatus: ConversationStatus,
    ) => {
      changeConversationStatus(currentConv.chat_id, newStatus);
      updateConversation({
        ...currentConv,
        status: newStatus,
      });
    };

    return (
        <>
        <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${avatarColor.bg} rounded-full flex items-center justify-center`}>
                        <User className={`w-6 h-6 ${avatarColor.text}`} />
                    </div>
                    <div>
                        <button onClick={handleOpenContact} className="font-semibold text-gray-900 hover:text-blue-600 hover:underline text-left transition-colors">
                            {currentConv?.clientName}
                        </button>
                        <div className="flex items-center flex-wrap gap-2">
                            <p className="text-sm text-gray-500">{currentConv?.clientPhone}</p>
                            <span className="text-xs text-gray-400">•</span>
                            <ProviderBadge chatId={currentConv.chat_id} showLabel={true} />
                            <span className="text-xs text-gray-400">•</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(currentConv?.status || 'nouveau')}`}>
                                {currentConv?.status.replace('_', ' ')}
                            </span>
                            {currentConv?.readonly && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                    Lecture seule
                                </span>
                            )}
                            {currentConv?.first_response_deadline_at && (
                                <SlaCountdown deadline={new Date(currentConv.first_response_deadline_at)} />
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* S4-003 — Bouton rapport GICOP */}
                    <button
                        onClick={() => onToggleReport?.()}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            showReportPanel
                                ? 'bg-blue-600 text-white'
                                : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                        }`}
                        title="Rapport GICOP"
                    >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Rapport
                    </button>
                    {/* S8-003 — Bouton catalogue multimédia */}
                    <button
                        onClick={() => setShowCatalog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                        title="Catalogue multimédia"
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Catalogue
                    </button>
                    {/* Bouton relance */}
                    <button
                        onClick={() => setShowFollowUp(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                        title="Créer une relance"
                    >
                        <Bell className="w-3.5 h-3.5" />
                        Relance
                    </button>
                    {/* Bouton résumé IA */}
                    <button
                        onClick={() => void handleFetchSummary()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                        title="Résumé IA de la conversation"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Résumé IA
                    </button>
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
                        <MessageCircle className="w-4 h-4" />
                        <span className="font-medium">{totalMessages} messages</span>
                    </div>
                    <ConversationOptionsMenu conversation={currentConv} onStatusChange={handleConversationStatusChange} />
                </div>
            </div>

        {/* Barre de critères de validation (fenêtre glissante) */}
        {currentConv.validation_state && currentConv.validation_state.length > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100 mt-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Validation :</span>
            {currentConv.validation_state.map((c) => (
              <span
                key={c.type}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.validated
                    ? 'bg-green-100 text-green-700'
                    : c.required
                      ? 'bg-red-50 text-red-600'
                      : 'bg-gray-100 text-gray-500'
                }`}
                title={c.validated ? `Validé le ${c.validatedAt ? new Date(c.validatedAt).toLocaleString('fr-FR') : ''}` : 'Non validé'}
              >
                {c.validated
                  ? <CheckCircle className="w-3 h-3" />
                  : <Circle className="w-3 h-3" />
                }
                {c.label}
                {c.required && !c.validated && <span className="text-red-400 ml-0.5">*</span>}
              </span>
            ))}
          </div>
        )}
        </div>

        {/* S8-003 — Modal catalogue multimédia */}
        {showCatalog && (
            <CatalogModal
                chatId={currentConv.chat_id}
                onSend={(mediaUrl, text) => onCatalogSend?.(mediaUrl, text)}
                onClose={() => setShowCatalog(false)}
            />
        )}

        {/* Modal nouvelle relance */}
        {showFollowUp && (
            <CreateFollowUpModal
                conversationId={currentConv.id}
                onClose={() => setShowFollowUp(false)}
                onDone={() => setShowFollowUp(false)}
            />
        )}

        {/* Modal résumé IA */}
        {showSummaryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSummaryModal(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            Résumé IA
                        </h3>
                        <button onClick={() => setShowSummaryModal(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    {loadingSummary ? (
                        <div className="flex flex-col items-center py-6 gap-3">
                            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-gray-500">Analyse de la conversation…</p>
                        </div>
                    ) : summary ? (
                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sentiment</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SENTIMENT_MAP[summary.sentiment]?.color ?? 'bg-gray-100 text-gray-700'}`}>
                                        {SENTIMENT_MAP[summary.sentiment]?.label ?? summary.sentiment}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
                            </div>
                            {summary.keyPoints.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Points clés</p>
                                    <ul className="flex flex-col gap-1">
                                        {summary.keyPoints.map((pt, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                                <span className="text-purple-400 mt-0.5">•</span>
                                                {pt}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {summary.suggestedActions.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Actions suggérées</p>
                                    <ul className="flex flex-col gap-1">
                                        {summary.suggestedActions.map((a, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                                <span className="text-emerald-500 mt-0.5">→</span>
                                                {a}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 text-center py-4">Impossible de générer le résumé.</p>
                    )}
                </div>
            </div>
        )}
        </>
    );
}
