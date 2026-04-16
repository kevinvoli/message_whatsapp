import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { createHmac } from 'crypto';
import { OutboundWebhook } from './entities/outbound-webhook.entity';
import { OutboundWebhookLog, WebhookDeliveryStatus } from './entities/outbound-webhook-log.entity';

export class CreateWebhookDto {
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  max_retries?: number;
  retry_delay_seconds?: number;
}

export class UpdateWebhookDto {
  name?: string;
  url?: string;
  events?: string[];
  secret?: string;
  max_retries?: number;
  retry_delay_seconds?: number;
  is_active?: boolean;
}

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  constructor(
    @InjectRepository(OutboundWebhook)
    private readonly webhookRepo: Repository<OutboundWebhook>,
    @InjectRepository(OutboundWebhookLog)
    private readonly logRepo: Repository<OutboundWebhookLog>,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateWebhookDto): Promise<OutboundWebhook> {
    return this.webhookRepo.save(this.webhookRepo.create(dto));
  }

  async findAll(tenantId: string): Promise<OutboundWebhook[]> {
    return this.webhookRepo.find({
      where: { tenant_id: tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, tenantId: string, dto: UpdateWebhookDto): Promise<OutboundWebhook> {
    const wh = await this.webhookRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!wh) throw new NotFoundException(`Webhook ${id} introuvable`);
    Object.assign(wh, dto);
    return this.webhookRepo.save(wh);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const wh = await this.webhookRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!wh) throw new NotFoundException(`Webhook ${id} introuvable`);
    await this.webhookRepo.delete(wh.id);
  }

  async getLogs(webhookId: string, limit = 50): Promise<OutboundWebhookLog[]> {
    return this.logRepo.find({
      where: { webhook_id: webhookId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  // ─── Dispatch ─────────────────────────────────────────────────────────────

  /**
   * Déclenche tous les webhooks actifs du tenant qui écoutent cet événement.
   * L'appel HTTP est asynchrone et non-bloquant (fire-and-forget avec retry).
   */
  async dispatch(
    tenantId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.webhookRepo
      .createQueryBuilder('wh')
      .addSelect('wh.secret') // secret est select:false par défaut → forcer
      .where('wh.tenant_id = :tenantId', { tenantId })
      .andWhere('wh.is_active = true')
      .getMany();

    const matching = webhooks.filter((wh) => wh.events.includes(event) || wh.events.includes('*'));

    for (const wh of matching) {
      // Créer le log avant l'envoi (PENDING)
      const log = await this.logRepo.save(
        this.logRepo.create({
          webhook_id: wh.id,
          event,
          payload,
          status: WebhookDeliveryStatus.PENDING,
          attempt: 0,
        }),
      );

      // Envoyer de façon asynchrone sans bloquer
      this.deliverWithRetry(wh, log, payload).catch((err) => {
        this.logger.error(`deliverWithRetry unhandled: ${err}`);
      });
    }
  }

  // ─── Livraison avec retry ─────────────────────────────────────────────────

  private async deliverWithRetry(
    wh: OutboundWebhook,
    log: OutboundWebhookLog,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let attempt = 0;
    const maxRetries = wh.max_retries ?? 3;
    const baseDelay = (wh.retry_delay_seconds ?? 60) * 1000;

    while (attempt <= maxRetries) {
      attempt++;
      log.attempt = attempt;

      const body = JSON.stringify({ event: log.event, payload, timestamp: new Date().toISOString() });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': log.event,
        'X-Delivery-Attempt': String(attempt),
      };

      // Signature HMAC si secret configuré
      if (wh.secret) {
        const sig = createHmac('sha256', wh.secret).update(body).digest('hex');
        headers['X-Signature-256'] = `sha256=${sig}`;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const res = await fetch(wh.url, { method: 'POST', headers, body, signal: controller.signal });
        clearTimeout(timeout);

        const responseBody = await res.text().catch(() => '');
        log.response_status = res.status;
        log.response_body = responseBody.slice(0, 1000);

        if (res.ok) {
          log.status = WebhookDeliveryStatus.SUCCESS;
          log.error = null;
          await this.logRepo.save(log);
          return; // Succès — sortir
        }

        // HTTP non-2xx : réessayer
        log.error = `HTTP ${res.status}`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error = msg.slice(0, 500);
        log.response_status = null;
      }

      if (attempt > maxRetries) {
        log.status = WebhookDeliveryStatus.FAILED;
        log.next_retry_at = null;
        await this.logRepo.save(log);
        this.logger.warn(`Webhook ${wh.id} échoué après ${maxRetries} tentatives`);
        return;
      }

      // Délai exponentiel avant le prochain essai
      const delay = baseDelay * Math.pow(2, attempt - 1);
      log.status = WebhookDeliveryStatus.RETRYING;
      log.next_retry_at = new Date(Date.now() + delay);
      await this.logRepo.save(log);

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // ─── Test manuel ──────────────────────────────────────────────────────────

  async testWebhook(id: string, tenantId: string): Promise<{ status: number | null; error: string | null }> {
    const wh = await this.webhookRepo
      .createQueryBuilder('wh')
      .addSelect('wh.secret')
      .where('wh.id = :id AND wh.tenant_id = :tenantId', { id, tenantId })
      .getOne();

    if (!wh) throw new NotFoundException(`Webhook ${id} introuvable`);

    const payload = { event: 'test', payload: { message: 'Test webhook' }, timestamp: new Date().toISOString() };
    const body = JSON.stringify(payload);

    try {
      const res = await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Event': 'test' },
        body,
      });
      return { status: res.status, error: null };
    } catch (err) {
      return { status: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
