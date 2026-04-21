import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeServerService } from '../realtime-server.service';
import {
  WindowRotatedPayload,
  WINDOW_ROTATED_EVENT,
  WindowCriterionValidatedPayload,
  WINDOW_CRITERION_VALIDATED_EVENT,
} from 'src/window/services/window-rotation.service';
import { ValidationEngineService } from 'src/window/services/validation-engine.service';

@Injectable()
export class WindowPublisher {
  private readonly logger = new Logger(WindowPublisher.name);

  constructor(
    private readonly realtimeServer: RealtimeServerService,
    private readonly validationEngine: ValidationEngineService,
  ) {}

  /**
   * Écoute la rotation de fenêtre et pousse deux événements socket au poste :
   * 1. WINDOW_ROTATED   → déclenche l'animation frontend
   * 2. WINDOW_BLOCK_PROGRESS → reset la barre de progression
   */
  @OnEvent(WINDOW_ROTATED_EVENT, { async: true })
  async handleWindowRotated(payload: WindowRotatedPayload): Promise<void> {
    const server = this.realtimeServer.getServer();

    server.to(`poste:${payload.posteId}`).emit('chat:event', {
      type: 'WINDOW_ROTATED',
      payload: {
        releasedChatIds: payload.releasedChatIds,
        promotedChatIds: payload.promotedChatIds,
      },
    });

    const progress = await this.validationEngine.getBlockProgress(payload.posteId);
    server.to(`poste:${payload.posteId}`).emit('chat:event', {
      type: 'WINDOW_BLOCK_PROGRESS',
      payload: progress,
    });

    this.logger.log(
      `Window events emitted → poste:${payload.posteId} (rotation + progress reset)`,
    );
  }

  /**
   * Écoute la validation d'un critère et pousse immédiatement la progression au poste.
   * Permet au commercial de voir la barre avancer sans attendre la rotation.
   */
  @OnEvent(WINDOW_CRITERION_VALIDATED_EVENT, { async: true })
  async handleCriterionValidated(payload: WindowCriterionValidatedPayload): Promise<void> {
    await this.emitBlockProgress(payload.posteId);
  }

  /**
   * Pousse la progression du bloc au poste.
   */
  async emitBlockProgress(posteId: string): Promise<void> {
    const progress = await this.validationEngine.getBlockProgress(posteId);
    this.realtimeServer.getServer().to(`poste:${posteId}`).emit('chat:event', {
      type: 'WINDOW_BLOCK_PROGRESS',
      payload: progress,
    });
    this.logger.debug(`WINDOW_BLOCK_PROGRESS → poste:${posteId} (${progress.validated}/${progress.total})`);
  }
}
