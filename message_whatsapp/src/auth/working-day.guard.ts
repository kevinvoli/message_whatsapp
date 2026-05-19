import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SystemConfigService } from 'src/system-config/system-config.service';

@Injectable()
export class WorkingDayGuard implements CanActivate {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const restrict = await this.systemConfigService.getBoolean(
      'RESTRICT_LOGIN_TO_WORKING_DAYS',
      false,
    );
    if (!restrict) return true;

    const req = ctx.switchToHttp().getRequest();
    if (!req.user?.isWorkingToday) {
      throw new ForbiddenException(
        "Connexion non autorisée : ce n'est pas votre jour de travail.",
      );
    }
    return true;
  }
}
