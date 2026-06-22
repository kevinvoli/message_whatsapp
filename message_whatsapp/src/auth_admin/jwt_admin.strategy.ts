// src/auth_admin/jwt_admin.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import {
  AdminAuthenticatedUser,
  JwtAdminPayload,
} from 'src/auth/shared/base-auth-user.types';

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: (req: Request): string | null => {
        return (req?.cookies?.['AuthenticationAdmin'] as string | undefined) ?? null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'), // Use the same JWT secret for now
    });
  }

  validate(payload: JwtAdminPayload): AdminAuthenticatedUser {
    return { userId: payload.sub, email: payload.email, name: payload.name };
  }
}
