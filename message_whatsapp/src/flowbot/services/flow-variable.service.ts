import { Injectable } from '@nestjs/common';
import { FlowSession } from '../entities/flow-session.entity';

export interface BotExecutionContext {
  provider: string;
  channelType: string;
  externalRef: string;
  providerChannelRef?: string;
  contactName: string;
  contactRef: string;
  agentName?: string;
  agentRef?: string;
  lastInboundAt?: Date;
}

@Injectable()
export class FlowVariableService {
  /**
   * Résout les variables dans un template de texte.
   * Exemples : "Bonjour {contact_name} !" → "Bonjour Jean !"
   */
  resolve(template: string, session: FlowSession, ctx: BotExecutionContext): string {
    const vars: Record<string, string> = {
      contact_name: ctx.contactName,
      contact_phone: ctx.contactRef,
      agent_name: ctx.agentName ?? '',
      current_time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      current_date: new Date().toLocaleDateString('fr-FR'),
      wait_minutes: ctx.lastInboundAt
        ? String(Math.floor((Date.now() - ctx.lastInboundAt.getTime()) / 60_000))
        : '0',
    };

    // Variables de session (préfixe session.)
    if (session.variables && typeof session.variables === 'object') {
      for (const [key, val] of Object.entries(session.variables)) {
        vars[`session.${key}`] = String(val ?? '');
      }
    }

    return template.replace(/\{([^}]+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
  }
}
