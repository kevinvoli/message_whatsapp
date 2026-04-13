import { Logger } from '@nestjs/common';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

/**
 * TICKET-06-A Phase 1 — Mode détection.
 *
 * La machine définit les transitions légales et LOG un warning si une
 * transition interdite est détectée. Elle ne lève PAS d'exception
 * (enforcement strict = Phase 2, après 2 semaines d'observation en prod).
 *
 * Jalon GO/NO-GO à évaluer fin Sprint 5 :
 *   - 0 warning inconnu depuis 2 semaines
 *   - toutes transitions surprises documentées
 *   - tech lead signe la Phase 2
 */

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
    WhatsappChatStatus.FERME,       // fermeture manuelle
  ],
  [WhatsappChatStatus.FERME]: [
    WhatsappChatStatus.EN_ATTENTE,  // réouverture — agent offline
    WhatsappChatStatus.ACTIF,       // réouverture — agent online
  ],
};

const logger = new Logger('ConversationStateMachine');

/**
 * Vérifie si la transition `from → to` est légale.
 * Phase 1 : log un warning si illégale, retourne un booléen mais ne bloque pas.
 *
 * @param chatId  Identifiant de la conversation (pour les logs)
 * @param from    Statut actuel
 * @param to      Statut cible
 * @param context Libellé de l'opération (use case appelant)
 * @returns `true` si légale, `false` si détectée illégale (warning émis)
 */
export function transitionStatus(
  chatId: string,
  from: WhatsappChatStatus,
  to: WhatsappChatStatus,
  context: string,
): boolean {
  if (from === to) return true; // no-op — toujours légal

  const allowed = LEGAL_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return true;

  logger.warn(
    `[StateMachine] Transition ILLÉGALE détectée (Phase 1 — mode détection) : ` +
    `${from} → ${to} sur chat="${chatId}" (context: ${context}). ` +
    `Documenter si légitime ou corriger le flux.`,
  );
  return false;
}

/** Retourne les transitions légales depuis un statut donné (utile pour les tests). */
export function legalTransitionsFrom(status: WhatsappChatStatus): WhatsappChatStatus[] {
  return LEGAL_TRANSITIONS[status] ?? [];
}
