import { Logger } from '@nestjs/common';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

/**
 * TICKET-06-A Phase 2 — Mode enforcement (activé après GO/NO-GO Sprint 5).
 *
 * La machine définit les transitions légales et LÈVE une exception si une
 * transition interdite est tentée. Aucun warning silencieux — toute transition
 * illégale interrompt l'opération immédiatement.
 *
 * Phase 1 (détection) : 0 warning inconnu observé en 2 semaines → GO validé.
 * Les 2 bypasses identifiés (Gateway admin + ReadOnlyEnforcementJob) sont
 * désormais instrumentés et passent explicitement par transitionStatus().
 */

/** Levée sur toute tentative de transition non autorisée par la machine d'état. */
export class ConversationStateMachineError extends Error {
  constructor(
    public readonly chatId: string,
    public readonly from: string,
    public readonly to: WhatsappChatStatus,
    public readonly context: string,
  ) {
    super(
      `[StateMachine] Transition illégale : ${from} → ${to} ` +
      `sur chat="${chatId}" (context: ${context})`,
    );
    this.name = 'ConversationStateMachineError';
  }
}

type TransitionMap = Record<WhatsappChatStatus, WhatsappChatStatus[]>;

const LEGAL_TRANSITIONS: TransitionMap = {
  [WhatsappChatStatus.EN_ATTENTE]: [
    WhatsappChatStatus.ACTIF,       // agent connecté assigné
    WhatsappChatStatus.EN_ATTENTE,  // agent offline — reste en attente
    WhatsappChatStatus.FERME,       // fermeture manuelle / read_only enforcement
  ],
  [WhatsappChatStatus.ACTIF]: [
    WhatsappChatStatus.EN_ATTENTE,  // agent déconnecté / SLA reinject
    WhatsappChatStatus.ACTIF,       // mise à jour activité (incrément unread)
    WhatsappChatStatus.FERME,       // fermeture manuelle / read_only enforcement
  ],
  [WhatsappChatStatus.FERME]: [
    WhatsappChatStatus.EN_ATTENTE,  // réouverture — agent offline
    WhatsappChatStatus.ACTIF,       // réouverture — agent online
  ],
};

const logger = new Logger('ConversationStateMachine');

/**
 * Vérifie si la transition `from → to` est légale.
 * Phase 2 : lève `ConversationStateMachineError` si la transition est illégale.
 *
 * @param chatId  Identifiant de la conversation (pour les logs)
 * @param from    Statut actuel
 * @param to      Statut cible
 * @param context Libellé de l'opération (use case appelant)
 * @returns `true` si la transition est légale
 * @throws ConversationStateMachineError si la transition est illégale
 */
export function transitionStatus(
  chatId: string,
  from: WhatsappChatStatus,
  to: WhatsappChatStatus,
  context: string,
): true {
  if (from === to) return true; // no-op — toujours légal

  const allowed = LEGAL_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) {
    logger.debug(
      `[StateMachine] ${from} → ${to} sur chat="${chatId}" (context: ${context})`,
    );
    return true;
  }

  throw new ConversationStateMachineError(chatId, from, to, context);
}

/** Retourne les transitions légales depuis un statut donné (utile pour les tests). */
export function legalTransitionsFrom(status: WhatsappChatStatus): WhatsappChatStatus[] {
  return LEGAL_TRANSITIONS[status] ?? [];
}
