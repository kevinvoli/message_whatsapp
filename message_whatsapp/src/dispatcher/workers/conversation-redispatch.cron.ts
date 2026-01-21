import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConversationRedispatchWorker } from '../services/ConversationRedispatchWorker.service';


@Injectable()
export class ConversationRedispatchCron {
  ConversationRedispatchWorker: any;
  constructor(
    private readonly redispatchWorker: ConversationRedispatchWorker,
  ) {}

  @Cron('*/10 * * * * *') // toutes les 10 secondes
  async handleRedispatchChat() {
    console.log("ma sous routine dispatcher:");
    
    await this.redispatchWorker.run();
  }

  @Cron('*/10 * */12 * * *') // toutes les 10 secondes
  async handleRedispatchCommercial() {
    console.log("ma sous routine commercial:");
    await this.redispatchWorker.run();
  }
}
