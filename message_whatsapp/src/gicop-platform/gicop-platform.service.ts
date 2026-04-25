import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

export interface GicopCallPayload {
  number:   string;
  poste_id: number;
  type:     string;
}

@Injectable()
export class GicopPlatformService {
  private readonly logger = new Logger(GicopPlatformService.name);
  private readonly endpoint = 'https://gicop.ci/whatsapp_numbers_to_call.php';

  async sendNumberToCall(payload: GicopCallPayload): Promise<void> {
    try {
      await axios.post(this.endpoint, payload, {
        timeout: 8_000,
        headers: { 'Content-Type': 'application/json' },
      });
      this.logger.log(
        `GICOP_PLATFORM sent: number=${payload.number} poste=${payload.poste_id} type=${payload.type}`,
      );
    } catch (err) {
      const msg = err instanceof AxiosError
        ? `HTTP ${err.response?.status ?? 'N/A'} — ${err.message}`
        : String(err);
      this.logger.error(`GICOP_PLATFORM failed: ${msg}`, { payload });
      // On ne propage pas l'erreur : l'échec de la plateforme externe ne doit pas
      // bloquer la clôture locale de la conversation.
    }
    
  }
}
