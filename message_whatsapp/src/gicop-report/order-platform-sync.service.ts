import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

export interface ReportPayload {
  chat_id:            string;
  commercial_name:    string;
  commercial_phone:   string | null;
  commercial_email:   string | null;
  client_name:        string | null;
  ville:              string | null;
  commune:            string | null;
  quartier:           string | null;
  product_category:   string | null;
  client_need:        string | null;
  interest_score:     number | null;
  next_action:        string | null;
  follow_up_at:       string | null;
  notes:              string | null;
  submitted_at:       string;
}

export interface SyncResult {
  ok: boolean;
  error?: string;
}

@Injectable()
export class OrderPlatformSyncService {
  private readonly logger = new Logger(OrderPlatformSyncService.name);

  async send(payload: ReportPayload): Promise<SyncResult> {
    const endpoint = process.env.ORDER_PLATFORM_REPORT_URL;
    if (!endpoint) {
      this.logger.warn('ORDER_PLATFORM_REPORT_URL non configuré — soumission ignorée');
      return { ok: false, error: 'ORDER_PLATFORM_REPORT_URL non configuré' };
    }

    try {
      await axios.post(endpoint, payload, {
        timeout: 10_000,
        headers: { 'Content-Type': 'application/json' },
      });
      this.logger.log(`Rapport soumis OK: chat=${payload.chat_id} commercial=${payload.commercial_email ?? payload.commercial_phone}`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof AxiosError
        ? `HTTP ${err.response?.status ?? 'N/A'} — ${err.message}`
        : String(err);
      this.logger.error(`Soumission rapport échouée: ${msg}`, { chat_id: payload.chat_id });
      return { ok: false, error: msg };
    }
  }
}
