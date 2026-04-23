import React, { useState, useEffect } from 'react';
import { MessageCircle, User, Clock, Tag, Bell, Sparkles, X, CheckCircle, Circle, ClipboardList, Layers, FlaskConical } from 'lucide-react';
import {
  Conversation,
  ConversationStatus,
  ConversationResult,
  CONVERSATION_RESULT_LABELS,
  CONVERSATION_RESULT_COLORS,
} from '@/types/chat';
import dynamic from 'next/dynamic';

const ConversationOutcomeModal = dynamic(() => import('./ConversationOutcomeModal'), { ssr: false });
const CreateFollowUpModal = dynamic(() => import('./CreateFollowUpModal'), { ssr: false });
const GicopReportPanel = dynamic(() => import('./GicopReportPanel'), { ssr: false });
const CatalogModal = dynamic(() => import('./CatalogModal'), { ssr: false });
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
    const [showOutcomeModal, setShowOutcomeModal] = useState(false);
    const [showFollowUpModal, setShowFollowUpModal] = useState(false);
    const [localResult, setLocalResult] = useState<ConversationResult | null>(
      currentConv.conversation_result ?? null,
    );
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summary, setSummary] = useState<AiSummaryData | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [showCatalog, setShowCatalog] = useState(false);

    // ── Test GICOP ──────────────────────────────────────────────────────────
    const [showGicopTest, setShowGicopTest] = useState(false);
    const [gicopNumber, setGicopNumber]     = useState('');
    const [gicopPosteId, setGicopPosteId]   = useState('');
    const [gicopType, setGicopType]         = useState('relancer');
    const [gicopSending, setGicopSending]   = useState(false);
    const [gicopResult, setGicopResult]     = useState<{ ok: boolean; message: string } | null>(null);

    const handleOpenGicopTest = () => {
      setGicopNumber(currentConv.clientPhone ?? '');
      setGicopPosteId('');
      setGicopType('relancer');
      setGicopResult(null);
      setShowGicopTest(true);
    };

    const handleSendGicop = async (e: React.FormEvent) => {
      e.preventDefault();
      setGicopSending(true);
      setGicopResult(null);
      try {
        const res = await fetch(`${API_URL}/gicop-platform/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            number:   gicopNumber,
            poste_id: Number(gicopPosteId),
            type:     gicopType,
          }),
        });
        const data = await res.json() as { ok: boolean; message: string };
        setGicopResult({ ok: res.ok, message: data.message ?? (res.ok ? 'Envoyé' : 'Erreur') });
      } catch (err) {
        setGicopResult({ ok: false, message: err instanceof Error ? err.message : 'Erreur réseau' });
      } finally {
        setGicopSending(false);
      }
    };
    // ────────────────────────────────────────────────────────────────────────

    const handleFetchSummary = async () => {
      setShowSummaryModal(true);
      if (summary) return; // cache — don't refetch unless conversation changes
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
                            {localResult && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONVERSATION_RESULT_COLORS[localResult]}`}>
                                    {CONVERSATION_RESULT_LABELS[localResult]}
                                </span>
                            )}
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
                    {/* Bouton résumé IA */}
                    <button
                        onClick={() => void handleFetchSummary()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                        title="Résumé IA de la conversation"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Résumé IA
                    </button>
                    {/* Bouton test GICOP */}
                    <button
                        onClick={handleOpenGicopTest}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                        title="Test envoi GICOP"
                    >
                        <FlaskConical className="w-3.5 h-3.5" />
                        Test GICOP
                    </button>
                    {/* Bouton qualifier */}
                    <button
                        onClick={() => setShowOutcomeModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Qualifier la conversation"
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Qualifier
                    </button>
                    {/* Bouton relance */}
                    <button
                        onClick={() => setShowFollowUpModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Planifier une relance"
                    >
                        <Bell className="w-3.5 h-3.5" />
                        Relance
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

        {showOutcomeModal && (
            <ConversationOutcomeModal
                conversationId={currentConv.id}
                currentResult={localResult}
                onClose={() => setShowOutcomeModal(false)}
                onSaved={(result) => {
                    setLocalResult(result);
                    updateConversation({ ...currentConv, conversation_result: result });
                }}
            />
        )}

        {showFollowUpModal && (
            <CreateFollowUpModal
                contactId={currentConv.contact_summary?.id}
                conversationId={currentConv.id}
                onClose={() => setShowFollowUpModal(false)}
            />
        )}

        {/* S8-003 — Modal catalogue multimédia */}
        {showCatalog && (
            <CatalogModal
                chatId={currentConv.chat_id}
                onSend={(mediaUrl, text) => onCatalogSend?.(mediaUrl, text)}
                onClose={() => setShowCatalog(false)}
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
        {/* Modal test GICOP */}
        {showGicopTest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowGicopTest(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <FlaskConical className="w-4 h-4 text-amber-600" />
                            Test envoi GICOP
                        </h3>
                        <button onClick={() => setShowGicopTest(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <form onSubmit={(e) => void handleSendGicop(e)} className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Numéro (number)</label>
                            <input
                                type="tel"
                                value={gicopNumber}
                                onChange={(e) => setGicopNumber(e.target.value)}
                                placeholder="+225 07 00 00 00 00"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">N° poste GICOP (poste_id)</label>
                            <input
                                type="number"
                                value={gicopPosteId}
                                onChange={(e) => setGicopPosteId(e.target.value)}
                                placeholder="Ex : 12"
                                min={1}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                            <select
                                value={gicopType}
                                onChange={(e) => setGicopType(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                            >
                                <option value="rappeler">rappeler</option>
                                <option value="relancer">relancer</option>
                                <option value="envoyer_devis">envoyer_devis</option>
                                <option value="fermer">fermer</option>
                                <option value="archiver">archiver</option>
                            </select>
                        </div>

                        {gicopResult && (
                            <div className={`text-xs px-3 py-2 rounded-lg ${gicopResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {gicopResult.message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={gicopSending}
                            className="w-full py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
                        >
                            {gicopSending ? 'Envoi…' : 'Envoyer vers gicop.ci'}
                        </button>
                    </form>
                </div>
            </div>
        )}
        </>
    );
}
