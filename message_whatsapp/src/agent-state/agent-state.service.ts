import { Injectable } from '@nestjs/common';

/**
 * Source de vérité partagée sur les agents WebSocket connectés.
 *
 * Injecté par :
 *   - WhatsappMessageGateway : enregistre/supprime à la connexion/déconnexion
 *   - DispatcherService : interroge isConnected() pour décider du routage
 *
 * Casse la dépendance circulaire entre WhatsappMessageModule ↔ DispatcherModule.
 */
@Injectable()
export class AgentStateService {
  /** socketId → posteId */
  private readonly sockets = new Map<string, string>();

  register(socketId: string, posteId: string): void {
    this.sockets.set(socketId, posteId);
  }

  unregister(socketId: string): void {
    this.sockets.delete(socketId);
  }

  isConnected(posteId: string): boolean {
    return Array.from(this.sockets.values()).some((p) => p === posteId);
  }
}
