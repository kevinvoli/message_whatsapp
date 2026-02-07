// src/auth_admin/jwt_admin.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: (req) => {

        let token = null;
        if (req && req.cookies) {
          token = req.cookies['AuthenticationAdmin'];

        }
        // console.log("ma requete de guard", token);

        // console.log("ma requete de guard", req.cookies);

        return token;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'), // Use the same JWT secret for now
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email, name: payload.name };
  }
}
