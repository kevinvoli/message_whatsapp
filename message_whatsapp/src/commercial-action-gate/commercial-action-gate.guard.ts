import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommercialActionGateService } from './commercial-action-gate.service';

interface JwtUser { userId: string; }

/**
 * E04-T03 — Guard branché sur les actions critiques du commercial.
 * Bloque uniquement si le gate retourne 'block' (pas 'warn' ni 'redirect_to_task').
 * À appliquer via @UseGuards(CommercialActionGateGuard) sur les routes JWT commerciales.
 */
@Injectable()
export class CommercialActionGateGuard implements CanActivate {
  private readonly logger = new Logger(CommercialActionGateGuard.name);

  constructor(private readonly gateService: CommercialActionGateService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const userId = req.user?.userId;

    if (!userId) return true;

    const result = await this.gateService.evaluate(userId);

    if (result.status === 'block') {
      this.logger.warn(
        `ACTION_GATE_BLOCKED userId=${userId} code=${result.primaryCode ?? '-'} label="${result.primaryLabel ?? '-'}"`,
      );
      throw new UnprocessableEntityException({
        gateStatus:   result.status,
        code:         result.primaryCode,
        label:        result.primaryLabel,
        blockers:     result.blockers,
      });
    }

    return true;
  }
}
