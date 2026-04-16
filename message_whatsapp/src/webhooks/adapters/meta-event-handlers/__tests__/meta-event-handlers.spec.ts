/**
 * P4.1 — Tests unitaires des handlers Meta non-message
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SecurityEventHandler } from '../security.handler';
import { AccountAlertsHandler } from '../account-alerts.handler';
import { TemplateStatusHandler } from '../template-status.handler';
import { AccountUpdateHandler } from '../account-update.handler';
import { MetaNonMessageHandler } from '../meta-non-message.handler';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { MetaEventContext } from '../meta-event.interface';
import { META_TEMPLATE_STATUS_EVENT } from '../template-status.handler';

const makeCtx = (): MetaEventContext => ({
  tenantId: 'tenant-1',
  channelId: 'channel-1',
});

const makeSystemAlert = () => ({
  onSecurityEvent: jest.fn().mockResolvedValue(undefined),
});

describe('Meta Event Handlers (P4.1)', () => {
  const systemAlert = makeSystemAlert();

  beforeEach(() => jest.clearAllMocks());

  // ── SecurityEventHandler ────────────────────────────────────────────────────

  describe('SecurityEventHandler', () => {
    it('appelle onSecurityEvent avec severity=high', async () => {
      const handler = new SecurityEventHandler(systemAlert as any);
      await handler.handle({ type: 'security', data: { reason: 'suspicious_login' } }, makeCtx());
      expect(systemAlert.onSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'high', source: 'meta_webhook' }),
      );
    });
  });

  // ── AccountAlertsHandler ────────────────────────────────────────────────────

  describe('AccountAlertsHandler', () => {
    it('envoie alerte critique pour PAYMENT_ISSUE', async () => {
      const handler = new AccountAlertsHandler(systemAlert as any);
      await handler.handle(
        { type: 'account_alerts', alerts: [{ type: 'PAYMENT_ISSUE', message: 'Paiement refusé' }] },
        makeCtx(),
      );
      expect(systemAlert.onSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('envoie alerte medium pour RATE_LIMIT_HIT', async () => {
      const handler = new AccountAlertsHandler(systemAlert as any);
      await handler.handle(
        { type: 'account_alerts', alerts: [{ type: 'RATE_LIMIT_HIT' }] },
        makeCtx(),
      );
      expect(systemAlert.onSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'medium' }),
      );
    });

    it('ne fait rien si alerts est vide', async () => {
      const handler = new AccountAlertsHandler(systemAlert as any);
      await handler.handle({ type: 'account_alerts', alerts: [] }, makeCtx());
      expect(systemAlert.onSecurityEvent).not.toHaveBeenCalled();
    });
  });

  // ── TemplateStatusHandler ───────────────────────────────────────────────────

  describe('TemplateStatusHandler', () => {
    it('émet META_TEMPLATE_STATUS_EVENT avec les bonnes données', () => {
      const emitter = { emit: jest.fn() };
      const handler = new TemplateStatusHandler(emitter as any);

      handler.handle(
        {
          messageTemplateId: 'meta-tpl-123',
          messageTemplateName: 'bienvenue',
          event: 'APPROVED',
        },
        makeCtx(),
      );

      expect(emitter.emit).toHaveBeenCalledWith(
        META_TEMPLATE_STATUS_EVENT,
        expect.objectContaining({
          metaTemplateId: 'meta-tpl-123',
          newStatus: 'APPROVED',
        }),
      );
    });

    it('inclut le motif si REJECTED', () => {
      const emitter = { emit: jest.fn() };
      const handler = new TemplateStatusHandler(emitter as any);

      handler.handle(
        {
          messageTemplateId: 'meta-tpl-456',
          messageTemplateName: 'promo',
          event: 'REJECTED',
          reason: 'Contenu promotionnel non conforme',
        },
        makeCtx(),
      );

      expect(emitter.emit).toHaveBeenCalledWith(
        META_TEMPLATE_STATUS_EVENT,
        expect.objectContaining({ reason: 'Contenu promotionnel non conforme' }),
      );
    });
  });

  // ── AccountUpdateHandler ────────────────────────────────────────────────────

  describe('AccountUpdateHandler', () => {
    const channelRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    it('envoie alerte critique si ban_info présent', async () => {
      const handler = new AccountUpdateHandler(channelRepo as any, systemAlert as any);
      await handler.handle(
        { ban_info: { waba_ban_state: 'BANNED' } },
        makeCtx(),
      );
      expect(systemAlert.onSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('envoie alerte high si restriction_info présent', async () => {
      const handler = new AccountUpdateHandler(channelRepo as any, systemAlert as any);
      await handler.handle(
        { restriction_info: [{ restriction_type: 'MESSAGING' }] },
        makeCtx(),
      );
      expect(systemAlert.onSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'high' }),
      );
    });
  });

  // ── MetaNonMessageHandler ───────────────────────────────────────────────────

  describe('MetaNonMessageHandler', () => {
    it('route security vers SecurityEventHandler', async () => {
      const securityHandler = { handle: jest.fn().mockResolvedValue(undefined) };
      const handler = new MetaNonMessageHandler(
        securityHandler as any,
        { handle: jest.fn().mockResolvedValue(undefined) } as any,
        { handle: jest.fn() } as any,
        { handle: jest.fn().mockResolvedValue(undefined) } as any,
      );

      await handler.handle(
        {
          entry: [
            {
              id: 'waba-1',
              changes: [{ field: 'security', value: { type: 'security', data: {} } }],
            },
          ],
        } as any,
        makeCtx(),
      );

      expect(securityHandler.handle).toHaveBeenCalled();
    });

    it('ignore les messages normaux (field=messages)', async () => {
      const securityHandler = { handle: jest.fn().mockResolvedValue(undefined) };
      const handler = new MetaNonMessageHandler(
        securityHandler as any,
        { handle: jest.fn().mockResolvedValue(undefined) } as any,
        { handle: jest.fn() } as any,
        { handle: jest.fn().mockResolvedValue(undefined) } as any,
      );

      await handler.handle(
        {
          entry: [
            {
              id: 'waba-1',
              changes: [{ field: 'messages', value: {} }],
            },
          ],
        } as any,
        makeCtx(),
      );

      expect(securityHandler.handle).not.toHaveBeenCalled();
    });

    it('ne lève pas d\'exception si un handler échoue', async () => {
      const securityHandler = { handle: jest.fn().mockRejectedValue(new Error('network error')) };
      const handler = new MetaNonMessageHandler(
        securityHandler as any,
        { handle: jest.fn().mockResolvedValue(undefined) } as any,
        { handle: jest.fn() } as any,
        { handle: jest.fn().mockResolvedValue(undefined) } as any,
      );

      await expect(
        handler.handle(
          {
            entry: [
              { id: 'waba-1', changes: [{ field: 'security', value: {} }] },
            ],
          } as any,
          makeCtx(),
        ),
      ).resolves.not.toThrow();
    });
  });
});
