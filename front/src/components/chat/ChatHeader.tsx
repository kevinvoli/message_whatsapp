import React, { useState, useEffect } from 'react';
import { MessageCircle, Clock, Sparkles, CheckCircle, Circle, ClipboardList, Layers, Bell, Tag } from 'lucide-react';
import { ContactAvatar } from '../ui/ContactAvatar';
import {
  Conversation,
  ConversationStatus,
  CallStatus,
} from '@/types/chat';
import dynamic from 'next/dynamic';
import { CallButton } from '../conversation/CallButton';

const GicopReportPanel = dynamic(() => import('./GicopReportPanel'), { ssr: false });
const CatalogModal = dynamic(() => import('./CatalogModal'), { ssr: false });
const CreateFollowUpModal = dynamic(() => import('./CreateFollowUpModal'), { ssr: false });
const AiSummaryModal = dynamic(() => import('./AiSummaryModal'), { ssr: false });
const AiQualifyModal = dynamic(() => import('./AiQualifyModal'), { ssr: false });
import { getStatusBadge } from '@/lib/utils';
import { ConversationOptionsMenu } from '../conversation/conversationOptionMenu';
import { useChatStore } from '@/store/chatStore';
import { useContactStore } from '@/store/contactStore';
import { ProviderBadge, getProviderFromChatId } from '../ui/ProviderBadge';
import { getAiSummary, qualifyConversation, AiSummaryResult, AiQualifyResult } from '@/lib/aiApi';

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

export default function ChatHeader({ currentConv, totalMessages, onOpenContact, onCatalogSend, showReportPanel, onToggleReport }: ChatHeaderProps) {
    const { updateConversation, changeConversationStatus } = useChatStore();
    const { selectContactByChatId } = useContactStore();
    const provider = getProviderFromChatId(currentConv.chat_id);

    const [showCatalog, setShowCatalog] = useState(false);
    const [showFollowUp, setShowFollowUp] = useState(false);

    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summaryResult, setSummaryResult] = useState<AiSummaryResult | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);

    const [showQualifyModal, setShowQualifyModal] = useState(false);
    const [qualifyResult, setQualifyResult] = useState<AiQualifyResult | null>(null);
    const [loadingQualify, setLoadingQualify] = useState(false);

    const handleFetchSummary = async () => {
        setShowSummaryModal(true);
        if (summaryResult) return;
        setLoadingSummary(true);
        try {
            const data = await getAiSummary(currentConv.chat_id);
            setSummaryResult(data);
        } catch {
            setSummaryResult(null);
        } finally {
            setLoadingSummary(false);
        }
    };

    const handleQualify = async () => {
        setShowQualifyModal(true);
        setQualifyResult(null);
        setLoadingQualify(true);
        try {
            const data = await qualifyConversation(currentConv.chat_id);
            setQualifyResult(data);
        } catch {
            setQualifyResult(null);
        } finally {
            setLoadingQualify(false);
        }
    };

    function handleOpenContact() {
        selectContactByChatId(currentConv.chat_id);
        onOpenContact?.();
    }

    const handleCallStatusChange = (
      _conversationId: string,
      callStatus: CallStatus,
      notes?: string,
    ) => {
      updateConversation({
        ...currentConv,
        call_status: callStatus,
        last_call_notes: notes,
        last_call_date: new Date(),
      });
    };

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
                    <ContactAvatar
                        src={currentConv.chat_pic}
                        name={currentConv.clientName}
                        provider={getProviderFromChatId(currentConv.chat_id)}
                        size="md"
                    />
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
                    {/* A2 — Bouton résumé IA */}
                    <button
                        onClick={() => void handleFetchSummary()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                        title="Résumé IA de la conversation"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Résumé IA
                    </button>
                    {/* A4 — Bouton qualification IA */}
                    <button
                        onClick={() => void handleQualify()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        title="Qualifier la conversation par IA"
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Qualifier
                    </button>
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
                        <MessageCircle className="w-4 h-4" />
                        <span className="font-medium">{totalMessages} messages</span>
                    </div>
                    <CallButton
                        conversation={currentConv}
                        onCallStatusChange={handleCallStatusChange}
                    />
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

        {/* A2 — Modal résumé IA */}
        {showSummaryModal && (
            <AiSummaryModal
                loading={loadingSummary}
                result={summaryResult}
                onClose={() => setShowSummaryModal(false)}
            />
        )}

        {/* A4 — Modal qualification IA */}
        {showQualifyModal && (
            <AiQualifyModal
                loading={loadingQualify}
                result={qualifyResult}
                onClose={() => setShowQualifyModal(false)}
            />
        )}
        </>
    );
}
