import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { GeoAccessService } from './geo_access.service';
import {
  CommercialAuthenticatedUser,
  AdminAuthenticatedUser,
} from '../auth/shared/base-auth-user.types';

type AuthenticatedRequest = Request & {
  user?: CommercialAuthenticatedUser | AdminAuthenticatedUser;
};

const PUBLIC_PREFIXES = ['/auth/login', '/auth/auto-login', '/webhooks', '/health', '/uploads'];

function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? '';
}

@Injectable()
export class IpAccessGuard implements CanActivate {
  constructor(private readonly geoAccessService: GeoAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path: string = req.path ?? req.url ?? '';

    if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    if (!req.user) {
      return true;
    }

    const zones = await this.geoAccessService.findAll();
    if (zones.length === 0) {
      return true;
    }

    const commercialId = 'userId' in req.user ? req.user.userId : null;
    const posteId =
      'posteId' in req.user && req.user.posteId ? req.user.posteId : null;

    const exempt = await this.geoAccessService.isExempt(commercialId, posteId);
    if (exempt) {
      return true;
    }

    const ip = extractIp(req);
    const allowed = await this.geoAccessService.isIpAllowed(ip);
    if (!allowed) {
      throw new ForbiddenException(
        'Accès refusé : votre adresse IP ne fait pas partie des plages autorisées.',
      );
    }

    return true;
  }
}
