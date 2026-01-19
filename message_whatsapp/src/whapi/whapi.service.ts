import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import {
  WhapiMessage,
  WhapiWebhookPayload,
} from './interface/whapi-webhook.interface';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { DispatcherOrchestrator } from 'src/dispatcher/orchestrator/dispatcher.orchestrator';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { NotFoundError } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly dispatcherOrchestrator: DispatcherOrchestrator,
    private readonly whatsappMessageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
          @InjectRepository(WhatsappChat)
        private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  async handleIncomingMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.messages?.length) return;

    const message = payload.messages[0];

    // 🔒 ignorer les messages envoyés par ton propre compte
    if (message.from_me) return;

    try {
      //  1️⃣ Dispatcher (assignation agent ou pending)
      await this.dispatcherOrchestrator.handleIncomingMessage(message);

    } catch (error) {
      console.log(error);

      throw new NotFoundException(error);
    }
  }

  async updateStatusMessage(payload: WhapiWebhookPayload): Promise<void> {
    if (!payload?.statuses?.length) return;

    for (const status of payload.statuses) {
      await this.whatsappMessageService.updateByStatus(status);

      this.logger.log(`📌 Status update | msg=${status.id} | ${status.status}`);
    }
  }

  // =========================
  // UTIL
  // =========================
}
