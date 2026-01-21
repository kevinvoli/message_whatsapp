import { Injectable } from '@nestjs/common';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { QueuePosition } from '../entities/queue-position.entity';

@Injectable()
export class AssignmentService {
  /**
   * 🎯 Trouve le prochain commercial dans une file d'attente (round-robin).
   * @param queue - La file d'attente des commerciaux (doit être triée par position).
   * @returns Le prochain commercial à qui assigner la conversation.
   */
  findNextOnlineAgent(queue: QueuePosition[]): WhatsappCommercial | null {
    if (!queue || queue.length === 0) {
      return null;
    }
    // Le prochain est simplement le premier de la liste triée.
    return queue[0].user;
  }

  /**
   * 🎯 Trouve le commercial OFFLINE le plus approprié.
   *    - Priorité 1 : Ceux qui n'ont AUCUNE conversation.
   *    - Priorité 2 : Ceux qui ont le moins de conversations actives.
   * @param offlineAgents - Liste des commerciaux hors ligne avec leurs conversations.
   * @returns Le commercial OFFLINE à qui assigner la conversation.
   */
  findNextOfflineAgent(
    offlineAgents: WhatsappCommercial[],
  ): WhatsappCommercial | null {
    if (!offlineAgents || offlineAgents.length === 0) {
      return null;
    }

    // Trier les agents pour trouver le "meilleur" candidat
    const sortedAgents = [...offlineAgents].sort((a, b) => {
      const aTotalChats = a.chats?.length ?? 0;
      const bTotalChats = b.chats?.length ?? 0;

      if (aTotalChats < bTotalChats) {
        return -1;
      }
      if (aTotalChats > bTotalChats) {
        return 1;
      }

      // En cas d'égalité, on pourrait ajouter un critère (ex: date de dernière assignation)
      // Pour l'instant, on garde l'ordre existant.
      return 0;
    });

    return sortedAgents[0];
  }
}
