import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Rafraîchit le cookie AuthenticationAdmin après chaque requête admin
 * authentifiée avec succès, prolongeant ainsi la session de 24h à partir
 * du dernier appel. Tant que l'admin est actif, il ne sera jamais déconnecté.
 */
@Injectable()
export class AdminTokenRefreshInterceptor implements NestInterceptor {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const http = context.switchToHttp();
        const req = http.getRequest<{
          cookies?: Record<string, string>;
          user?: unknown;
        }>();
        const res = http.getResponse<{
          cookie: (name: string, value: string, options: object) => void;
        }>();

        // Ne rafraîchir que si la requête était authentifiée en tant qu'admin
        const adminCookie = req.cookies?.['AuthenticationAdmin'];
        if (!adminCookie || !req.user) return;

        try {
          // Décoder le payload sans re-vérifier (le guard l'a déjà fait)
          const decoded = this.jwtService.decode(adminCookie) as Record<
            string,
            unknown
          > | null;
          if (!decoded) return;

          // Retirer les claims JWT automatiques avant de re-signer
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { iat, exp, ...payload } = decoded;

          const newToken = this.jwtService.sign(payload, {
            expiresIn: '24h',
          });

          res.cookie('AuthenticationAdmin', newToken, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24h en ms
            sameSite: 'lax',
            secure: this.configService.get<string>('NODE_ENV') === 'production',
          });
        } catch {
          // Fail silencieux — ne jamais interrompre la réponse pour un refresh
        }
      }),
    );
  }
}
