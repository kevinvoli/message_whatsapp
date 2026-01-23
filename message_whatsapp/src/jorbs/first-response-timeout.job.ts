import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import {
  WhatsappChat,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import {  Repository } from 'typeorm';

@Injectable()
export class FirstResponseTimeoutJob {
  // ✅ DÉCLARATION OBLIGATOIRE
  private readonly agentIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    
  ) {}

  startAgentSlaMonitor(agentId: string) {

    if (this.agentIntervals.has(agentId)) return;

    // ⚠️ PAS async ici
    const interval = setInterval(() => {
      // ✅ encapsulation propre de l’async
      console.log("runner est dans la place:___________________________________________________________________________________",agentId);
      
      void (async () => {
     await this.dispatcher.jobRunnertcheque(agentId)
      })();
    }, 60_000); // chaque minute

    this.agentIntervals.set(agentId, interval);
  }
  stopAgentSlaMonitor(agentId: string) {
    const interval = this.agentIntervals.get(agentId);

    if (interval) {
      clearInterval(interval);
      this.agentIntervals.delete(agentId);
    }
  }
}
