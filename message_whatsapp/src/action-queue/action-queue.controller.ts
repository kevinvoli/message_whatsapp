import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActionQueueService, ActionTaskSource, ActionTaskStatus } from './action-queue.service';

@Controller('action-queue')
@UseGuards(AuthGuard('jwt'))
export class ActionQueueController {
  constructor(private readonly service: ActionQueueService) {}

  /** File complète du commercial connecté. */
  @Get('mine')
  getMyQueue(@Request() req) {
    return this.service.getMyQueue(req.user.userId as string);
  }

  /** File appels en absence (pour le poste du commercial). */
  @Get('missed-calls')
  async getMissedCalls(@Request() req) {
    const posteId = await this['_posteId'](req.user.userId);
    return this.service.getMissedCallItems(posteId);
  }

  /** File messages non répondus. */
  @Get('unanswered')
  async getUnanswered(@Request() req) {
    const posteId = await this['_posteId'](req.user.userId);
    return this.service.getUnansweredItems(posteId);
  }

  /** File prospects sans commande. */
  @Get('prospects')
  async getProspects(@Request() req) {
    const posteId = await this['_posteId'](req.user.userId);
    return this.service.getProspectItems(req.user.userId, posteId);
  }

  /** Met à jour / enregistre le résultat d'un traitement de tâche. */
  @Post(':entityId/:source')
  saveTask(
    @Request() req,
    @Param('entityId') entityId: string,
    @Param('source') source: ActionTaskSource,
    @Body() body: {
      status:       ActionTaskStatus;
      nextAction?:  string;
      dueAt?:       string;
      formData?:    Record<string, unknown>;
      notes?:       string;
      audioUrl?:    string;
      contactName?: string;
      contactPhone?: string;
    },
  ) {
    return this.service.saveTask({
      source,
      entityId,
      commercialId:  req.user.userId as string,
      contactName:   body.contactName,
      contactPhone:  body.contactPhone,
      status:        body.status,
      nextAction:    body.nextAction,
      dueAt:         body.dueAt ? new Date(body.dueAt) : null,
      formData:      body.formData,
      notes:         body.notes,
      audioUrl:      body.audioUrl,
    });
  }

  private async _posteId(commercialId: string): Promise<string | null> {
    return this.service['getPosteId'](commercialId);
  }
}
