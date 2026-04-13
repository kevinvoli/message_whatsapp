import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { ChannelService } from 'src/channel/channel.service';

type AuthPayload = {
  sub: string;
  email?: string;
  posteId?: string;
  tenantId?: string;
};

export interface SocketAuthResult {
  commercialId: string;
}

@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: WhatsappChatService,
    private readonly channelService: ChannelService,
  ) {}

  /**
   * Vérifie le token JWT du socket et retourne le commercialId,
   * ou null si le token est absent ou invalide.
   */
  async authenticate(client: Socket): Promise<SocketAuthResult | null> {
    const token = this.extractAuthToken(client);
    if (!token) {
      this.logger.warn(`Socket auth refused: missing token (${client.id})`);
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthPayload>(token);
      const commercialId = payload.sub ?? null;
      if (!commercialId) {
        this.logger.warn(`Socket auth refused: no sub in token (${client.id})`);
        return null;
      }
      return { commercialId };
    } catch {
      this.logger.warn(`Socket auth refused: invalid token (${client.id})`);
      return null;
    }
  }

  /**
   * Résout les tenant IDs pour un poste donné.
   * Utilise les conversations existantes du poste, avec fallback sur le premier channel.
   */
  async resolveTenantIds(posteId: string): Promise<string[]> {
    const { chats } = await this.chatService.findByPosteId(posteId, []);
    const tenantIds = [
      ...new Set(
        chats.map((chat) => chat.tenant_id).filter(Boolean) as string[],
      ),
    ];

    if (tenantIds.length === 0) {
      // Nouveau poste sans chats : fallback sur le premier channel disponible
      const channels = await this.channelService.findAll();
      if (channels.length > 0) {
        const channel = channels[0];
        const tenantId = await this.channelService.ensureTenantId(channel);
        this.logger.log(
          `Tenant resolved from channel for new poste ${posteId}: ${tenantId}`,
        );
        return tenantId ? [tenantId] : [];
      }
      this.logger.warn(
        `No tenant resolvable for poste ${posteId}: no chats and no channels`,
      );
      return [];
    }

    return tenantIds;
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  private extractAuthToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken;
    }

    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) return null;

    const authCookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('Authentication='));

    if (!authCookie) return null;
    const token = authCookie.slice('Authentication='.length);
    return token ? decodeURIComponent(token) : null;
  }
}
