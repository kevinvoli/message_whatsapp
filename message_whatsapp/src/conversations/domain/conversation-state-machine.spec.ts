import {
  transitionStatus,
  legalTransitionsFrom,
  ConversationStateMachineError,
} from './conversation-state-machine';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

describe('ConversationStateMachine — Phase 2 enforcement', () => {
  // ─── Transitions légales ───────────────────────────────────────────────────

  it('EN_ATTENTE → ACTIF est légal', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF, 'test'),
    ).toBe(true);
  });

  it('ACTIF → EN_ATTENTE est légal (reinject SLA)', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE, 'test'),
    ).toBe(true);
  });

  it('ACTIF → FERME est légal (fermeture manuelle)', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.ACTIF, WhatsappChatStatus.FERME, 'test'),
    ).toBe(true);
  });

  it('EN_ATTENTE → FERME est légal (read_only enforcement)', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.FERME, 'test'),
    ).toBe(true);
  });

  it('FERME → EN_ATTENTE est légal (réouverture agent offline)', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.FERME, WhatsappChatStatus.EN_ATTENTE, 'test'),
    ).toBe(true);
  });

  it('FERME → ACTIF est légal (réouverture agent online)', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.FERME, WhatsappChatStatus.ACTIF, 'test'),
    ).toBe(true);
  });

  // ─── Transition identique = no-op ─────────────────────────────────────────

  it('même statut → no-op, retourne true sans lever d\'exception', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.ACTIF, WhatsappChatStatus.ACTIF, 'test'),
    ).toBe(true);
  });

  it('FERME → FERME (no-op) ne lève pas d\'exception', () => {
    expect(
      transitionStatus('chat-1', WhatsappChatStatus.FERME, WhatsappChatStatus.FERME, 'test'),
    ).toBe(true);
  });

  // ─── Transitions illégales — Phase 2 : lève ConversationStateMachineError ─

  it('statut source inconnu → lève ConversationStateMachineError', () => {
    expect(() =>
      transitionStatus(
        'chat-1',
        'INCONNU' as any,
        WhatsappChatStatus.ACTIF,
        'test-illégal',
      ),
    ).toThrow(ConversationStateMachineError);
  });

  it('l\'erreur contient chatId, from, to et context', () => {
    let caught: ConversationStateMachineError | null = null;
    try {
      transitionStatus('chat-42', 'INCONNU' as any, WhatsappChatStatus.FERME, 'ctx-test');
    } catch (e) {
      caught = e as ConversationStateMachineError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.chatId).toBe('chat-42');
    expect(caught!.from).toBe('INCONNU');
    expect(caught!.to).toBe(WhatsappChatStatus.FERME);
    expect(caught!.context).toBe('ctx-test');
    expect(caught!.message).toContain('INCONNU');
    expect(caught!.message).toContain(WhatsappChatStatus.FERME);
  });

  it('le nom de l\'erreur est ConversationStateMachineError', () => {
    expect(() =>
      transitionStatus('chat-1', 'INVALID' as any, WhatsappChatStatus.ACTIF, 'ctx'),
    ).toThrow(expect.objectContaining({ name: 'ConversationStateMachineError' }));
  });

  // ─── legalTransitionsFrom ─────────────────────────────────────────────────

  describe('legalTransitionsFrom', () => {
    it('EN_ATTENTE peut aller vers ACTIF, EN_ATTENTE, FERME', () => {
      const transitions = legalTransitionsFrom(WhatsappChatStatus.EN_ATTENTE);
      expect(transitions).toContain(WhatsappChatStatus.ACTIF);
      expect(transitions).toContain(WhatsappChatStatus.EN_ATTENTE);
      expect(transitions).toContain(WhatsappChatStatus.FERME);
    });

    it('FERME ne peut pas aller vers FERME', () => {
      const transitions = legalTransitionsFrom(WhatsappChatStatus.FERME);
      expect(transitions).not.toContain(WhatsappChatStatus.FERME);
    });

    it('ACTIF peut aller vers les 3 statuts', () => {
      const transitions = legalTransitionsFrom(WhatsappChatStatus.ACTIF);
      expect(transitions).toContain(WhatsappChatStatus.EN_ATTENTE);
      expect(transitions).toContain(WhatsappChatStatus.ACTIF);
      expect(transitions).toContain(WhatsappChatStatus.FERME);
    });
  });
});
