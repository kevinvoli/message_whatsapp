import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Repository } from 'typeorm';

@Injectable()
export class FirstResponseTimeoutJob {
  // ✅ DÉCLARATION OBLIGATOIRE
  private readonly agentSlaIntervals = new Map<string, NodeJS.Timeout>();
  private readonly autoMessageIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly messageAutoService: MessageAutoService,
  ) {}

  startAgentSlaMonitor(posteId: string) {
    if (this.agentSlaIntervals.has(posteId)) return;

    // ⚠️ PAS async ici
    const interval = setInterval(() => {
      // ✅ encapsulation propre de l’async
      console.log(
        'runner est dans la place:___________________________________________________________________________________',
        posteId,
      );

      //   void (async () => {
      //  await this.dispatcher.jobRunnertcheque(posteId)
      //   })();
    }, 60_000); // chaque minute

    this.agentSlaIntervals.set(posteId, interval);
  }
  stopAgentSlaMonitor(agentId: string) {
    const interval = this.agentSlaIntervals.get(agentId);

    if (interval) {
      clearInterval(interval);
      this.agentSlaIntervals.delete(agentId);
    }
  }

  testAutoMessage(chatId: string, position: number) {
  if (this.autoMessageIntervals.has(chatId)) return;

  // Marquer que le message a été envoyé pour ne pas réexécuter
  // this.autoMessageIntervals.set(chatId, true)

  // console.log('Envoi d’un seul message', chatId);

  // void this.messageAutoService.sendAutoMessage(chatId, position);
}
  // testAutoMessage(chatId: string, position: number) {
  //   if (this.autoMessageIntervals.has(chatId)) return;
  //   const interval = setInterval(() => {
  //     console.log(
  //       Math.floor(Math.random() * 10),
  //       chatId,
  //       this.autoMessageIntervals.has(chatId),
  //     );

  //     void this.messageAutoService.sendAutoMessage(chatId, position);
  //   }, 60_00);
  //   this.autoMessageIntervals.set(chatId, interval);
  // }

  // stopAutoMessage(chatId: string) {
  //   const interval = this.autoMessageIntervals.get(chatId);
  //   if (!interval) return;

  //   clearInterval(interval);
  //   this.autoMessageIntervals.delete(chatId);

  //   console.log('🛑 auto message arrêté', chatId);
  // }
}
