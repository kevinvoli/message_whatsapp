import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Guard optionnel pour les endpoints de réception d'événements d'appels.
 * Si CALL_EVENT_API_KEY n'est pas configuré (dev / recette), tout passe.
 * En production, le header `x-api-key` doit correspondre exactement.
 */
@Injectable()
export class CallEventApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const apiKey = process.env.CALL_EVENT_API_KEY;
    if (!apiKey) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const provided = request.headers['x-api-key'];

    if (provided !== apiKey) {
      throw new UnauthorizedException('API key invalide ou absente');
    }
    return true;
  }
}
