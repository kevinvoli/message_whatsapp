import { SlaPolicyService } from './sla-policy.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

/**
 * TICKET-10-B — Tests unitaires SlaPolicyService.
 * Toutes les règles SLA sont testées sans I/O (purement fonctionnel).
 */
describe('SlaPolicyService', () => {
  let service: SlaPolicyService;

  beforeEach(() => {
    service = new SlaPolicyService();
  });

  // ─── buildThreshold ────────────────────────────────────────────────────────

  describe('buildThreshold', () => {
    it('retourne une date dans le passé correspondant à N minutes', () => {
      const before = Date.now();
      const threshold = service.buildThreshold(120);
      const after = Date.now();

      expect(threshold.getTime()).toBeLessThanOrEqual(before - 120 * 60_000);
      expect(threshold.getTime()).toBeGreaterThanOrEqual(after - 120 * 60_000 - 100);
    });
  });

  // ─── shouldReinject ────────────────────────────────────────────────────────

  describe('shouldReinject', () => {
    const threshold = new Date(Date.now() - 60 * 60_000); // seuil = il y a 60 min

    it('SLA-01 : unread > 0 et message avant seuil → doit réinjecter', () => {
      const chat = {
        unread_count: 3,
        last_client_message_at: new Date(Date.now() - 90 * 60_000), // il y a 90 min
        status: WhatsappChatStatus.ACTIF,
      } as WhatsappChat;

      expect(service.shouldReinject(chat, threshold)).toBe(true);
    });

    it('SLA-02 : unread = 0 → ne pas réinjecter (commercial a lu)', () => {
      const chat = {
        unread_count: 0,
        last_client_message_at: new Date(Date.now() - 90 * 60_000),
        status: WhatsappChatStatus.ACTIF,
      } as WhatsappChat;

      expect(service.shouldReinject(chat, threshold)).toBe(false);
    });

    it('SLA-03 : message après seuil → SLA pas encore dépassé', () => {
      const chat = {
        unread_count: 2,
        last_client_message_at: new Date(Date.now() - 30 * 60_000), // il y a 30 min
        status: WhatsappChatStatus.ACTIF,
      } as WhatsappChat;

      expect(service.shouldReinject(chat, threshold)).toBe(false);
    });

    it('SLA-04 : last_client_message_at = null → ne pas réinjecter', () => {
      const chat = {
        unread_count: 5,
        last_client_message_at: null,
        status: WhatsappChatStatus.EN_ATTENTE,
      } as unknown as WhatsappChat;

      expect(service.shouldReinject(chat, threshold)).toBe(false);
    });
  });

  // ─── isBusinessHours ──────────────────────────────────────────────────────

  describe('isBusinessHours', () => {
    it('retourne un booleen coherent avec l\'heure courante', () => {
      const hour = new Date().getHours();
      const expected = hour >= 5 && hour < 21;
      expect(service.isBusinessHours()).toBe(expected);
    });
  });

  // ─── deadlines ────────────────────────────────────────────────────────────

  describe('initialDeadline', () => {
    it('retourne une date ~5 min dans le futur', () => {
      const before = Date.now();
      const deadline = service.initialDeadline();
      const after = Date.now();

      expect(deadline.getTime()).toBeGreaterThanOrEqual(before + 4 * 60_000);
      expect(deadline.getTime()).toBeLessThanOrEqual(after + 6 * 60_000);
    });
  });

  describe('reinjectDeadline', () => {
    it('retourne une date ~30 min dans le futur', () => {
      const before = Date.now();
      const deadline = service.reinjectDeadline();
      const after = Date.now();

      expect(deadline.getTime()).toBeGreaterThanOrEqual(before + 29 * 60_000);
      expect(deadline.getTime()).toBeLessThanOrEqual(after + 31 * 60_000);
    });
  });

  describe('redispatchDeadline', () => {
    it('retourne une date ~15 min dans le futur', () => {
      const before = Date.now();
      const deadline = service.redispatchDeadline();
      const after = Date.now();

      expect(deadline.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);
      expect(deadline.getTime()).toBeLessThanOrEqual(after + 16 * 60_000);
    });
  });

  // ─── slaEligibleStatuses ──────────────────────────────────────────────────

  describe('slaEligibleStatuses', () => {
    it('inclut EN_ATTENTE et ACTIF uniquement', () => {
      const statuses = service.slaEligibleStatuses();
      expect(statuses).toContain(WhatsappChatStatus.EN_ATTENTE);
      expect(statuses).toContain(WhatsappChatStatus.ACTIF);
      expect(statuses).not.toContain(WhatsappChatStatus.FERME);
    });
  });
});
