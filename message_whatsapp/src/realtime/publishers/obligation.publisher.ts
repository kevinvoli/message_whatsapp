import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeServerService } from '../realtime-server.service';
import { ObligationStatus } from 'src/call-obligations/call-obligation.service';

@Injectable()
export class ObligationPublisher {
  private readonly logger = new Logger(ObligationPublisher.name);

  constructor(
    private readonly realtimeServer: RealtimeServerService,
  ) {}

  @OnEvent('call_obligation.matched', { async: true })
  async handleObligationMatched(payload: {
    posteId: string;
    obligationStatus: ObligationStatus | null;
  }): Promise<void> {
    const server = this.realtimeServer.getServer();
    server.to('poste:' + payload.posteId).emit('chat:event', {
      type: 'OBLIGATION_UPDATED',
      payload: payload.obligationStatus,
    });
    this.logger.log('OBLIGATION_UPDATED -> poste:' + payload.posteId);
  }
}
