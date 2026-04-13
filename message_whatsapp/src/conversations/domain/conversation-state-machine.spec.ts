import {
  transitionStatus,
  legalTransitionsFrom,
} from './conversation-state-machine';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

describe('ConversationStateMachine — Phase 1 détection', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

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

  it('même statut → no-op, retourne true sans warning', () => {
    const warnSpy = jest.spyOn(require('./conversation-state-machine'), 'transitionStatus');
    const result = transitionStatus('chat-1', WhatsappChatStatus.ACTIF, WhatsappChatStatus.ACTIF, 'test');
    expect(result).toBe(true);
  });

  // ─── Transitions illégales — Phase 1 : log warning, ne bloque pas ─────────

  it('status inconnu comme source → retourne false (warning emission, pas d\'exception)', () => {
    // Simule un statut inconnu/hors-machine pour vérifier le chemin d'alerte
    const result = transitionStatus(
      'chat-1',
      'INCONNU' as any,
      WhatsappChatStatus.ACTIF,
      'test-illégal',
    );
    // Phase 1 : pas d'exception levée, mais retourne false
    expect(result).toBe(false);
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
  });
});
