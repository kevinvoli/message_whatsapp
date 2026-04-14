/**
 * TICKET-12-E — Tests unitaires : FlowVariableService
 *
 * Couvre la résolution de templates de variables :
 *   1. Variables de contexte : {contact_name}, {contact_phone}, {agent_name}
 *   2. Variables temporelles : {current_time}, {current_date}, {wait_minutes}
 *   3. Variables de session : {session.KEY}
 *   4. Variable inconnue → garde le placeholder d'origine
 *   5. Template sans variable → retourné tel quel
 */

import { FlowVariableService, BotExecutionContext } from '../services/flow-variable.service';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<BotExecutionContext> = {}): BotExecutionContext {
  return {
    provider: 'whapi',
    channelType: 'whatsapp',
    externalRef: '33612345678@s.whatsapp.net',
    contactName: 'Jean Dupont',
    contactRef: '33612345678',
    agentName: 'Agent Pierre',
    agentRef: 'agent-uuid-1',
    ...overrides,
  };
}

function makeSession(overrides: Partial<FlowSession> = {}): FlowSession {
  return {
    id: 'session-uuid-1',
    conversationId: 'conv-uuid-1',
    flowId: 'flow-uuid-1',
    currentNodeId: null,
    status: FlowSessionStatus.ACTIVE,
    variables: {},
    stepsCount: 0,
    triggerType: null,
    startedAt: new Date(),
    lastActivityAt: null,
    completedAt: null,
    escalatedAt: null,
    ...overrides,
  } as FlowSession;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FlowVariableService', () => {
  let service: FlowVariableService;

  beforeEach(() => {
    service = new FlowVariableService();
  });

  describe('resolve — variables de contexte', () => {
    it('résout {contact_name}', () => {
      const result = service.resolve('Bonjour {contact_name} !', makeSession(), makeCtx());
      expect(result).toBe('Bonjour Jean Dupont !');
    });

    it('résout {contact_phone}', () => {
      const result = service.resolve(
        'Votre numéro : {contact_phone}',
        makeSession(),
        makeCtx({ contactRef: '0612345678' }),
      );
      expect(result).toBe('Votre numéro : 0612345678');
    });

    it('résout {agent_name}', () => {
      const result = service.resolve(
        'Votre conseiller : {agent_name}',
        makeSession(),
        makeCtx({ agentName: 'Sophie Martin' }),
      );
      expect(result).toBe('Votre conseiller : Sophie Martin');
    });

    it('utilise une chaîne vide pour {agent_name} si absent', () => {
      const result = service.resolve('{agent_name}', makeSession(), makeCtx({ agentName: undefined }));
      expect(result).toBe('');
    });
  });

  describe('resolve — variables temporelles', () => {
    it('résout {current_time} au format HH:MM', () => {
      const result = service.resolve('{current_time}', makeSession(), makeCtx());
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('résout {current_date} au format JJ/MM/AAAA', () => {
      const result = service.resolve('{current_date}', makeSession(), makeCtx());
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('résout {wait_minutes} à 0 si lastInboundAt absent', () => {
      const result = service.resolve('{wait_minutes}', makeSession(), makeCtx({ lastInboundAt: undefined }));
      expect(result).toBe('0');
    });

    it('résout {wait_minutes} calculé depuis lastInboundAt', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = service.resolve(
        '{wait_minutes}',
        makeSession(),
        makeCtx({ lastInboundAt: fiveMinutesAgo }),
      );
      expect(Number(result)).toBeGreaterThanOrEqual(4);
      expect(Number(result)).toBeLessThanOrEqual(6);
    });
  });

  describe('resolve — variables de session', () => {
    it('résout {session.KEY} depuis session.variables', () => {
      const session = makeSession({ variables: { order_id: 'CMD-0042' } });
      const result = service.resolve('Commande : {session.order_id}', session, makeCtx());
      expect(result).toBe('Commande : CMD-0042');
    });

    it('résout plusieurs variables de session', () => {
      const session = makeSession({ variables: { step: '2', total: '5' } });
      const result = service.resolve(
        'Étape {session.step} sur {session.total}',
        session,
        makeCtx(),
      );
      expect(result).toBe('Étape 2 sur 5');
    });

    it('traite les valeurs non-string en session.variables via String()', () => {
      const session = makeSession({ variables: { count: 42 as unknown as string } });
      const result = service.resolve('{session.count} articles', session, makeCtx());
      expect(result).toBe('42 articles');
    });
  });

  describe('resolve — cas limites', () => {
    it('garde le placeholder pour une variable inconnue', () => {
      const result = service.resolve('{unknown_var}', makeSession(), makeCtx());
      expect(result).toBe('{unknown_var}');
    });

    it('retourne le template inchangé s\'il n\'y a pas de variable', () => {
      const template = 'Bienvenue dans notre service.';
      expect(service.resolve(template, makeSession(), makeCtx())).toBe(template);
    });

    it('gère un template vide', () => {
      expect(service.resolve('', makeSession(), makeCtx())).toBe('');
    });

    it('résout plusieurs variables différentes dans un même template', () => {
      const session = makeSession({ variables: { produit: 'Abonnement Pro' } });
      const result = service.resolve(
        'Bonjour {contact_name}, votre {session.produit} est activé.',
        session,
        makeCtx({ contactName: 'Alice' }),
      );
      expect(result).toBe('Bonjour Alice, votre Abonnement Pro est activé.');
    });
  });
});
