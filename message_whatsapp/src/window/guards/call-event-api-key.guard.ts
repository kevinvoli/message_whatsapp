import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Guard webhook appels entrants.
 * Valide le header `x-api-key` contre la variable d'env CALL_EVENT_API_KEY.
 * Si la variable n'est pas configurée, le guard laisse passer (mode dégradé toléré en dev).
 */
@Injectable()
export class CallEventApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedKey = process.env.CALL_EVENT_API_KEY;
    if (!expectedKey) return true; // non configuré → permissif (dev uniquement)

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const provided = request.headers['x-api-key'];

    if (!provided || provided !== expectedKey) {
      throw new UnauthorizedException('Clé API invalide ou absente');
    }
    return true;
  }
}
