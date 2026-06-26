import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Porte la référence au serveur Socket.IO.
 * Initialisé par WhatsappMessageGateway.afterInit() et partagé avec les publishers.
 */
@Injectable()
export class RealtimeServerService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  getServer(): Server {
    if (!this.server) {
      throw new Error('RealtimeServerService: server not initialized yet');
    }
    return this.server;
  }
}
