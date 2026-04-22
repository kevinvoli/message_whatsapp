import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: (req) => {
        if (req?.cookies?.['Authentication']) {
          return req.cookies['Authentication'];
        }
        const authHeader = req?.headers?.['authorization'];
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          return authHeader.slice(7);
        }
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
      posteId: payload.posteId,
    };
  }
}
