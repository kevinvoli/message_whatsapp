import { Injectable } from '@nestjs/common';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { AssignmentDecision } from '../../types/assignment-decision.type';

interface DecisionContext {
  conversation: WhatsappChat | null;
  isCurrentAgentConnected: boolean;
  nextAvailableAgent: WhatsappCommercial | null;
}

@Injectable()
export class AssignmentService {
  /**
   * Analyzes the context of a conversation and returns a clear decision
   * on how to assign it. This method is pure and does not perform any side effects.
   *
   * @param context The current state of the conversation and agent availability.
   * @returns An `AssignmentDecision` object.
   */
  public decide(context: DecisionContext): AssignmentDecision {
    const { conversation, isCurrentAgentConnected, nextAvailableAgent } = context;

    // Règle 1: Si la conversation existe et que son commercial est connecté, on le garde.
    if (conversation && isCurrentAgentConnected && conversation.commercial_id) {
      return {
        type: 'KEEP_CURRENT_AGENT',
        agentId: conversation.commercial_id,
      };
    }

    // Règle 2: Si un commercial est disponible (soit pour une nouvelle conversation, soit pour une réassignation).
    if (nextAvailableAgent) {
      return {
        type: 'ASSIGN_NEW_AGENT',
        agentId: nextAvailableAgent.id,
      };
    }

    // Règle 3: Si aucune des conditions ci-dessus n'est remplie, le message est mis en attente.
    return {
      type: 'PENDING',
    };
  }
}
